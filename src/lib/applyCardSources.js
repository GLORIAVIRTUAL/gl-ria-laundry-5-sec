import { base44 } from '@/api/base44Client';
import inferCustomerSource from '@/lib/inferCustomerSource';

// Completa a origem do cliente nos cards de qualquer pipeline do CRM,
// usando as conversas do chat quando o card ainda não tem origem gravada.
export default async function applyCardSources(cards) {
  if (!cards.length) return cards;
  const conversations = await base44.entities.Conversation.list('-created_date', 500);
  const chatSources = inferCustomerSource(conversations);
  return cards.map((card) =>
    card.customer_source ? card : { ...card, customer_source: chatSources.get(card.customer_id) }
  );
}