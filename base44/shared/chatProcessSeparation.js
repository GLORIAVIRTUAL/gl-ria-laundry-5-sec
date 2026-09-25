import { affirmativePaymentMethod } from './chatPayerDetails.js';
import { explicitFulfillment } from './chatQuotePresentation.js';

const PICKUP_FLOWS = new Set(['AWAITING_PICKUP_DATE', 'AWAITING_PICKUP_PERIOD', 'AWAITING_PICKUP_ADDRESS', 'AWAITING_PICKUP_CONFIRMATION']);

export const isPickupProcessActive = (state = {}) => PICKUP_FLOWS.has(state.flow);

// Coleta e pagamento são processos independentes. Quando ambos aparecem na mesma
// mensagem, registra-se a intenção de pagamento, mas conclui-se primeiro a coleta.
export async function separateChatProcesses({ base44, conversation, currentState, text }) {
  const fulfillment = explicitFulfillment(text, { awaitingChoice: currentState.flow === 'AWAITING_FULFILLMENT_CHOICE' });
  if (!fulfillment) return null;
  if (currentState.active_quote_id) {
    const quote = await base44.asServiceRole.entities.Quote.get(currentState.active_quote_id);
    if (quote?.status !== 'ACCEPTED') return null;
  }
  const paymentMethod = affirmativePaymentMethod(text);
  const nextState = {
    ...currentState,
    fulfillment_choice: fulfillment,
    delivery_requested: fulfillment === 'pickup',
    pending_payment_method: paymentMethod || currentState.pending_payment_method || null,
    flow: fulfillment === 'pickup' ? 'AWAITING_PICKUP_DATE' : 'AWAITING_PAYMENT_METHOD',
  };
  await base44.asServiceRole.entities.Conversation.update(conversation.id, { metadata: nextState });
  Object.assign(currentState, nextState);
  return {
    handled: true,
    message: fulfillment === 'pickup'
      ? 'Coleta escolhida. Qual data você prefere?'
      : 'Combinado, você levará as peças na loja. Essa etapa ficou registrada.',
  };
}