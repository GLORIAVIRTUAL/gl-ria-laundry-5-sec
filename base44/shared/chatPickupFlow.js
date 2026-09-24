// Etapas determinísticas da coleta: turno → endereço → agendamento real.
// Só depois da coleta agendada o atendimento pergunta a forma de pagamento,
// em mensagem separada (coleta e pagamento nunca vão na mesma pergunta).

import { findNextAvailablePickupDay, nextDayOffer } from './nextPickupDay.js';
import { pickupShiftError } from './pickupShiftPolicy.js';

const PICKUP_FLOWS = new Set(['AWAITING_PICKUP_PERIOD', 'AWAITING_PICKUP_CONFIRMATION', 'AWAITING_PICKUP_ADDRESS']);

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export const parsePeriod = (text) => {
  const t = norm(text);
  if (/\bmanha\b|\bcedo\b/.test(t)) return 'morning';
  if (/\btarde\b/.test(t)) return 'afternoon';
  return null;
};

export const looksLikeAddress = (text) => {
  const t = norm(text);
  return t.length >= 8 && /\d/.test(t) && /[a-z]{3,}/.test(t) && !/^\d{1,2}\/\d{1,2}/.test(t);
};

const isAffirmative = (text) => /^(sim|s|ok|okay|pode|pode ser|confirmo|confirmado|isso|certo|claro|beleza|perfeito|fechado|pode sim|sim pode|sim por favor)[!. ]*$/.test(norm(text));

const savedAddress = async (base44, customerId) => {
  const c = customerId ? await base44.asServiceRole.entities.Customer.get(customerId).catch(() => null) : null;
  if (!c?.address || !c?.address_number) return null;
  return `${c.address}, ${c.address_number}${c.address_complement ? `, ${c.address_complement}` : ''}${c.neighborhood ? `, ${c.neighborhood}` : ''}`;
};

const periodLabel = (p) => (p === 'morning' ? 'manhã (das 8h às 12h)' : 'tarde (das 13h às 16h)');
const dateLabel = (date) => { const [, m, d] = date.split('-'); return `${d}/${m}`; };

// Retorna { messages: string[] } quando tratou a mensagem, ou null para seguir com a IA.
export async function handlePickupStep({ base44, text, currentState, conversation, schedulePickup }) {
  if (!PICKUP_FLOWS.has(currentState.flow) || currentState.payment_confirmed) return null;
  const pp = { ...(currentState.pending_pickup || {}) };
  if (!pp.date) return null;

  const save = async (patch) => {
    Object.assign(currentState, patch);
    await base44.asServiceRole.entities.Conversation.update(conversation.id, { metadata: { ...currentState } });
  };

  const period = parsePeriod(text);
  if (period) pp.period = period;

  if (!pp.period) return null; // resposta fora do esperado: a IA conduz

  if (pickupShiftError(pp.date, pp.period)) {
    const next = await findNextAvailablePickupDay(base44, pp.date, { includeFromDate: true });
    const onlyShift = next && !(next.morning > 0 && next.afternoon > 0) ? (next.morning > 0 ? 'morning' : 'afternoon') : null;
    const flow = onlyShift ? 'AWAITING_PICKUP_CONFIRMATION' : 'AWAITING_PICKUP_PERIOD';
    await save({ pending_pickup: next ? { date: next.date, period: onlyShift } : null, flow, step: flow });
    return { messages: [`Não agendamos coletas no turno atual ou em turnos passados. ${nextDayOffer(next)}`] };
  }

  let address = looksLikeAddress(text) ? String(text).trim() : null;
  if (!address && isAffirmative(text)) address = pp.address || await savedAddress(base44, conversation.customer_id);
  if (!address && period) {
    // Cliente escolheu o turno: com endereço salvo, só pede confirmação.
    const saved = await savedAddress(base44, conversation.customer_id);
    if (saved) {
      await save({ pending_pickup: { ...pp, address: saved }, flow: 'AWAITING_PICKUP_CONFIRMATION', step: 'AWAITING_PICKUP_CONFIRMATION' });
      return { messages: [`Perfeito! Coleta dia ${dateLabel(pp.date)} no turno da ${periodLabel(pp.period)}, no endereço ${saved}. Posso confirmar? (Se for outro endereço, é só me enviar.)`] };
    }
  }
  if (!address) {
    if (!period) return null; // pergunta/assunto livre no meio da etapa: a IA responde
    await save({ pending_pickup: pp, flow: 'AWAITING_PICKUP_ADDRESS', step: 'AWAITING_PICKUP_ADDRESS' });
    return { messages: [`Perfeito, coleta dia ${dateLabel(pp.date)} no turno da ${periodLabel(pp.period)}. Qual o endereço completo da coleta (rua, número, complemento e bairro)?`] };
  }

  const result = await schedulePickup({ date: pp.date, period: pp.period, address });
  if (!result?.success) {
    await save({ pending_pickup: pp, flow: 'AWAITING_PICKUP_ADDRESS', step: 'AWAITING_PICKUP_ADDRESS' });
    const reason = String(result?.error || '');
    if (/LOTADO|lotado/.test(reason)) {
      // Oferece o próximo dia/turno com vaga real (inclui o outro turno do mesmo dia).
      const next = await findNextAvailablePickupDay(base44, pp.date, { includeFromDate: true });
      const onlyShift = next && !(next.morning > 0 && next.afternoon > 0) ? (next.morning > 0 ? 'morning' : 'afternoon') : null;
      const nextPp = next ? { date: next.date, ...(onlyShift ? { period: onlyShift } : {}) } : pp;
      await save({ pending_pickup: nextPp, flow: onlyShift ? 'AWAITING_PICKUP_CONFIRMATION' : 'AWAITING_PICKUP_PERIOD', step: onlyShift ? 'AWAITING_PICKUP_CONFIRMATION' : 'AWAITING_PICKUP_PERIOD' });
      return { messages: [`Esse turno acabou de lotar. ${nextDayOffer(next)}`] };
    }
    const friendly = /ENDEREÇO/.test(reason)
        ? 'Não consegui confirmar o endereço. Pode enviar rua, número, complemento e bairro?'
        : 'Não consegui agendar a coleta nesse horário. Você prefere outro turno ou outra data?';
    return { messages: [friendly] };
  }

  const messages = markPickupScheduled(currentState, { date: pp.date, period: pp.period, address });
  await save({});
  return { messages };
}

// Estado e mensagens após a coleta ser agendada de fato (qualquer caminho: etapa
// determinística ou ferramenta da IA). Avança o fluxo para o pagamento quando há orçamento.
export function markPickupScheduled(state, { date, period, address }) {
  const hasQuote = Boolean(state.active_quote_id || state.active_order_id);
  const nextFlow = hasQuote ? 'AWAITING_PAYMENT_METHOD' : null;
  Object.assign(state, {
    pending_pickup: null,
    flow: nextFlow,
    step: nextFlow,
    fulfillment_choice: 'pickup',
    delivery_requested: true,
    last_successful_action: { action: 'pickup_scheduled', at: new Date().toISOString(), date, period }
  });
  const messages = [`🚚 Coleta agendada! Dia ${dateLabel(date)}, turno da ${periodLabel(period)}${address ? `, no endereço: ${address}` : ''}.`];
  if (hasQuote) messages.push(PAYMENT_QUESTION);
  return messages;
}

export const PAYMENT_QUESTION = 'Agora sobre o pagamento: você prefere pagar antecipado por Pix ou cartão de crédito, ou pagar na entrega/loja em dinheiro ou cartão?';

// Coleta já agendada nas últimas horas: a IA não deve pedir tudo de novo.
export const pickupRecentlyScheduled = (state = {}) => {
  const last = state.last_successful_action;
  return last?.action === 'pickup_scheduled' && Date.now() - new Date(last.at).getTime() < 12 * 3600 * 1000;
};