import { normalizeChatText, normalizePhotoItems, quoteLines, brl, inspectionNotice } from './chatQuotePresentation.js';

export function isQuoteApproval(text = '') {
  const value = normalizeChatText(text).replace(/[.!✅👍\s]+$/gu, '').trim();
  return /^(sim|aprovo|aprovar|aprovado|aceito|aceitar|confirmo|pode (fechar|aprovar)|quero (este|esse) orcamento|follow_quote|approve_quote|sim[, ]+pode (fechar|aprovar))$/.test(value) || /^[✅👍]+$/u.test(text.trim());
}

export function chatQuoteSummary(quote) {
  const items = normalizePhotoItems(quote.items || []);
  return `*Resumo do orçamento*\n${quoteLines(items)}\n\n*Total estimado: ${brl(quote.total)}*\n${inspectionNotice}\n\nVocê aprova este orçamento?`;
}

export const quoteConsentSignature = (quote) => JSON.stringify({ items: normalizePhotoItems(quote.items || []).map(i => [i.product_id || '', i.garment_type, i.qty, i.unit_price]), total: quote.total, discount: quote.discount || 0, addition: quote.addition || 0 });

// A ferramenta escolhida pela IA nunca vale como consentimento do cliente.
// Exige resumo discriminado realmente enviado e uma resposta posterior do cliente.
export async function requireChatQuoteConsent({ base44, quote, conversation, currentState, latestText, latestMessage }) {
  const db = base44.asServiceRole.entities;
  const signature = quoteConsentSignature(quote);
  const consent = quote.metadata?.chat_customer_consent;
  if (consent?.signature === signature && currentState.flow === 'AWAITING_FULFILLMENT_CHOICE' && !/\bnao\b|\bcancel/.test(normalizeChatText(latestText))) return null;
  const inbound = latestMessage || (await db.Message.filter({ conversation_id: conversation.id, direction: 'IN' }, '-created_date', 1))[0];
  const outbound = await db.Message.filter({ conversation_id: conversation.id, direction: 'OUT' }, '-created_date', 25);
  const lines = quoteLines(normalizePhotoItems(quote.items || []));
  const presented = lines && outbound.find(m => m.text?.includes(lines) && m.text.includes(brl(quote.total)) && new Date(m.created_date) >= new Date(quote.created_date) && new Date(m.created_date) < new Date(inbound?.created_date));
  const accepted = presented && currentState.flow === 'AWAITING_QUOTE_APPROVAL' && inbound?.text === latestText && isQuoteApproval(latestText);
  if (accepted) {
    const metadata = { ...(quote.metadata || {}), chat_customer_consent: { signature, message_id: inbound.id, presentation_message_id: presented.id, accepted_at: new Date().toISOString() } };
    await db.Quote.update(quote.id, { metadata });
    quote.metadata = metadata;
    return null;
  }
  Object.assign(currentState, { active_quote_id: quote.id, flow: 'AWAITING_QUOTE_APPROVAL', step: 'AWAITING_QUOTE_APPROVAL' });
  await db.Conversation.update(conversation.id, { metadata: { ...currentState } });
  return { success: false, requires_approval: true, quote_id: quote.id, message: chatQuoteSummary(quote) };
}