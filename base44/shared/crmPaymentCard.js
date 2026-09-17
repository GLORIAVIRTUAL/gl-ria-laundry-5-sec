// Mantém o pipeline "Pagamentos" do CRM em sincronia com as cobranças Asaas.
// Um card por pedido/orçamento; a etapa acompanha o ciclo da cobrança.

/**
 * @param {any} base44
 * @param {{ customerId: string, unitId?: string, orderId?: string, quoteId?: string, stage: string }} params
 */
export async function upsertPaymentCard(base44, { customerId, unitId, orderId, quoteId, stage }) {
  if (!customerId || !stage) return null;
  const db = base44.asServiceRole.entities;
  const query = { pipeline_type: 'PAYMENT' };
  if (orderId) query.linked_order_id = orderId;
  else if (quoteId) query.linked_quote_id = quoteId;
  else return null;

  const existing = await db.CrmCard.filter(query).catch(() => []);
  if (existing?.length) {
    if (existing[0].stage === stage) return existing[0];
    return await db.CrmCard.update(existing[0].id, { stage }).catch(() => null);
  }

  return await db.CrmCard.create({
    pipeline_type: 'PAYMENT',
    stage,
    priority: 'HIGH',
    customer_id: customerId,
    unit_id: unitId,
    linked_order_id: orderId,
    linked_quote_id: quoteId,
  }).catch(() => null);
}