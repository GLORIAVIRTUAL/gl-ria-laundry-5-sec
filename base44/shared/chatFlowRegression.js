import { normalizePhotoItems, quoteLines, planLabel, explicitFulfillment } from './chatQuotePresentation.js';
import { immediatePaymentMethod, parsePayerField } from './chatPayerDetails.js';
import { acceptChatQuote } from './chatQuoteAcceptance.js';
import { finalizeChatPhotoQuote } from './chatPhotoQuote.js';
import { handleChatPaymentRequest } from './chatPaymentFlow.js';
import { handlePaymentChargeToolCall } from './paymentChargeTool.js';
import { detectDeliveryIntent } from './quoteSafety.js';

function fixture({ total = 214, payer = true, gateway = 'success' } = {}) {
  const customer = { id: 'customer-test', full_name: 'Teste isolado', ...(payer ? { tax_id: '52998224725', address: 'Rua de Teste', address_number: '1', zip_code: '90000000', neighborhood: 'Centro' } : {}) };
  const conversation = { id: 'conversation-test', customer_id: customer.id, created_date: '2026-09-22T00:00:00Z', metadata: { active_quote_id: 'quote-test' } };
  const quote = { id: 'quote-test', customer_id: customer.id, status: 'SENT', subtotal: total, total, items: [{ garment_type: 'VESTIDO - FESTA', qty: 1, unit_price: total }] };
  const tables = { Customer: [customer], Conversation: [conversation], Quote: [quote], CrmCard: [], StaffNotification: [], Product: [], Payment: [], Order: [] };
  const clone = (x) => JSON.parse(JSON.stringify(x)); let nextId = 0; let gatewayCalls = 0;
  const entities = Object.fromEntries(Object.keys(tables).map((name) => [name, {
    get: async (id) => clone(tables[name].find((x) => x.id === id) || null),
    filter: async (query) => clone(tables[name].filter((x) => Object.entries(query || {}).every(([k, v]) => typeof v === 'object' ? (!v.$gte || String(x[k]) >= v.$gte) : x[k] === v))),
    create: async (data) => { const row = { ...clone(data), id: `created-${++nextId}`, created_date: new Date().toISOString() }; tables[name].push(row); return clone(row); },
    update: async (id, data) => { const row = tables[name].find((x) => x.id === id); if (!row) throw new Error(`missing fixture ${name}`); Object.assign(row, clone(data)); return clone(row); },
  }]));
  const base44 = { asServiceRole: { entities, functions: { invoke: async (name) => {
    if (name !== 'generate_payment_link') throw new Error('unexpected external action');
    gatewayCalls++;
    if (gateway === 'timeout') throw new Error('simulated timeout');
    if (gateway === 'incomplete') throw { response: { status: 422, data: { error: 'customer_data_incomplete', missing_fields: ['CEP'] } } };
    tables.Payment.push({ id: 'payment-test', status: 'pending' });
    return { data: { payment_id: 'payment-test', pix_copy_paste_key: 'PIX_TESTE_NAO_PAGAVEL', url: 'https://example.invalid/test' } };
  } } } };
  return { base44, customer: clone(customer), conversation: clone(conversation), currentState: clone(conversation.metadata), quote: clone(quote), tables, gatewayCalls: () => gatewayCalls };
}

export async function runChatFlowRegression() {
  const checks = [];
  const assert = (name, result) => { checks.push({ name, passed: Boolean(result) }); if (!result) throw new Error(`Falhou: ${name}`); };
  assert('Pix agora reconhecido sem IA', immediatePaymentMethod('Pix agora') === 'pix');
  assert('Cartão online reconhecido', immediatePaymentMethod('quero cartão online') === 'credit_card');
  assert('Pergunta, recusa e pagamento já feito não geram cobrança', ['Não quero Pix', 'Paguei Pix', 'Aceita Pix?', 'Pix depois'].every((x) => immediatePaymentMethod(x) === null));
  assert('CPF inválido recusado', parsePayerField('tax_id', '11111111111') === null);
  assert('CPF com dígitos verificadores validado', parsePayerField('tax_id', '529.982.247-25') === '52998224725');
  assert('Perguntar frete não escolhe coleta', !detectDeliveryIntent([{ direction: 'IN', text: 'Quanto custa a coleta?' }], {}));
  assert('Recusar loja não escolhe loja', explicitFulfillment('Não vou levar na loja') === null);
  const items = normalizePhotoItems([{ garment_type: 'BIQUÍNI | SUNGA (POR PEÇA)', unit_price: 18, notes: 'Biquíni de duas peças' }, { garment_type: 'SHORT', unit_price: 17 }, { garment_type: 'SHORT', unit_price: 17 }]);
  assert('Biquíni duas peças com quantidade e total', items[0].qty === 2 && items[0].subtotal === 36);
  assert('Resumo agrupa shorts e não lista catálogo alheio', quoteLines(items).includes('2x SHORT') && !quoteLines(items).includes('MEIA'));
  assert('Planos identificados pelo valor', planLabel({ name: 'Plano 3', price: 500 }) !== planLabel({ name: 'Plano 3', price: 2000 }));
  assert('Quantidade incerta impede cobrança', normalizePhotoItems([{ garment_type: 'BIQUÍNI', qty: null, quantity_uncertain: true, unit_price: 18 }])[0].needs_review);
  const a = fixture();
  const accepted = await acceptChatQuote({ ...a, latestText: 'Quero este orçamento' });
  assert('Frete grátis não inventa ida à loja', accepted.success && accepted.fulfillment_choice === null && !accepted.message.includes('Você escolheu levar'));
  assert('Aprovação não cria cobrança antecipada', a.tables.CrmCard.length === 0 && a.tables.Conversation[0].metadata.flow === 'AWAITING_PAYMENT_METHOD');
  const first = await handleChatPaymentRequest({ ...a, text: 'Pix agora' });
  assert('Pix gerado retorna código sem depender de IA', first.message.includes('PIX_TESTE_NAO_PAGAVEL') && a.gatewayCalls() === 1);
  const repeated = await handleChatPaymentRequest({ ...a, text: 'Pix agora' });
  assert('Pedido repetido reusa mesma cobrança', repeated.message === first.message && a.gatewayCalls() === 1);
  assert('Aguarda confirmação, não comprovante', a.tables.Conversation[0].metadata.flow === 'AWAITING_PAYMENT_CONFIRMATION');
  a.tables.Payment[0].status = 'succeeded';
  assert('Pagamento confirmado não é cobrado novamente', (await handleChatPaymentRequest({ ...a, text: 'Pix agora' })).message.includes('já está confirmado'));
  const low = fixture({ total: 100 });
  assert('Orçamento menor pede logística antes da taxa', !(await acceptChatQuote({ ...low, latestText: 'Quero este orçamento' })).success && low.tables.Quote[0].status === 'SENT');
  const pickup = await acceptChatQuote({ ...low, latestText: 'Quero coleta' });
  assert('Coleta solicitada soma taxa uma vez', pickup.final_total === 115 && low.tables.Conversation[0].metadata.delivery_requested === true);
  const free = fixture(); await acceptChatQuote({ ...free, latestText: 'Quero coleta' });
  assert('Coleta gratuita preserva intenção de coleta', free.tables.Conversation[0].metadata.delivery_requested === true && free.tables.Quote[0].total === 214);
  const incomplete = fixture({ payer: false }); await acceptChatQuote({ ...incomplete, latestText: 'Quero este orçamento' });
  const ask = await handleChatPaymentRequest({ ...incomplete, text: 'Pix agora' });
  assert('Cadastro incompleto pergunta CPF sem chamar gateway', ask.message.includes('CPF') && incomplete.gatewayCalls() === 0);
  const next = await handleChatPaymentRequest({ ...incomplete, text: '52998224725' });
  assert('Dado informado persiste e avança', incomplete.tables.Customer[0].tax_id === '52998224725' && next.message.includes('rua ou avenida'));
  const timed = fixture({ gateway: 'timeout' }); await acceptChatQuote({ ...timed, latestText: 'Quero este orçamento' });
  await handleChatPaymentRequest({ ...timed, text: 'Pix agora' }); await handleChatPaymentRequest({ ...timed, text: 'Pix agora' });
  assert('Timeout não repete emissão e avisa equipe', timed.gatewayCalls() === 1 && timed.tables.StaffNotification.length === 1 && timed.tables.Conversation[0].metadata.flow === 'PAYMENT_NEEDS_REVIEW');
  const tool = fixture(); await acceptChatQuote({ ...tool, latestText: 'Quero este orçamento' });
  assert('Ferramenta da IA usa mesmo fluxo', (await handlePaymentChargeToolCall({ ...tool, toolCall: { function: { name: 'generate_payment_charge', arguments: '{"billing_type":"pix"}' } } })).customer_message.includes('PIX_TESTE_NAO_PAGAVEL'));
  const photo = fixture(); photo.currentState.temp_items = items;
  const summary = await finalizeChatPhotoQuote({ ...photo, unitId: 'unit-test' });
  const saved = photo.tables.Quote.find((x) => x.id === summary.quote_id);
  assert('Fechamento persiste antes de responder com total correto', saved.total === 70 && saved.items.every((x) => x.qty >= 1) && photo.tables.Conversation[0].metadata.active_quote_id === saved.id);
  assert('Estimativa não promete preço definitivo', summary.message.includes('sujeita à inspeção') && !summary.message.includes('sem problemas'));
  return { passed: checks.every((x) => x.passed), checks, external_requests: 0 };
}