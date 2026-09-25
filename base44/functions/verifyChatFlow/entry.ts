import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { runChatFlow } from '../../shared/chatFlowController.js';

// Verificação temporária das etapas do fluxo (sem WhatsApp, sem cobrança, sem coleta real).
export default async function(req) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || !['admin', 'super_admin'].includes(user.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const db = base44.asServiceRole.entities;
  const created = [];
  const results = {};
  try {
    const customer = await db.Customer.create({ full_name: 'QA fluxo temporário', phones: [], address: 'Rua Teste QA', address_number: '100', neighborhood: 'Centro' }); created.push(['Customer', customer.id]);
    const conversation = await db.Conversation.create({ customer_id: customer.id, channel: 'WHATSAPP', handoff_required: true, metadata: {} }); created.push(['Conversation', conversation.id]);
    const quote = await db.Quote.create({ customer_id: customer.id, status: 'ACCEPTED', items: [], total: 179 }); created.push(['Quote', quote.id]);
    const scheduled = [];
    const schedulePickup = async (p) => { scheduled.push(p); return { success: true }; };
    const run = async (flow, text, extra = {}) => {
      const currentState = { active_quote_id: quote.id, flow, ...extra };
      const r = await runChatFlow({ base44, customer, conversation, currentState, text, schedulePickup });
      return { flow_after: currentState.flow, messages: r?.messages || null, returned_null: r === null };
    };
    results.na_minha_casa = await run('AWAITING_FULFILLMENT_CHOICE', 'na minha casa');
    results.ambiguo_ia = await run('AWAITING_FULFILLMENT_CHOICE', 'pode mandar o motoboy aqui');
    results.eu_levo = await run('AWAITING_FULFILLMENT_CHOICE', 'eu mesma levo');
    results.pergunta = await run('AWAITING_FULFILLMENT_CHOICE', 'quanto custa a coleta?');
    results.antecipado = await run('AWAITING_PAYMENT_TIMING', 'prefiro pagar antecipado');
    results.pagar_na_loja = await run('AWAITING_PAYMENT_TIMING', 'pago quando for buscar as roupas', { fulfillment_choice: 'store' });
    results.scheduled_calls = scheduled;
    const cards = await db.CrmCard.filter({ linked_quote_id: quote.id, pipeline_type: 'PAYMENT' });
    results.payment_card_stage = cards.map((c) => c.stage);
    for (const c of cards) created.push(['CrmCard', c.id]);
  } catch (e) { results.error = e.message; }
  finally { for (const [entity, id] of created.reverse()) await db[entity].delete(id).catch(() => {}); }
  return Response.json(results);
}