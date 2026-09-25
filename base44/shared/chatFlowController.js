// ============================================================================
// Controlador do fluxo pós-orçamento. O SISTEMA conduz as etapas:
//   orçamento aprovado → coleta ou loja → coleta agendada (próximo turno com vaga)
//   → pagar antecipado ou na loja → Pix ou cartão → link → confirmação do banco.
// A IA só interpreta respostas ambíguas (chatIntentClassifier); nunca executa ações.
// ============================================================================
import { findNextAvailablePickupDay, pickupDayLabel } from './nextPickupDay.js';
import { normalizeChatText } from './chatQuotePresentation.js';
import { looksLikeAddress, savedCustomerAddress, PAYMENT_QUESTION } from './chatPickupFlow.js';
import { classifyStageReply } from './chatIntentClassifier.js';
import { upsertPaymentCard } from './crmPaymentCard.js';
import { processChatPayment } from './chatPaymentFlow.js';

export const FULFILLMENT_QUESTION = 'Você prefere que a gente faça a *coleta* no seu endereço ou você vai *levar as peças na loja*?';
export const PAYMENT_TIMING_QUESTION = PAYMENT_QUESTION;
export const PAYMENT_METHOD_QUESTION = 'Perfeito! Você prefere pagar por *Pix* ou *cartão de crédito*?';
const ADDRESS_QUESTION = 'Para agendar a coleta, me envie o endereço completo: rua, número, complemento e bairro. 😊';

const STAGES = {
  AWAITING_FULFILLMENT_CHOICE: { question: FULFILLMENT_QUESTION, options: { pickup: 'quer que a loja busque/colete as peças no endereço dele', store: 'vai levar as peças na loja' } },
  AWAITING_PAYMENT_TIMING: { question: PAYMENT_TIMING_QUESTION, options: { advance: 'quer pagar antecipado agora', store: 'quer pagar na loja ou na entrega', pix: 'quer pagar antecipado por Pix', credit_card: 'quer pagar antecipado com cartão de crédito' } },
  AWAITING_PAYMENT_METHOD: { question: PAYMENT_METHOD_QUESTION, options: { pix: 'escolheu Pix', credit_card: 'escolheu cartão de crédito', store: 'desistiu e prefere pagar na loja' } },
};

// Leitura determinística (rápida e sem custo). Só quando não reconhece, a IA interpreta.
const quickChoice = (flow, text) => {
  const v = normalizeChatText(text);
  if (/\?/.test(v)) return null;
  if (flow === 'AWAITING_FULFILLMENT_CHOICE') {
    if (/\bnao\b.{0,20}\b(coleta|buscar)\b/.test(v) || /\b(loja|eu levo|levo eu|vou levar|deixar ai|levar ai)\b/.test(v)) return 'store';
    if (/\b(coleta|coletar|buscar|busca|busquem|retirar|minha casa|em casa|meu endereco|domicilio|tele)\b/.test(v)) return 'pickup';
  }
  if (flow === 'AWAITING_PAYMENT_TIMING' || flow === 'AWAITING_PAYMENT_METHOD') {
    if (/\b(na loja|na entrega|presencial|na hora|quando (buscar|retirar|entregar)|dinheiro|depois)\b/.test(v)) return 'store';
    if (/\bpix\b/.test(v)) return 'pix';
    if (/\bcartao|credito\b/.test(v)) return 'credit_card';
    if (flow === 'AWAITING_PAYMENT_TIMING' && /\b(antecipad|adiantad|agora|online|antes)\w*/.test(v)) return 'advance';
  }
  return null;
};

const save = (base44, conversation, state, patch) => {
  Object.assign(state, patch);
  return base44.asServiceRole.entities.Conversation.update(conversation.id, { metadata: { ...state } });
};

const periodLabel = (p) => (p === 'morning' ? 'manhã (das 8h às 12h)' : 'tarde (das 13h às 16h)');
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// Agenda no PRÓXIMO turno com vaga (hoje, se permitido, ou o próximo dia com vagas).
export async function schedulePickupAuto(ctx, providedAddress = null) {
  const { base44, customer, conversation, currentState, schedulePickup } = ctx;
  const address = providedAddress || await savedCustomerAddress(base44, customer.id);
  if (!address) {
    await save(base44, conversation, currentState, { flow: 'PICKUP_ADDRESS_AUTO', step: 'PICKUP_ADDRESS_AUTO' });
    return { messages: [ADDRESS_QUESTION] };
  }
  let from = todayKey();
  for (let attempt = 0; attempt < 4; attempt++) {
    const next = await findNextAvailablePickupDay(base44, from, { includeFromDate: true });
    if (!next) break;
    const periods = [next.morning > 0 && 'morning', next.afternoon > 0 && 'afternoon'].filter(Boolean);
    for (const period of periods) {
      const result = await schedulePickup({ date: next.date, period, address, notes: currentState.active_quote_id ? `Orçamento ${currentState.active_quote_id.slice(0, 8)}` : '' });
      if (result?.success) {
        await save(base44, conversation, currentState, {
          flow: 'AWAITING_PAYMENT_TIMING', step: 'AWAITING_PAYMENT_TIMING', pending_pickup: null,
          fulfillment_choice: 'pickup', delivery_requested: true,
          last_successful_action: { action: 'pickup_scheduled', at: new Date().toISOString(), date: next.date, period }
        });
        return { scheduled: true, messages: [`🚚 *Coleta agendada!* ${pickupDayLabel(next.date)}, turno da ${periodLabel(period)}.\nEndereço: ${address}`, PAYMENT_TIMING_QUESTION] };
      }
      if (/ENDEREÇO/.test(String(result?.error || ''))) {
        await save(base44, conversation, currentState, { flow: 'PICKUP_ADDRESS_AUTO', step: 'PICKUP_ADDRESS_AUTO' });
        return { messages: ['Não consegui confirmar o endereço. ' + ADDRESS_QUESTION] };
      }
    }
    from = nextDay(next.date); // turnos lotaram entre a consulta e o agendamento
  }
  return { handoff: 'Não encontrei vaga de coleta nos próximos dias', messages: [] };
}

const nextDay = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10); };

async function payAtStore(ctx) {
  const { base44, customer, conversation, currentState } = ctx;
  await save(base44, conversation, currentState, { flow: 'PAYMENT_AT_STORE', step: 'PAYMENT_AT_STORE', payment_timing: 'store', payment_method: null });
  await upsertPaymentCard(base44, { customerId: customer.id, unitId: customer.unit_id, quoteId: currentState.active_quote_id, orderId: currentState.active_order_id, stage: 'Pagar na loja' });
  const where = currentState.fulfillment_choice === 'pickup' ? 'na entrega ou na loja' : 'na loja';
  return { messages: [`Combinado! O pagamento será feito ${where}, em dinheiro, Pix ou cartão. ✅\n\nQualquer dúvida sobre suas peças, é só me chamar por aqui. 😊`] };
}

async function payInAdvance(ctx, method) {
  const { base44, customer, conversation, currentState } = ctx;
  if (!method) {
    await save(base44, conversation, currentState, { flow: 'AWAITING_PAYMENT_METHOD', step: 'AWAITING_PAYMENT_METHOD', payment_timing: 'advance' });
    return { messages: [PAYMENT_METHOD_QUESTION] };
  }
  currentState.payment_timing = 'advance';
  const result = await processChatPayment({ base44, customer, conversation, currentState, billingType: method });
  return { messages: [result.message] };
}

/**
 * Trata a mensagem quando a conversa está numa etapa controlada pelo sistema.
 * Retorna { messages, handoff? } ou null (fora das etapas / pergunta livre → IA responde).
 */
export async function runChatFlow(ctx) {
  const { base44, currentState, text, model } = ctx;
  const flow = currentState.flow;

  // Etapa antiga que perguntava data: agora a coleta é sempre no próximo turno com vaga.
  if (flow === 'AWAITING_PICKUP_DATE') return schedulePickupAuto(ctx);

  if (flow === 'PICKUP_ADDRESS_AUTO') {
    if (looksLikeAddress(text)) return schedulePickupAuto(ctx, String(text).trim());
    if (/\?/.test(text)) return null;
    return { messages: [ADDRESS_QUESTION] };
  }

  const stage = STAGES[flow];
  if (!stage) return null;
  if (!currentState.active_quote_id && !currentState.active_order_id) return null;
  if (flow === 'AWAITING_FULFILLMENT_CHOICE' && currentState.active_quote_id) {
    const quote = await base44.asServiceRole.entities.Quote.get(currentState.active_quote_id).catch(() => null);
    if (quote?.status !== 'ACCEPTED') return null; // ainda falta a aprovação: segue o fluxo de consentimento
  }

  let choice = quickChoice(flow, text);
  if (!choice) choice = await classifyStageReply({ stageQuestion: stage.question, options: stage.options, text, model });
  if (choice === 'question') return null;
  if (choice === 'unclear' || !choice) return { messages: [`Só para eu seguir certinho: ${stage.question}`] };

  if (flow === 'AWAITING_FULFILLMENT_CHOICE') {
    if (choice === 'pickup') return schedulePickupAuto(ctx);
    await save(base44, ctx.conversation, currentState, { fulfillment_choice: 'store', delivery_requested: false, flow: 'AWAITING_PAYMENT_TIMING', step: 'AWAITING_PAYMENT_TIMING' });
    return { messages: [`Combinado, você vai levar as peças na loja. ✅\n\n${PAYMENT_TIMING_QUESTION}`] };
  }
  if (choice === 'store') return payAtStore(ctx);
  return payInAdvance(ctx, choice === 'advance' ? null : choice);
}