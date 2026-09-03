import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ALLOWED_ROLES = new Set(['super_admin', 'admin', 'manager', 'cashier', 'attendant']);
const ALLOWED_METHODS = new Set(['cash', 'pix', 'credit', 'debit']);

function canAccessUnit(user: any, unitId?: string) {
  if (!unitId || ['super_admin', 'admin'].includes(user?.role)) return true;
  return new Set([user?.primary_unit_id, ...(user?.allowed_unit_ids || [])].filter(Boolean)).has(unitId);
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  try {
    if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed', request_id: requestId }, { status: 405 });

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'authentication_required', request_id: requestId }, { status: 401 });
    if (!ALLOWED_ROLES.has(user.role || 'attendant') && !(user.permissions || []).includes('payments.counter')) {
      return Response.json({ error: 'forbidden', request_id: requestId }, { status: 403 });
    }

    const body = await req.json();
    if (!body.order_id || !ALLOWED_METHODS.has(body.payment_method) || body.confirmed_received !== true) {
      return Response.json({ error: 'order_method_and_confirmation_required', request_id: requestId }, { status: 422 });
    }

    const order = await base44.asServiceRole.entities.Order.get(body.order_id);
    if (!order || !canAccessUnit(user, order.unit_id)) return Response.json({ error: 'order_not_found', request_id: requestId }, { status: 404 });
    if (['cancelled', 'delivered'].includes(order.status)) return Response.json({ error: 'order_not_payable', request_id: requestId }, { status: 409 });

    const outstanding = Math.max(0, Number(order.total_amount || 0) - Number(order.paid_amount || 0));
    if (outstanding <= 0.01) return Response.json({ error: 'order_already_paid', request_id: requestId }, { status: 409 });
    const amount = body.amount == null ? outstanding : Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount - outstanding > 0.01) {
      return Response.json({ error: 'invalid_payment_amount', outstanding, request_id: requestId }, { status: 422 });
    }

    const idempotencyKey = body.idempotency_key || `${order.id}:${body.payment_method}:${amount}`;
    const eventKey = `counter_payment:${idempotencyKey}`;
    const events = await base44.asServiceRole.entities.ProcessedEvent.filter({ event_key: eventKey });
    if (events.some((event: any) => event.status === 'completed')) {
      const existingPayments = await base44.asServiceRole.entities.Payment.filter({ idempotency_key: idempotencyKey });
      return Response.json({ payment: existingPayments[0] || null, duplicate: true, request_id: requestId });
    }

    const event = events[0] || await base44.asServiceRole.entities.ProcessedEvent.create({
      event_key: eventKey,
      event_type: 'counter_payment',
      source: 'user_command',
      status: 'processing',
      payload_hash: `${order.id}:${body.payment_method}:${amount}`,
      attempts: 1,
      started_at: new Date().toISOString(),
      unit_id: order.unit_id,
    });

    const confirmedImmediately = body.payment_method === 'cash' || (['credit', 'debit'].includes(body.payment_method) && body.terminal_confirmed === true);
    const status = confirmedImmediately ? 'succeeded' : 'pending_confirmation';
    const now = new Date().toISOString();
    const feePercent = Number(body.fee_percent || 0);
    const feeAmount = feePercent > 0 ? amount * feePercent / 100 : 0;

    const payment = await base44.asServiceRole.entities.Payment.create({
      customer_id: order.customer_id,
      quote_id: order.source_quote_id,
      order_id: order.id,
      unit_id: order.unit_id,
      status,
      amount,
      paid_at: confirmedImmediately ? now : undefined,
      payment_method: body.payment_method,
      installments: body.payment_method === 'credit' ? Number(body.installments || 1) : undefined,
      card_brand: body.card_brand,
      fee_percent: feePercent || undefined,
      fee_amount: feeAmount || undefined,
      external_reference: body.external_reference,
      idempotency_key: idempotencyKey,
      confirmation_source: confirmedImmediately ? 'counter_explicit_confirmation' : 'awaiting_reconciliation',
      confirmed_at: confirmedImmediately ? now : undefined,
      confirmed_by_user_id: confirmedImmediately ? user.id : undefined,
      notes: body.notes || (confirmedImmediately ? 'Recebimento confirmado no balcão.' : 'Aguardando conciliação bancária/adquirente.'),
    });

    let updatedOrder = order;
    if (confirmedImmediately) {
      const paidAmount = Number(order.paid_amount || 0) + amount;
      updatedOrder = await base44.asServiceRole.entities.Order.update(order.id, {
        paid_amount: paidAmount,
        payment_status: paidAmount + 0.01 >= Number(order.total_amount || 0) ? 'paid' : 'partial',
      });
      if (body.payment_method === 'cash' && body.cash_session_id) {
        await base44.asServiceRole.entities.CashMovement.create({
          cash_session_id: body.cash_session_id,
          unit_id: order.unit_id,
          movement_type: 'sale',
          amount,
          payment_method: 'cash',
          payment_id: payment.id,
          order_id: order.id,
          customer_id: order.customer_id,
          reason: `Recebimento do ticket ${order.ticket_number || order.id}`,
          operator_user_id: user.id,
          occurred_at: now,
          request_id: requestId,
        });
      }
    } else {
      updatedOrder = await base44.asServiceRole.entities.Order.update(order.id, { payment_status: 'pending' });
    }

    await base44.asServiceRole.entities.AuditLog.create({
      action: 'payment',
      entity_type: 'payment',
      entity_id: payment.id,
      item_label: `Ticket ${order.ticket_number || order.id}`,
      amount,
      reason: confirmedImmediately ? 'counter_payment_confirmed' : 'counter_payment_pending_reconciliation',
      user_email: user.email,
      user_name: user.full_name || user.display_name,
      user_role: user.role,
      unit_id: order.unit_id,
      request_id: requestId,
      after_data: { status, payment_method: body.payment_method, order_payment_status: updatedOrder.payment_status },
      success: true,
    });

    await base44.asServiceRole.entities.ProcessedEvent.update(event.id, {
      status: 'completed',
      entity_type: 'payment',
      entity_id: payment.id,
      result: { payment_id: payment.id, status },
      completed_at: now,
    });

    return Response.json({ payment, order: updatedOrder, requires_reconciliation: !confirmedImmediately, request_id: requestId });
  } catch (error) {
    console.error(`[record_counter_payment:${requestId}]`, error);
    return Response.json({ error: 'counter_payment_failed', request_id: requestId }, { status: 500 });
  }
});
