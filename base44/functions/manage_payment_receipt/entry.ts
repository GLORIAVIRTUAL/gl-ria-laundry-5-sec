import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { calculateReceiptPlan, toCents, fromCents } from '../../shared/paymentMath.js';

const RECEIPT_ROLES = new Set(['super_admin', 'admin', 'manager', 'finance', 'cashier', 'attendant']);
const REVERSAL_ROLES = new Set(['super_admin', 'admin', 'manager', 'finance']);
const ALLOWED_METHODS = new Set(['cash', 'pix', 'credit', 'debit', 'bank_transfer', 'boleto', 'customer_balance', 'courtesy']);

function canAccessUnit(user: any, unitId?: string) {
  if (!unitId || ['super_admin', 'admin'].includes(user?.role)) return true;
  return new Set([user?.primary_unit_id, ...(user?.allowed_unit_ids || [])].filter(Boolean)).has(unitId);
}

function isTenderConfirmed(tender: any, user: any) {
  if (tender.method === 'cash') return tender.confirmed_received === true;
  if (['credit', 'debit'].includes(tender.method)) return tender.terminal_confirmed === true;
  if (['pix', 'bank_transfer', 'boleto'].includes(tender.method)) return tender.reconciled === true;
  if (tender.method === 'customer_balance') return true;
  if (tender.method === 'courtesy') return REVERSAL_ROLES.has(user.role) && String(tender.reason || '').trim().length >= 8;
  return false;
}

function paymentProvider(method: string) {
  if (method === 'cash') return 'cash';
  if (['credit', 'debit'].includes(method)) return 'card_terminal';
  if (method === 'pix') return 'pix';
  if (method === 'customer_balance') return 'customer_balance';
  if (method === 'bank_transfer' || method === 'boleto') return 'bank';
  return 'manual';
}

async function loadTargets(base44: any, user: any, body: any) {
  const targets: any[] = [];
  let unitId = body.unit_id;
  let customerId = body.customer_id;

  for (const orderId of [...new Set(body.order_ids || [])]) {
    const order = await base44.asServiceRole.entities.Order.get(orderId);
    if (!order || !canAccessUnit(user, order.unit_id)) throw new Error('order_not_found');
    if (['cancelled'].includes(order.status)) throw new Error('order_not_receivable');
    if (unitId && unitId !== order.unit_id) throw new Error('cross_unit_receipt_not_allowed');
    if (customerId && customerId !== order.customer_id) throw new Error('cross_customer_receipt_not_allowed');
    unitId = unitId || order.unit_id;
    customerId = customerId || order.customer_id;
    const openAmount = Math.max(0, Number(order.total_amount || 0) - Number(order.paid_amount || 0));
    if (openAmount > 0.009) targets.push({ key: `order:${order.id}`, type: 'order', id: order.id, open_amount: openAmount, record: order });
  }

  for (const receivableId of [...new Set(body.accounts_receivable_ids || [])]) {
    const receivable = await base44.asServiceRole.entities.AccountsReceivable.get(receivableId);
    if (!receivable || !canAccessUnit(user, receivable.unit_id)) throw new Error('receivable_not_found');
    if (['cancelled', 'written_off', 'paid'].includes(receivable.status)) continue;
    if (unitId && unitId !== receivable.unit_id) throw new Error('cross_unit_receipt_not_allowed');
    if (customerId && customerId !== receivable.customer_id) throw new Error('cross_customer_receipt_not_allowed');
    unitId = unitId || receivable.unit_id;
    customerId = customerId || receivable.customer_id;
    const duplicatesOrderTarget = receivable.order_id && targets.some((target) => target.type === 'order' && target.id === receivable.order_id);
    if (duplicatesOrderTarget) throw new Error('order_and_receivable_cannot_be_paid_together');
    const openAmount = Math.max(0, Number(receivable.open_amount || 0));
    if (openAmount > 0.009) targets.push({ key: `receivable:${receivable.id}`, type: 'receivable', id: receivable.id, open_amount: openAmount, record: receivable });
  }

  if (!unitId || !customerId || targets.length === 0) throw new Error('receivable_targets_required');
  return { unitId, customerId, targets };
}

async function createCreditEntry(base44: any, params: any) {
  const customer = await base44.asServiceRole.entities.Customer.get(params.customerId);
  const currentCents = toCents(customer?.credit_balance || 0);
  const deltaCents = toCents(params.signedAmount);
  const nextCents = currentCents + deltaCents;
  if (nextCents < 0) throw new Error('insufficient_customer_balance');

  const updatedCustomer = await base44.asServiceRole.entities.Customer.update(params.customerId, {
    credit_balance: fromCents(nextCents),
  });
  const entry = await base44.asServiceRole.entities.CustomerCreditLedger.create({
    unit_id: params.unitId,
    customer_id: params.customerId,
    entry_type: params.entryType,
    amount: Math.abs(fromCents(deltaCents)),
    signed_amount: fromCents(deltaCents),
    balance_after: fromCents(nextCents),
    status: 'posted',
    payment_receipt_id: params.receiptId,
    payment_id: params.paymentId,
    order_id: params.orderId,
    accounts_receivable_id: params.receivableId,
    source_entry_id: params.sourceEntryId,
    occurred_at: new Date().toISOString(),
    operator_user_id: params.user.id,
    reason: params.reason,
    idempotency_key: params.idempotencyKey,
    request_id: params.requestId,
  });
  return { customer: updatedCustomer, entry };
}

async function receive(base44: any, user: any, body: any, requestId: string) {
  if (!Array.isArray(body.tenders) || body.tenders.length === 0) throw new Error('tenders_required');
  for (const tender of body.tenders) {
    if (!ALLOWED_METHODS.has(tender.method)) throw new Error('unsupported_payment_method');
  }

  const { unitId, customerId, targets } = await loadTargets(base44, user, body);
  if (!canAccessUnit(user, unitId)) throw new Error('forbidden_unit');
  const customer = await base44.asServiceRole.entities.Customer.get(customerId);
  if (!customer) throw new Error('customer_not_found');

  const customerBalanceCents = toCents(customer.credit_balance || 0);
  const requestedCreditCents = body.tenders
    .filter((tender: any) => tender.method === 'customer_balance')
    .reduce((sum: number, tender: any) => sum + toCents(tender.amount), 0);
  if (requestedCreditCents > customerBalanceCents) throw new Error('insufficient_customer_balance');

  const tenders = body.tenders.map((tender: any) => ({
    ...tender,
    confirmed: isTenderConfirmed(tender, user),
  }));
  const plan = calculateReceiptPlan({ targets, tenders });
  if (plan.amount_tendered <= 0) throw new Error('invalid_receipt_amount');

  const idempotencyKey = String(body.idempotency_key || '').trim();
  if (!idempotencyKey) throw new Error('idempotency_key_required');
  const eventKey = `payment_receipt:${idempotencyKey}`;
  const existingEvents = await base44.asServiceRole.entities.ProcessedEvent.filter({ event_key: eventKey });
  if (existingEvents.some((event: any) => event.status === 'completed')) {
    const receipts = await base44.asServiceRole.entities.PaymentReceipt.filter({ idempotency_key: idempotencyKey });
    return { payment_receipt: receipts[0] || null, duplicate: true, request_id: requestId };
  }

  const event = existingEvents[0] || await base44.asServiceRole.entities.ProcessedEvent.create({
    event_key: eventKey,
    event_type: 'payment_receipt',
    source: 'user_command',
    status: 'processing',
    payload_hash: `${unitId}:${customerId}:${JSON.stringify(body.order_ids || [])}:${JSON.stringify(body.accounts_receivable_ids || [])}:${plan.amount_tendered}`,
    attempts: 1,
    started_at: new Date().toISOString(),
    unit_id: unitId,
  });

  const now = new Date().toISOString();
  const receiptNumber = `REC-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const receipt = await base44.asServiceRole.entities.PaymentReceipt.create({
    receipt_number: receiptNumber,
    unit_id: unitId,
    customer_id: customerId,
    order_ids: targets.filter((target) => target.type === 'order').map((target) => target.id),
    accounts_receivable_ids: targets.filter((target) => target.type === 'receivable').map((target) => target.id),
    cash_session_id: body.cash_session_id,
    status: plan.pending_amount > 0 ? (plan.amount_applied > 0 ? 'partially_settled' : 'pending_confirmation') : 'settled',
    currency: 'BRL',
    amount_due: plan.amount_due,
    amount_tendered: plan.amount_tendered,
    amount_applied: plan.amount_applied,
    pending_amount: plan.pending_amount,
    change_amount: plan.change_amount,
    reversed_amount: 0,
    tenders: [],
    payment_ids: [],
    allocation_ids: [],
    operator_user_id: user.id,
    operator_name: user.full_name || user.display_name || user.email,
    settled_at: plan.pending_amount > 0 ? undefined : now,
    idempotency_key: idempotencyKey,
    request_id: requestId,
    notes: body.notes || '',
  });

  const paymentIds: string[] = [];
  const allocationIds: string[] = [];
  const receiptTenders: any[] = [];

  for (const tender of plan.tenders) {
    const paymentStatus = tender.confirmed ? 'succeeded' : 'pending_confirmation';
    const settlementStatus = tender.confirmed ? 'settled' : 'pending';
    const payment = await base44.asServiceRole.entities.Payment.create({
      customer_id: customerId,
      order_id: tender.allocations.find((allocation: any) => allocation.type === 'order')?.id,
      accounts_receivable_id: tender.allocations.find((allocation: any) => allocation.type === 'receivable')?.id,
      unit_id: unitId,
      provider: paymentProvider(tender.method),
      status: paymentStatus,
      amount: tender.confirmed ? tender.applied_amount : tender.amount,
      tendered_amount: tender.amount,
      applied_amount: tender.applied_amount,
      change_amount: tender.change_amount,
      paid_at: tender.confirmed ? now : undefined,
      confirmed_at: tender.confirmed ? now : undefined,
      confirmed_by_user_id: tender.confirmed ? user.id : undefined,
      payment_method: tender.method,
      installments: tender.method === 'credit' ? Number(tender.installments || 1) : undefined,
      card_brand: tender.card_brand,
      fee_percent: Number(tender.fee_percent || 0),
      fee_amount: Number(tender.fee_amount || 0),
      external_reference: tender.external_reference,
      idempotency_key: `${idempotencyKey}:${tender.sequence}`,
      payment_receipt_id: receipt.id,
      tender_sequence: tender.sequence,
      settlement_status: settlementStatus,
      settled_at: tender.confirmed ? now : undefined,
      notes: tender.notes || tender.reason || '',
    });
    paymentIds.push(payment.id);

    const tenderAllocationIds: string[] = [];
    for (const allocation of tender.allocations) {
      const record = await base44.asServiceRole.entities.PaymentAllocation.create({
        unit_id: unitId,
        payment_id: payment.id,
        payment_receipt_id: receipt.id,
        accounts_receivable_id: allocation.type === 'receivable' ? allocation.id : undefined,
        order_id: allocation.type === 'order' ? allocation.id : undefined,
        amount: allocation.amount,
        allocation_type: 'receipt',
        status: 'posted',
        sequence: allocationIds.length + 1,
        allocated_at: now,
        allocated_by_user_id: user.id,
        request_id: requestId,
      });
      allocationIds.push(record.id);
      tenderAllocationIds.push(record.id);

      if (allocation.type === 'order') {
        const order = allocation.record;
        const paidAmount = fromCents(toCents(order.paid_amount || 0) + toCents(allocation.amount));
        const openAmount = Math.max(0, fromCents(toCents(order.total_amount || 0) - toCents(paidAmount)));
        await base44.asServiceRole.entities.Order.update(order.id, {
          paid_amount: paidAmount,
          open_amount: openAmount,
          payment_status: openAmount <= 0.01 ? 'paid' : 'partial',
          payment_receipt_ids: [...new Set([...(order.payment_receipt_ids || []), receipt.id])],
        });
      } else {
        const receivable = allocation.record;
        const paidAmount = fromCents(toCents(receivable.paid_amount || 0) + toCents(allocation.amount));
        const openAmount = Math.max(0, fromCents(toCents(receivable.original_amount || 0) + toCents(receivable.interest_amount || 0) - toCents(receivable.discount_amount || 0) - toCents(paidAmount)));
        await base44.asServiceRole.entities.AccountsReceivable.update(receivable.id, {
          paid_amount: paidAmount,
          open_amount: openAmount,
          status: openAmount <= 0.01 ? 'paid' : 'partially_paid',
          paid_at: openAmount <= 0.01 ? now : undefined,
          payment_receipt_ids: [...new Set([...(receivable.payment_receipt_ids || []), receipt.id])],
          payment_allocation_ids: [...new Set([...(receivable.payment_allocation_ids || []), record.id])],
        });
      }
    }

    await base44.asServiceRole.entities.Payment.update(payment.id, { allocation_ids: tenderAllocationIds });

    if (tender.confirmed && tender.method === 'customer_balance' && tender.applied_amount > 0) {
      await createCreditEntry(base44, {
        unitId,
        customerId,
        signedAmount: -tender.applied_amount,
        entryType: 'payment',
        receiptId: receipt.id,
        paymentId: payment.id,
        user,
        reason: `Crédito utilizado no recibo ${receiptNumber}`,
        idempotencyKey: `${idempotencyKey}:credit:${tender.sequence}`,
        requestId,
      });
    }

    if (tender.confirmed && tender.method === 'cash' && tender.applied_amount > 0) {
      if (!body.cash_session_id) throw new Error('cash_session_required');
      const session = await base44.asServiceRole.entities.CashSession.get(body.cash_session_id);
      if (!session || session.unit_id !== unitId || session.status !== 'open') throw new Error('cash_session_not_open');
      await base44.asServiceRole.entities.CashMovement.create({
        cash_session_id: session.id,
        unit_id: unitId,
        movement_type: 'sale',
        amount: tender.applied_amount,
        payment_method: 'cash',
        payment_id: payment.id,
        payment_receipt_id: receipt.id,
        customer_id: customerId,
        reason: `Recebimento ${receiptNumber}`,
        operator_user_id: user.id,
        occurred_at: now,
        request_id: requestId,
      });
    }

    receiptTenders.push({
      payment_id: payment.id,
      method: tender.method,
      provider: paymentProvider(tender.method),
      tendered_amount: tender.amount,
      applied_amount: tender.applied_amount,
      change_amount: tender.change_amount,
      status: paymentStatus,
      external_reference: tender.external_reference,
    });
  }

  const updatedReceipt = await base44.asServiceRole.entities.PaymentReceipt.update(receipt.id, {
    payment_ids: paymentIds,
    allocation_ids: allocationIds,
    tenders: receiptTenders,
  });

  await base44.asServiceRole.entities.AuditLog.create({
    action: 'payment',
    entity_type: 'payment_receipt',
    entity_id: receipt.id,
    item_label: receiptNumber,
    amount: plan.amount_applied,
    reason: plan.pending_amount > 0 ? 'mixed_receipt_partially_settled' : 'mixed_receipt_settled',
    user_email: user.email,
    user_name: user.full_name || user.display_name,
    user_role: user.role,
    unit_id: unitId,
    request_id: requestId,
    after_data: { tenders: receiptTenders, amount_due: plan.amount_due, amount_applied: plan.amount_applied, pending_amount: plan.pending_amount, change_amount: plan.change_amount },
    success: true,
  });
  await base44.asServiceRole.entities.ProcessedEvent.update(event.id, {
    status: 'completed', entity_type: 'payment_receipt', entity_id: receipt.id,
    result: { receipt_id: receipt.id, amount_applied: plan.amount_applied, pending_amount: plan.pending_amount }, completed_at: now,
  });

  return { payment_receipt: updatedReceipt, request_id: requestId };
}

async function reverse(base44: any, user: any, body: any, requestId: string) {
  if (!REVERSAL_ROLES.has(user.role) && !(user.permissions || []).includes('payments.reverse')) throw new Error('manager_approval_required');
  const reason = String(body.reason || '').trim();
  if (reason.length < 8) throw new Error('reversal_reason_required');
  const receipt = await base44.asServiceRole.entities.PaymentReceipt.get(body.payment_receipt_id);
  if (!receipt || !canAccessUnit(user, receipt.unit_id)) throw new Error('payment_receipt_not_found');
  if (['reversed', 'cancelled'].includes(receipt.status)) return { payment_receipt: receipt, duplicate: true, request_id: requestId };

  const idempotencyKey = String(body.idempotency_key || `reverse:${receipt.id}`).trim();
  const eventKey = `payment_receipt_reversal:${idempotencyKey}`;
  const events = await base44.asServiceRole.entities.ProcessedEvent.filter({ event_key: eventKey });
  if (events.some((event: any) => event.status === 'completed')) return { payment_receipt: receipt, duplicate: true, request_id: requestId };
  const event = events[0] || await base44.asServiceRole.entities.ProcessedEvent.create({
    event_key: eventKey, event_type: 'payment_receipt_reversal', source: 'user_command', status: 'processing',
    payload_hash: `${receipt.id}:${reason}`, attempts: 1, started_at: new Date().toISOString(), unit_id: receipt.unit_id,
  });

  const allocations = await base44.asServiceRole.entities.PaymentAllocation.filter({ payment_receipt_id: receipt.id });
  const payments = await base44.asServiceRole.entities.Payment.filter({ payment_receipt_id: receipt.id });
  const now = new Date().toISOString();
  let reversedCents = 0;

  for (const allocation of allocations.filter((item: any) => item.status === 'posted' && item.allocation_type === 'receipt')) {
    const amountCents = toCents(allocation.amount || 0);
    reversedCents += amountCents;
    const reversalAllocation = await base44.asServiceRole.entities.PaymentAllocation.create({
      unit_id: receipt.unit_id,
      payment_id: allocation.payment_id,
      payment_receipt_id: receipt.id,
      accounts_receivable_id: allocation.accounts_receivable_id,
      order_id: allocation.order_id,
      amount: fromCents(amountCents),
      allocation_type: 'refund',
      status: 'posted',
      sequence: allocations.length + 1,
      allocated_at: now,
      allocated_by_user_id: user.id,
      reversal_allocation_id: allocation.id,
      reversal_reason: reason,
      request_id: requestId,
    });
    await base44.asServiceRole.entities.PaymentAllocation.update(allocation.id, {
      status: 'reversed', reversed_at: now, reversed_by_user_id: user.id,
      reversal_allocation_id: reversalAllocation.id, reversal_reason: reason,
    });

    if (allocation.order_id) {
      const order = await base44.asServiceRole.entities.Order.get(allocation.order_id);
      const paidAmount = Math.max(0, fromCents(toCents(order.paid_amount || 0) - amountCents));
      const openAmount = Math.max(0, fromCents(toCents(order.total_amount || 0) - toCents(paidAmount)));
      await base44.asServiceRole.entities.Order.update(order.id, { paid_amount: paidAmount, open_amount: openAmount, payment_status: paidAmount > 0 ? 'partial' : 'unpaid' });
    }
    if (allocation.accounts_receivable_id) {
      const receivable = await base44.asServiceRole.entities.AccountsReceivable.get(allocation.accounts_receivable_id);
      const paidAmount = Math.max(0, fromCents(toCents(receivable.paid_amount || 0) - amountCents));
      const openAmount = Math.max(0, fromCents(toCents(receivable.original_amount || 0) + toCents(receivable.interest_amount || 0) - toCents(receivable.discount_amount || 0) - toCents(paidAmount)));
      await base44.asServiceRole.entities.AccountsReceivable.update(receivable.id, { paid_amount: paidAmount, open_amount: openAmount, status: paidAmount > 0 ? 'partially_paid' : 'open', paid_at: undefined });
    }
  }

  for (const payment of payments.filter((item: any) => item.status === 'succeeded')) {
    const appliedAmount = Number(payment.applied_amount ?? payment.amount ?? 0);
    const reversalPayment = await base44.asServiceRole.entities.Payment.create({
      customer_id: receipt.customer_id,
      order_id: payment.order_id,
      accounts_receivable_id: payment.accounts_receivable_id,
      unit_id: receipt.unit_id,
      provider: payment.provider,
      status: 'succeeded',
      amount: -Math.abs(appliedAmount),
      tendered_amount: -Math.abs(appliedAmount),
      applied_amount: -Math.abs(appliedAmount),
      paid_at: now,
      payment_method: payment.payment_method,
      idempotency_key: `${idempotencyKey}:${payment.id}`,
      payment_receipt_id: receipt.id,
      settlement_status: 'settled',
      settled_at: now,
      reversal_payment_id: payment.id,
      reversal_reason: reason,
      notes: `Estorno do pagamento ${payment.id}`,
    });
    await base44.asServiceRole.entities.Payment.update(payment.id, {
      status: 'refunded', refunded_amount: appliedAmount, reversed_at: now,
      reversed_by_user_id: user.id, reversal_payment_id: reversalPayment.id, reversal_reason: reason, settlement_status: 'reversed',
    });

    if (payment.payment_method === 'customer_balance' && appliedAmount > 0) {
      await createCreditEntry(base44, {
        unitId: receipt.unit_id, customerId: receipt.customer_id, signedAmount: appliedAmount,
        entryType: 'refund', receiptId: receipt.id, paymentId: reversalPayment.id, sourceEntryId: payment.id,
        user, reason, idempotencyKey: `${idempotencyKey}:credit:${payment.id}`, requestId,
      });
    }
    if (payment.payment_method === 'cash' && appliedAmount > 0) {
      const cashSessionId = body.cash_session_id || receipt.cash_session_id;
      if (!cashSessionId) throw new Error('cash_session_required_for_refund');
      const session = await base44.asServiceRole.entities.CashSession.get(cashSessionId);
      if (!session || session.unit_id !== receipt.unit_id || session.status !== 'open') throw new Error('cash_session_not_open');
      await base44.asServiceRole.entities.CashMovement.create({
        cash_session_id: session.id, unit_id: receipt.unit_id, movement_type: 'refund', amount: appliedAmount,
        payment_method: 'cash', payment_id: reversalPayment.id, payment_receipt_id: receipt.id,
        customer_id: receipt.customer_id, reason, operator_user_id: user.id, approved_by_user_id: user.id,
        occurred_at: now, request_id: requestId,
      });
    }
  }

  const updatedReceipt = await base44.asServiceRole.entities.PaymentReceipt.update(receipt.id, {
    status: 'reversed', reversed_amount: fromCents(reversedCents), reversed_at: now,
    reversed_by_user_id: user.id, reversal_reason: reason,
  });
  await base44.asServiceRole.entities.AuditLog.create({
    action: 'payment', entity_type: 'payment_receipt', entity_id: receipt.id, item_label: receipt.receipt_number,
    amount: fromCents(reversedCents), reason, user_email: user.email, user_name: user.full_name || user.display_name,
    user_role: user.role, unit_id: receipt.unit_id, request_id: requestId,
    before_data: { status: receipt.status, amount_applied: receipt.amount_applied }, after_data: { status: 'reversed', reversed_amount: fromCents(reversedCents) }, success: true,
  });
  await base44.asServiceRole.entities.ProcessedEvent.update(event.id, {
    status: 'completed', entity_type: 'payment_receipt', entity_id: receipt.id,
    result: { receipt_id: receipt.id, reversed_amount: fromCents(reversedCents) }, completed_at: now,
  });
  return { payment_receipt: updatedReceipt, reversed_amount: fromCents(reversedCents), request_id: requestId };
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  try {
    if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed', request_id: requestId }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'authentication_required', request_id: requestId }, { status: 401 });
    if (!RECEIPT_ROLES.has(user.role || 'attendant') && !(user.permissions || []).includes('payments.receive')) {
      return Response.json({ error: 'forbidden', request_id: requestId }, { status: 403 });
    }
    const body = await req.json();
    if (body.action === 'receive') return Response.json(await receive(base44, user, body, requestId));
    if (body.action === 'reverse') return Response.json(await reverse(base44, user, body, requestId));
    return Response.json({ error: 'unsupported_action', request_id: requestId }, { status: 400 });
  } catch (error) {
    console.error(`[manage_payment_receipt:${requestId}]`, error);
    const message = error instanceof Error ? error.message : 'payment_receipt_failed';
    const clientErrors = new Set([
      'tenders_required', 'unsupported_payment_method', 'order_not_found', 'order_not_receivable', 'receivable_not_found',
      'receivable_targets_required', 'cross_unit_receipt_not_allowed', 'cross_customer_receipt_not_allowed',
      'order_and_receivable_cannot_be_paid_together', 'customer_not_found', 'insufficient_customer_balance',
      'invalid_receipt_amount', 'idempotency_key_required', 'non_cash_overpayment_not_allowed', 'change_requires_cash',
      'cash_session_required', 'cash_session_not_open', 'manager_approval_required', 'reversal_reason_required',
      'payment_receipt_not_found', 'cash_session_required_for_refund', 'nothing_to_receive',
    ]);
    const status = message.startsWith('invalid_tender_amount') || clientErrors.has(message) ? 422 : 500;
    return Response.json({ error: message, request_id: requestId }, { status });
  }
});
