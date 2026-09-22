import { immediatePaymentMethod, missingPayerField, payerQuestion, parsePayerField } from './chatPayerDetails.js';

const saveState = (base44, conversation, state) => base44.asServiceRole.entities.Conversation.update(conversation.id, { metadata: { ...state } });
const paymentMessage = (charge) => charge.billing_type === 'pix' && charge.pix_copy_paste_key
  ? `Copie e cole este código Pix no aplicativo do seu banco:\n\n${charge.pix_copy_paste_key}\n\nA confirmação do pagamento é automática.`
  : `Acesse o link para pagar com ${charge.billing_type === 'pix' ? 'Pix' : 'cartão de crédito'}:\n${charge.url}\n\nA confirmação do pagamento é automática.`;

export async function processChatPayment({ base44, customer, conversation, currentState, billingType }) {
  const db = base44.asServiceRole.entities;
  const freshConversation = await db.Conversation.get(conversation.id);
  Object.assign(currentState, freshConversation.metadata || {});
  let quote = null;
  let referenceKey = null;
  if (currentState.active_order_id) {
    const order = await db.Order.get(currentState.active_order_id);
    if (order?.customer_id !== customer.id || ['paid', 'refunded', 'cancelled'].includes(order?.payment_status) || ['cancelled', 'finished'].includes(order?.status)) return { handled: true, message: 'Este pedido precisa ser conferido pela equipe antes de emitir uma cobrança.' };
    quote = { id: order.id, customer_id: order.customer_id, status: 'ACCEPTED' };
    referenceKey = { order_id: order.id };
  } else if (currentState.active_quote_id) quote = await db.Quote.get(currentState.active_quote_id);
  else {
    const quotes = await db.Quote.filter({ customer_id: customer.id, status: 'ACCEPTED', created_date: { $gte: currentState.new_quote_started_at || conversation.created_date } }, '-created_date', 1);
    quote = quotes[0];
  }
  if (!quote || quote.customer_id !== customer.id || quote.status !== 'ACCEPTED') return { handled: true, message: 'Antes de gerar o pagamento, precisamos concluir e aprovar o orçamento deste atendimento.' };
  if (!referenceKey) { referenceKey = { quote_id: quote.id }; currentState.active_quote_id = quote.id; }
  const charge = currentState.payment_charge?.reference_id === quote.id ? currentState.payment_charge : null;
  if (charge) {
    if (charge.payment_id) {
      const payment = await db.Payment.get(charge.payment_id);
      if (payment?.status === 'succeeded') return { handled: true, message: 'O pagamento deste orçamento já está confirmado. Não é necessário pagar novamente.' };
      if (payment?.status !== 'pending') return { handled: true, message: 'A cobrança anterior precisa ser conferida pela equipe antes de emitir outra.' };
    }
    if (charge.status === 'ready' && charge.billing_type === billingType && Date.now() - new Date(charge.created_at).getTime() < 86400000) return { handled: true, message: paymentMessage(charge) };
    return { handled: true, message: 'Já existe uma tentativa de cobrança para este orçamento. Ela precisa ser conferida antes de emitir outra, para evitar pagamento duplicado.' };
  }
  const payer = await db.Customer.get(customer.id);
  const missing = missingPayerField(payer);
  currentState.payment_method = billingType;
  if (missing) {
    Object.assign(currentState, { flow: 'COLLECTING_PAYER_DATA', payer_field: missing[0] });
    await saveState(base44, conversation, currentState);
    return { handled: true, message: payerQuestion(missing) };
  }
  Object.assign(currentState, { flow: 'GENERATING_PAYMENT', payer_field: null, payment_charge: { reference_id: quote.id, ...referenceKey, billing_type: billingType, status: 'creating', created_at: new Date().toISOString() } });
  await saveState(base44, conversation, currentState);
  let data;
  try {
    const result = await base44.asServiceRole.functions.invoke('generate_payment_link', { ...referenceKey, billing_type: billingType, _internal_token: Deno.env.get('INTERNAL_FUNCTION_TOKEN') });
    data = result?.data || {};
  } catch (error) {
    data = error?.response?.data || { status: 'pending_verification' };
    if (Number(error?.response?.status || 0) >= 500) data = { ...data, status: 'pending_verification' };
  }
  if (data.error === 'customer_data_incomplete') {
    currentState.payment_charge = null;
    currentState.flow = 'AWAITING_PAYMENT_METHOD';
    await saveState(base44, conversation, currentState);
    return { handled: true, message: `Faltam dados para emitir a cobrança: ${(data.missing_fields || []).join(', ')}. Peça à equipe para conferir o cadastro antes de tentar novamente.` };
  }
  if (data.status === 'pending_verification' || data.error || !data.payment_id || (!data.pix_copy_paste_key && !data.url)) {
    currentState.flow = 'PAYMENT_NEEDS_REVIEW';
    currentState.payment_charge.status = 'pending_verification';
    await saveState(base44, conversation, currentState);
    await db.StaffNotification.create({ type: 'SYSTEM_ERROR', target_team: 'support', payload: { conversation_id: conversation.id, customer_name: customer.full_name, quote_id: quote.id, summary: 'Conferir tentativa de cobrança antes de emitir outra.', error: data.error || 'pending_verification' }, sent_at: new Date().toISOString() });
    return { handled: true, message: 'Não consegui concluir a emissão da cobrança com segurança. Avisei a equipe para conferir antes de gerar outra; por enquanto, não faça um novo pagamento.' };
  }
  currentState.payment_charge = { ...currentState.payment_charge, status: 'ready', payment_id: data.payment_id, pix_copy_paste_key: data.pix_copy_paste_key || null, url: data.url || null };
  currentState.flow = 'AWAITING_PAYMENT_CONFIRMATION';
  await saveState(base44, conversation, currentState);
  return { handled: true, message: paymentMessage(currentState.payment_charge) };
}

export async function handleChatPaymentRequest({ base44, customer, conversation, currentState, text }) {
  const method = immediatePaymentMethod(text);
  if (currentState.flow === 'COLLECTING_PAYER_DATA' && /^\s*(cancelar|depois|pagar depois)\s*[.!]?$/i.test(text)) {
    Object.assign(currentState, { payer_field: null, flow: 'AWAITING_PAYMENT_METHOD', payment_method: null });
    await saveState(base44, conversation, currentState);
    return { handled: true, message: 'Tudo bem, nenhuma cobrança foi emitida. Você pode escolher a forma de pagamento depois.' };
  }
  if (!method && currentState.flow !== 'COLLECTING_PAYER_DATA') return null;
  if (!method && currentState.payer_field) {
    const value = parsePayerField(currentState.payer_field, text);
    if (!value) {
      const field = missingPayerField(await base44.asServiceRole.entities.Customer.get(customer.id));
      return { handled: true, message: field ? `Não consegui validar esse dado. ${payerQuestion(field)}` : 'Os dados foram atualizados. Você prefere Pix ou cartão de crédito?' };
    }
    await base44.asServiceRole.entities.Customer.update(customer.id, { [currentState.payer_field]: value });
  }
  return processChatPayment({ base44, customer, conversation, currentState, billingType: method || currentState.payment_method });
}