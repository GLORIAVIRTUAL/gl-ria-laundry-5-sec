import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const CASH_ROLES = new Set(['super_admin', 'admin', 'manager', 'cashier']);
const MANAGER_ROLES = new Set(['super_admin', 'admin', 'manager']);
const SENSITIVE_MOVEMENTS = new Set(['withdrawal', 'refund', 'adjustment_in', 'adjustment_out']);

function canAccessUnit(user: any, unitId?: string) {
  if (!unitId || ['super_admin', 'admin'].includes(user?.role)) return true;
  return new Set([user?.primary_unit_id, ...(user?.allowed_unit_ids || [])].filter(Boolean)).has(unitId);
}

function signedAmount(movement: any) {
  return ['withdrawal', 'refund', 'adjustment_out'].includes(movement.movement_type)
    ? -Math.abs(Number(movement.amount || 0))
    : Math.abs(Number(movement.amount || 0));
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  try {
    if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed', request_id: requestId }, { status: 405 });

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'authentication_required', request_id: requestId }, { status: 401 });
    if (!CASH_ROLES.has(user.role || 'cashier') && !(user.permissions || []).includes('cash.manage')) {
      return Response.json({ error: 'forbidden', request_id: requestId }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action;

    if (action === 'open') {
      const unitId = body.unit_id || user.primary_unit_id;
      if (!unitId || !canAccessUnit(user, unitId)) return Response.json({ error: 'forbidden_unit', request_id: requestId }, { status: 403 });

      const existing = await base44.asServiceRole.entities.CashSession.filter({
        unit_id: unitId,
        operator_user_id: user.id,
        status: 'open',
      });
      if (existing.length > 0) return Response.json({ cash_session: existing[0], duplicate: true, request_id: requestId });

      const openingAmount = Math.max(0, Number(body.opening_amount || 0));
      const session = await base44.asServiceRole.entities.CashSession.create({
        unit_id: unitId,
        operator_user_id: user.id,
        operator_name: user.full_name || user.display_name || user.email,
        status: 'open',
        opened_at: new Date().toISOString(),
        opening_amount: openingAmount,
        expected_cash_amount: openingAmount,
        income_amount: 0,
        supply_amount: 0,
        withdrawal_amount: 0,
        refund_amount: 0,
        notes: body.notes || '',
        request_id: requestId,
      });

      await base44.asServiceRole.entities.AuditLog.create({
        action: 'create', entity_type: 'cash_session', entity_id: session.id, item_label: 'Abertura de caixa', amount: openingAmount,
        reason: 'cash_session_opened', user_email: user.email, user_name: user.full_name || user.display_name, user_role: user.role,
        unit_id: unitId, request_id: requestId, success: true,
      });
      return Response.json({ cash_session: session, request_id: requestId });
    }

    const sessionId = body.cash_session_id;
    if (!sessionId) return Response.json({ error: 'cash_session_id_required', request_id: requestId }, { status: 400 });
    const session = await base44.asServiceRole.entities.CashSession.get(sessionId);
    if (!session || !canAccessUnit(user, session.unit_id)) return Response.json({ error: 'cash_session_not_found', request_id: requestId }, { status: 404 });

    if (action === 'movement') {
      if (session.status !== 'open') return Response.json({ error: 'cash_session_not_open', request_id: requestId }, { status: 409 });
      const movementType = body.movement_type;
      const amount = Math.abs(Number(body.amount || 0));
      if (!movementType || amount <= 0) return Response.json({ error: 'movement_type_and_amount_required', request_id: requestId }, { status: 422 });
      if (SENSITIVE_MOVEMENTS.has(movementType) && !String(body.reason || '').trim()) {
        return Response.json({ error: 'reason_required', request_id: requestId }, { status: 422 });
      }
      if (SENSITIVE_MOVEMENTS.has(movementType) && !MANAGER_ROLES.has(user.role) && !(user.permissions || []).includes('cash.sensitive_movement')) {
        return Response.json({ error: 'manager_approval_required', request_id: requestId }, { status: 403 });
      }

      const movement = await base44.asServiceRole.entities.CashMovement.create({
        cash_session_id: session.id,
        unit_id: session.unit_id,
        movement_type: movementType,
        amount,
        payment_method: body.payment_method || 'cash',
        payment_id: body.payment_id,
        order_id: body.order_id,
        customer_id: body.customer_id,
        supplier_id: body.supplier_id,
        category: body.category,
        reason: body.reason || 'cash_movement',
        operator_user_id: user.id,
        approved_by_user_id: SENSITIVE_MOVEMENTS.has(movementType) ? user.id : undefined,
        occurred_at: new Date().toISOString(),
        request_id: requestId,
      });

      const movements = await base44.asServiceRole.entities.CashMovement.filter({ cash_session_id: session.id });
      const expected = Number(session.opening_amount || 0) + movements.reduce((sum: number, item: any) => sum + signedAmount(item), 0);
      const totals = {
        income_amount: movements.filter((item: any) => item.movement_type === 'sale').reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0),
        supply_amount: movements.filter((item: any) => ['supply', 'deposit', 'adjustment_in'].includes(item.movement_type)).reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0),
        withdrawal_amount: movements.filter((item: any) => ['withdrawal', 'adjustment_out'].includes(item.movement_type)).reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0),
        refund_amount: movements.filter((item: any) => item.movement_type === 'refund').reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0),
      };
      const updated = await base44.asServiceRole.entities.CashSession.update(session.id, { expected_cash_amount: expected, ...totals });

      await base44.asServiceRole.entities.AuditLog.create({
        action: 'create', entity_type: 'cash_movement', entity_id: movement.id, item_label: movementType, amount,
        reason: body.reason || 'cash_movement', user_email: user.email, user_name: user.full_name || user.display_name, user_role: user.role,
        unit_id: session.unit_id, request_id: requestId, success: true,
      });
      return Response.json({ cash_session: updated, cash_movement: movement, request_id: requestId });
    }

    if (action === 'close') {
      if (session.status !== 'open' && session.status !== 'counting') {
        return Response.json({ error: 'cash_session_not_open', request_id: requestId }, { status: 409 });
      }
      const countedAmount = Number(body.counted_cash_amount);
      if (!Number.isFinite(countedAmount) || countedAmount < 0) return Response.json({ error: 'counted_amount_required', request_id: requestId }, { status: 422 });

      const movements = await base44.asServiceRole.entities.CashMovement.filter({ cash_session_id: session.id });
      const expected = Number(session.opening_amount || 0) + movements.reduce((sum: number, item: any) => sum + signedAmount(item), 0);
      const difference = countedAmount - expected;
      const hasDifference = Math.abs(difference) >= 0.01;
      if (hasDifference && !String(body.difference_reason || '').trim()) {
        return Response.json({ error: 'difference_reason_required', expected, counted: countedAmount, difference, request_id: requestId }, { status: 422 });
      }

      const requiresApproval = hasDifference && !MANAGER_ROLES.has(user.role);
      const now = new Date().toISOString();
      const updated = await base44.asServiceRole.entities.CashSession.update(session.id, {
        status: requiresApproval ? 'pending_approval' : 'closed',
        counted_cash_amount: countedAmount,
        expected_cash_amount: expected,
        difference_amount: difference,
        difference_reason: body.difference_reason || '',
        closed_at: requiresApproval ? undefined : now,
        approved_by_user_id: requiresApproval ? undefined : user.id,
        approved_at: requiresApproval ? undefined : now,
      });

      await base44.asServiceRole.entities.AuditLog.create({
        action: 'status_change', entity_type: 'cash_session', entity_id: session.id, item_label: 'Fechamento de caixa', amount: countedAmount,
        reason: body.difference_reason || 'cash_session_closed', user_email: user.email, user_name: user.full_name || user.display_name, user_role: user.role,
        unit_id: session.unit_id, request_id: requestId, before_data: { status: session.status }, after_data: { status: updated.status, expected, counted: countedAmount, difference }, success: true,
      });
      return Response.json({ cash_session: updated, requires_approval: requiresApproval, request_id: requestId });
    }

    return Response.json({ error: 'unsupported_action', request_id: requestId }, { status: 400 });
  } catch (error) {
    console.error(`[manage_cash_session:${requestId}]`, error);
    return Response.json({ error: 'cash_session_operation_failed', request_id: requestId }, { status: 500 });
  }
});
