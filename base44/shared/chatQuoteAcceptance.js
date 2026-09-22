import { explicitFulfillment, normalizePhotoItems, brl } from './chatQuotePresentation.js';

// A aprovação comercial não significa pagamento nem recebimento físico das roupas.
export async function acceptChatQuote({ base44, quote, conversation, currentState, latestText, activePickups = [] }) {
  if (quote.customer_id !== conversation.customer_id) throw new Error('quote_customer_mismatch');
  if (!['SENT', 'ACCEPTED'].includes(quote.status)) return { success: false, message: 'Este orçamento precisa ser revisado antes de seguir com o pagamento.' };
  if (quote.status === 'ACCEPTED') {
    const acceptedChoice = explicitFulfillment(latestText);
    if (acceptedChoice) {
      const nextFlow = acceptedChoice === 'pickup' ? 'AWAITING_PICKUP_DATE' : 'AWAITING_PAYMENT_METHOD';
      Object.assign(currentState, { fulfillment_choice: acceptedChoice, delivery_requested: acceptedChoice === 'pickup', flow: nextFlow, step: nextFlow });
      await base44.asServiceRole.entities.Conversation.update(conversation.id, { metadata: { ...currentState } });
      return { success: true, message: acceptedChoice === 'pickup' ? 'Coleta escolhida. Qual data você prefere?' : 'Combinado, você levará as peças na loja.' };
    }
    return { success: true, message: 'Este orçamento já foi aceito. Você prefere Pix ou cartão de crédito antecipado, ou pagamento presencial?' };
  }
  const items = normalizePhotoItems(quote.items || []);
  if (!items.length || items.some((item) => item.needs_review)) return { success: false, message: 'Precisamos conferir os itens e as quantidades deste orçamento com a equipe antes de cobrar.' };
  const choice = explicitFulfillment(latestText) || currentState.fulfillment_choice || (currentState.delivery_requested === true || activePickups.length ? 'pickup' : null);
  const piecesTotal = Math.round((Number(quote.subtotal ?? quote.total) - Number(quote.discount || 0)) * 100) / 100;
  if (!Number.isFinite(piecesTotal) || piecesTotal <= 0) return { success: false, message: 'O valor deste orçamento precisa ser conferido pela equipe antes da cobrança.' };
  if (piecesTotal <= 150 && !choice) {
    Object.assign(currentState, { active_quote_id: quote.id, flow: 'AWAITING_FULFILLMENT_CHOICE', step: 'AWAITING_FULFILLMENT_CHOICE' });
    await base44.asServiceRole.entities.Conversation.update(conversation.id, { metadata: { ...currentState } });
    return { success: false, message: 'Você prefere coleta e entrega por R$ 15,00 ou levar as peças na loja?' };
  }
  const deliveryFee = choice === 'pickup' && piecesTotal <= 150 ? 15 : 0;
  const oldFee = Number(quote.metadata?.chat_delivery_fee || 0);
  const addition = Math.max(0, Number(quote.addition || 0) - oldFee) + deliveryFee;
  const total = Math.round((piecesTotal + addition) * 100) / 100;
  await base44.asServiceRole.entities.Quote.update(quote.id, { status: 'ACCEPTED', accepted_at: quote.accepted_at || new Date().toISOString(), items, addition, total, metadata: { ...(quote.metadata || {}), chat_delivery_fee: deliveryFee } });
  const cards = await base44.asServiceRole.entities.CrmCard.filter({ pipeline_type: 'QUOTE', linked_quote_id: quote.id });
  for (const card of cards) await base44.asServiceRole.entities.CrmCard.update(card.id, { stage: 'Aprovado' });
  Object.assign(currentState, { active_quote_id: quote.id, flow: 'AWAITING_PAYMENT_METHOD', step: 'AWAITING_PAYMENT_METHOD', fulfillment_choice: choice, delivery_requested: choice === 'pickup', temp_items: [] });
  await base44.asServiceRole.entities.Conversation.update(conversation.id, { metadata: { ...currentState } });
  const shipping = choice === 'store' ? 'Você escolheu levar as peças na loja.' : choice === 'pickup' ? `Coleta e entrega: ${brl(deliveryFee)}.` : 'Coleta e entrega são cortesia; você ainda não escolheu entre coleta e levar na loja.';
  return { success: true, quote_id: quote.id, final_total: total, delivery_fee: deliveryFee, fulfillment_choice: choice,
    message: `Orçamento aceito: ${brl(total)}. ${shipping}\n\nVocê prefere pagar antecipado por Pix ou cartão de crédito, ou presencialmente em dinheiro/cartão?`,
    instruction: 'Use o total oficial. Não invente uma escolha de coleta/loja. A cobrança ainda NÃO foi emitida; não peça comprovante. Aguarde a forma de pagamento.' };
}