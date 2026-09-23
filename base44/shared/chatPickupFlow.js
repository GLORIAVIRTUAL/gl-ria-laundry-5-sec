// Etapas determinísticas da coleta: turno → endereço → agendamento real.
// Só depois da coleta agendada o atendimento pergunta a forma de pagamento,
// em mensagem separada (coleta e pagamento nunca vão na mesma pergunta).

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

  if (!looksLikeAddress(text)) {
    if (!period) return null; // pergunta/assunto livre no meio da etapa: a IA responde
    await save({ pending_pickup: pp, flow: 'AWAITING_PICKUP_ADDRESS', step: 'AWAITING_PICKUP_ADDRESS' });
    return { messages: [`Perfeito, coleta dia ${dateLabel(pp.date)} no turno da ${periodLabel(pp.period)}. Qual o endereço completo da coleta (rua, número, complemento e bairro)?`] };
  }

  const address = String(text).trim();
  const result = await schedulePickup({ date: pp.date, period: pp.period, address });
  if (!result?.success) {
    await save({ pending_pickup: pp, flow: 'AWAITING_PICKUP_ADDRESS', step: 'AWAITING_PICKUP_ADDRESS' });
    const reason = String(result?.error || '');
    const friendly = /LOTADO|lotado/.test(reason)
      ? 'Esse turno acabou de lotar. Você prefere outro turno ou outra data?'
      : /ENDEREÇO/.test(reason)
        ? 'Não consegui confirmar o endereço. Pode enviar rua, número, complemento e bairro?'
        : 'Não consegui agendar a coleta nesse horário. Você prefere outro turno ou outra data?';
    return { messages: [friendly] };
  }

  const hasQuote = Boolean(currentState.active_quote_id);
  const nextFlow = hasQuote ? 'AWAITING_PAYMENT_METHOD' : null;
  await save({
    pending_pickup: null,
    flow: nextFlow,
    step: nextFlow,
    fulfillment_choice: 'pickup',
    delivery_requested: true,
    last_successful_action: { action: 'pickup_scheduled', at: new Date().toISOString(), date: pp.date, period: pp.period }
  });
  const messages = [`🚚 Coleta agendada! Dia ${dateLabel(pp.date)}, turno da ${periodLabel(pp.period)}, no endereço: ${address}.`];
  if (hasQuote) messages.push('Agora sobre o pagamento: você prefere pagar antecipado por Pix ou cartão de crédito, ou pagar na entrega/loja em dinheiro ou cartão?');
  return { messages };
}