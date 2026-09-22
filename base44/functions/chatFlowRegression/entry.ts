import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { enforceExistingUserSecurity, securityErrorResponse } from '../../shared/functionSecurity.js';
import { runChatFlowRegression } from '../../shared/chatFlowRegression.js';
import { finalizeChatPhotoQuote } from '../../shared/chatPhotoQuote.js';
import { acceptChatQuote } from '../../shared/chatQuoteAcceptance.js';
import { handleChatPaymentRequest } from '../../shared/chatPaymentFlow.js';

// Temporary owner-only regression harness. No messages, LLM calls or real charges.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'forbidden' }, { status: 403 });
    await enforceExistingUserSecurity(base44, req, user, { source: 'chatFlowRegression' });
    const body = await req.json();
    if (!body.action || body.action === 'regression') return Response.json(await runChatFlowRegression());
    const conversation = await base44.entities.Conversation.get(body.conversation_id);
    const customer = await base44.entities.Customer.get(conversation.customer_id);
    if (!conversation.metadata?.regression_test || conversation.created_by_id !== user.id || customer.created_by_id !== user.id || !customer.full_name.startsWith('REGRESSION_CHAT_') || customer.phones?.length) return Response.json({ error: 'test_fixture_required' }, { status: 403 });
    const created = [];
    const db = Object.fromEntries(['Customer','Conversation','Quote','CrmCard','StaffNotification','Product','Payment','Order'].map((name) => [name, {
      get: (id) => base44.entities[name].get(id),
      filter: (...args) => base44.entities[name].filter(...args),
      update: (id, data) => base44.entities[name].update(id, data),
      create: async (data) => { const row = await base44.entities[name].create(data); created.push({ entity: name, id: row.id }); return row; },
    }]));
    const isolated = { asServiceRole: { entities: db, functions: { invoke: async () => { throw new Error('External calls disabled in regression'); } } } };
    const currentState = conversation.metadata;
    const args = { base44: isolated, customer, conversation, currentState };
    let result;
    try {
      if (body.action === 'finalize') result = await finalizeChatPhotoQuote({ ...args, unitId: conversation.metadata.unit_id });
      else if (body.action === 'accept') {
        const quote = await db.Quote.get(currentState.active_quote_id);
        if (quote.customer_id !== customer.id) throw new Error('fixture_mismatch');
        result = await acceptChatQuote({ ...args, quote, latestText: body.text });
      } else if (body.action === 'payment') result = await handleChatPaymentRequest({ ...args, text: body.text });
      else throw new Error('invalid_action');
      return Response.json({ result, created });
    } catch (error) { return Response.json({ error: error.message, created }); }
  } catch (error) { return securityErrorResponse(error); }
}