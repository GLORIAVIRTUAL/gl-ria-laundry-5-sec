import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ALLOWED_ROLES = new Set(['super_admin', 'admin', 'manager', 'finance', 'cashier']);

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
    if (!ALLOWED_ROLES.has(user.role || 'cashier') && !(user.permissions || []).includes('payments.manage')) {
      return Response.json({ error: 'forbidden', request_id: requestId }, { status: 403 });
    }

    const { payment_id: paymentId, bank_transaction_id: bankTransactionId } = await req.json();
    if (!paymentId || !bankTransactionId) return Response.json({ error: 'payment_and_bank_transaction_required', request_id: requestId }, { status: 400 });

    const payment = await base44.asServiceRole.entities.Payment.get(paymentId);
    const transaction = await base44.asServiceRole.entities.BankTransaction.get(bankTransactionId);
    if (!payment || !transaction) return Response.json({ error: 'reconciliation_record_not_found', request_id: requestId }, { status: 404 });
    if (payment.unit_id !== transaction.unit_id || !canAccessUnit(user, payment.unit_id)) {
      return Response.json({ error: 'forbidden_unit', request_id: requestId }, { status: 403 });
    }
    if (transaction.status === 'matched' && transaction.matched_entity_id !== payment.id) {
      return Response.json({ error: 'bank_transaction_already_matched', request_id: requestId }, { status: 409 });
    }

    const paymentAmount = Number(payment.amount || 0);
    const transactionAmount = Math.abs(Number(transaction.amount || 0));
    if (Math.abs(paymentAmount - transactionAmount) > 0.01) {
      await base44.asServiceRole.entities.Payment.update(payment.id, { reconciliation_status: 'divergent' });
      return Response.json({ error: 'amount_divergence', payment_amount: paymentAmount, bank_amount: transactionAmount, request_id: requestId }, { status: 409 });
    }

    const eventKey = `reconcile_payment:${payment.id}:${transaction.id}`;
    const events = await base44.asServiceRole.entities.ProcessedEvent.filter({ event_key: eventKey });
    if (events.some((event: any) => event.status === 'completed')) {
      return Response.json({ payment, bank_transaction: transaction, duplicate: true, request_id: requestId });
    }
    const event = events[0] || await base44.asServiceRole.entities.ProcessedEvent.create({
      event_key: eventKey,
      event_type: 'reconcile_payment',
      source: 'user_command',
      status: 'processing',
      payload_hash: `${payment.id}:${transaction.id}:${paymentAmount}`,
      attempts: 1,
      started_at: new Date().toISOString(),
      unit_id: payment.unit_id,
    });

    const now = new Date().toISOString();
    const updatedPayment = await base44.asServiceRole.entities.Payment.update(payment.id, {
      status: 'succeeded',
      reconciliation_status: 'reconciled',
      paid_at: payment.paid_at || transaction.transaction_date || now,
      confirmed_at: now,
      confirmed_by_user_id: user.id,
      reconciled_at: now,
      reconciled_by_user_id: user.id,
      bank_transaction_id: transaction.id,
      external_reference: payment.external_reference || transaction.external_id,
    });

    const updatedTransaction = await base44.asServiceRole.entities.BankTransaction.update(transaction.id, {
      status: 'matched',
      matched_entity_type: 'payment',
      matched_entity_id: payment.id,
      match_confidence: 1,
      reconciled_by_user_id: user.id,
      reconciled_at: now,
    });

    let allocation = null;
    if (payment.accounts_receivable_id || payment.order_id) {
      allocation = await base44.asServiceRole.entities.PaymentAllocation.create({
        unit_id: payment.unit_id,
        payment_id: payment.id,
        accounts_receivable_id: payment.accounts_receivable_id,
        order_id: payment.order_id,
        amount: paymentAmount,
        allocation_type: 'receipt',
        allocated_at: now,
        allocated_by_user_id: user.id,
        request_id: requestId,
      });
    }

    if (payment.accounts_receivable_id) {
      const receivable = await base44.asServiceRole.entities.AccountsReceivable.get(payment.accounts_receivable_id);
      if (receivable) {
        const paidAmount = Math.min(Number(receivable.original_amount || 0), Number(receivable.paid_amount || 0) + paymentAmount);
        const openAmount = Math.max(0, Number(receivable.original_amount || 0) - paidAmount);
        await base44.asServiceRole.entities.AccountsReceivable.update(receivable.id, {
          paid_amount: paidAmount,
          open_amount: openAmount,
          status: openAmount <= 0.01 ? 'paid' : 'partially_paid',
          payment_allocation_ids: [...(receivable.payment_allocation_ids || []), ...(allocation ? [allocation.id] : [])],
        });
      }
    }

    if (payment.order_id) {
      const order = await base44.asServiceRole.entities.Order.get(payment.order_id);
      if (order) {
        const paidAmount = Math.min(Number(order.total_amount || 0), Number(order.paid_amount || 0) + paymentAmount);
        await base44.asServiceRole.entities.Order.update(order.id, {
          paid_amount: paidAmount,
          payment_status: paidAmount + 0.01 >= Number(order.total_amount || 0) ? 'paid' : 'partial',
        });
      }
    }

    await base44.asServiceRole.entities.AuditLog.create({
      action: 'reconcile',
      entity_type: 'payment',
      entity_id: payment.id,
      item_label: transaction.external_id,
      amount: paymentAmount,
      reason: 'bank_transaction_matched',
      user_email: user.email,
      user_name: user.full_name || user.display_name,
      user_role: user.role,
      unit_id: payment.unit_id,
      request_id: requestId,
      before_data: { payment_status: payment.status, bank_status: transaction.status },
      after_data: { payment_status: 'succeeded', bank_status: 'matched', allocation_id: allocation?.id },
      success: true,
    });

    await base44.asServiceRole.entities.ProcessedEvent.update(event.id, {
      status: 'completed',
      entity_type: 'payment',
      entity_id: payment.id,
      result: { bank_transaction_id: transaction.id, allocation_id: allocation?.id },
      completed_at: now,
    });

    return Response.json({ payment: updatedPayment, bank_transaction: updatedTransaction, allocation, request_id: requestId });
  } catch (error) {
    console.error(`[reconcile_payment:${requestId}]`, error);
    return Response.json({ error: 'payment_reconciliation_failed', request_id: requestId }, { status: 500 });
  }
});
