import { base44 } from '@/api/base44Client';
import inferCustomerSource from '@/lib/inferCustomerSource';

// Garante que todo cliente (vindo do chat ou cadastrado manualmente)
// tenha um card no pipeline "Novos Clientes" com a origem identificada.
export default async function syncNewCustomerCards(customers, fallbackUnitId) {
  const [allCards, conversations] = await Promise.all([
    base44.entities.CrmCard.list('-created_date', 500),
    base44.entities.Conversation.list('-created_date', 500),
  ]);
  const existing = allCards.filter((card) => card.pipeline_type === 'NEW_CUSTOMER');
  const withCard = new Set(existing.map((card) => card.customer_id));

  const chatSources = inferCustomerSource(conversations);
  const sourceByCustomer = new Map(allCards.filter((card) => card.customer_source).map((card) => [card.customer_id, card.customer_source]));
  const resolveSource = (customerId) => sourceByCustomer.get(customerId) || chatSources.get(customerId);

  // Preenche a origem nos cards que ainda estão sem identificação.
  const backfill = existing
    .filter((card) => !card.customer_source && chatSources.get(card.customer_id))
    .map((card) => ({ id: card.id, customer_source: chatSources.get(card.customer_id) }));
  if (backfill.length > 0) {
    await base44.entities.CrmCard.bulkUpdate(backfill.slice(0, 500));
    backfill.forEach(({ id, customer_source }) => {
      const card = existing.find((item) => item.id === id);
      if (card) card.customer_source = customer_source;
    });
  }

  const missing = customers.filter((customer) => customer.id && !withCard.has(customer.id));
  if (missing.length === 0) return existing;

  const created = [];
  for (let index = 0; index < missing.length; index += 100) {
    const chunk = missing.slice(index, index + 100).map((customer) => ({
      pipeline_type: 'NEW_CUSTOMER',
      stage: Number(customer.orders_count || 0) > 0 ? 'Convertido' : 'Novo cliente',
      customer_id: customer.id,
      unit_id: customer.unit_id || fallbackUnitId || undefined,
      customer_source: resolveSource(customer.id) || undefined,
    }));
    const batch = await base44.entities.CrmCard.bulkCreate(chunk);
    created.push(...(Array.isArray(batch) ? batch : []));
  }

  return [...existing, ...created];
}