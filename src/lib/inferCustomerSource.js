// Descobre a origem do cliente a partir das conversas do chat.
const CHANNEL_PRIORITY = ['INSTAGRAM', 'MESSENGER', 'WHATSAPP'];

function sourceFromConversation(conversation) {
  if (conversation.channel === 'INSTAGRAM') return 'INSTAGRAM_DM';
  if (conversation.channel === 'MESSENGER') return 'MESSENGER_DM';
  const origin = (conversation.metadata || {}).source || '';
  if (origin === 'landing_widget' || origin === 'site') return 'SITE_QUOTE';
  return conversation.handoff_required ? 'WHATSAPP_HUMAN' : 'WHATSAPP_GLORIA';
}

// Retorna Map<customer_id, customer_source> usando a conversa mais antiga de cada cliente.
export default function inferCustomerSource(conversations) {
  const byCustomer = new Map();
  const ordered = [...conversations].sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
  for (const conversation of ordered) {
    if (!conversation.customer_id) continue;
    const current = byCustomer.get(conversation.customer_id);
    if (current && CHANNEL_PRIORITY.indexOf(current.channel) <= CHANNEL_PRIORITY.indexOf(conversation.channel)) continue;
    byCustomer.set(conversation.customer_id, { channel: conversation.channel, source: sourceFromConversation(conversation) });
  }
  return new Map([...byCustomer].map(([id, value]) => [id, value.source]));
}