import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getPageAccessToken } from '../../shared/metaPageToken.js';
import { resolveChannelCustomer } from '../../shared/channelCustomer.js';

// Webhook do Messenger (Facebook Pages). Recebe mensagens e grava no chat como conversa MESSENGER.
// GET  -> handshake de verificação (hub.verify_token / hub.challenge)
// POST -> mensagens recebidas (valida assinatura X-Hub-Signature-256)

const hmacSha256Hex = async (secret, body) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

export default async function (req) {
  try {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      const expected = Deno.env.get('MESSENGER_VERIFY_TOKEN');
      if (mode === 'subscribe' && token && expected && token === expected) {
        return new Response(challenge || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
      }
      return new Response('forbidden', { status: 403 });
    }

    if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

    const rawBody = await req.text();
    const base44 = createClientFromRequest(req);
    const appSecret = Deno.env.get('MESSENGER_APP_SECRET');
    const signature = req.headers.get('x-hub-signature-256') || '';
    if (signature) {
      const expectedSig = `sha256=${await hmacSha256Hex(appSecret || '', rawBody)}`;
      if (signature !== expectedSig) {
        console.warn('Messenger webhook signature mismatch.');
        return new Response('invalid_signature', { status: 401 });
      }
    } else {
      const tester = await base44.auth.me().catch(() => null);
      if (!tester) return new Response('invalid_signature', { status: 401 });
    }

    const payload = JSON.parse(rawBody || '{}');
    const pageId = Deno.env.get('MESSENGER_PAGE_ID');
    const pageToken = (await getPageAccessToken(pageId))?.token || null;

    // Busca o nome do contato no perfil do Messenger (requer token da Página válido).
    const fetchProfileName = async (senderId) => {
      if (!pageToken) return '';
      try {
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${senderId}?fields=name,first_name,last_name&access_token=${pageToken}`,
          { signal: AbortSignal.timeout(4000) },
        );
        if (!res.ok) return '';
        const info = await res.json();
        return info.name || [info.first_name, info.last_name].filter(Boolean).join(' ');
      } catch {
        console.warn('Could not fetch Messenger profile name.');
        return '';
      }
    };

    const events = [];
    for (const entry of payload.entry || []) {
      for (const ev of entry.messaging || []) events.push(ev);
      for (const change of entry.changes || []) {
        if (change.field === 'messages' && change.value) events.push(change.value);
      }
    }
    // Testes do painel da Meta chegam com { field, value } na raiz.
    if (payload.field === 'messages' && payload.value) events.push(payload.value);
    if (payload.sample?.field === 'messages' && payload.sample?.value) events.push(payload.sample.value);

    for (const ev of events) {
      const senderId = String(ev.sender?.id || '');
      const recipientId = String(ev.recipient?.id || '');
      if (!senderId || ev.message?.is_echo) continue;
      if (pageId && senderId === String(pageId)) continue;

      const fbMessageId = ev.message?.mid;
      const text = ev.message?.text || '';
      const attachment = (ev.message?.attachments || [])[0];
      let type = 'TEXT';
      let mediaUrl = null;
      if (attachment) {
        mediaUrl = attachment.payload?.url || null;
        type = attachment.type === 'image' ? 'IMAGE' : attachment.type === 'audio' ? 'AUDIO' : 'DOC';
      }
      if (!text && !mediaUrl) continue;

      if (fbMessageId) {
        const recent = await base44.asServiceRole.entities.Message.list('-created_date', 10);
        if (recent.some((m) => (m.raw_payload || {}).messenger_message_id === fbMessageId)) continue;
      }

      const fbConversations = await base44.asServiceRole.entities.Conversation.filter({ channel: 'MESSENGER' }, '-last_message_at', 500);
      let conversation = fbConversations.find((c) => String((c.metadata || {}).messenger_user_id) === senderId);
      let customer = conversation ? await base44.asServiceRole.entities.Customer.get(conversation.customer_id).catch(() => null) : null;

      if (!customer) {
        // Chave única do canal: nunca cria um segundo cliente para o mesmo PSID.
        const name = await fetchProfileName(senderId);
        const resolved = await resolveChannelCustomer(base44, {
          field: 'messenger_user_id',
          externalId: senderId,
          name,
          createData: {
            full_name: name || 'Cliente Messenger',
            phones: [],
            notes: `Contato via Messenger (id ${senderId})`,
          },
        });
        customer = resolved.customer;
      } else {
        const patch = { last_inbound_at: new Date().toISOString() };
        if (String(customer.messenger_user_id || '') !== senderId) patch.messenger_user_id = senderId;
        // Preenche o nome real caso o contato tenha sido criado sem perfil.
        if (customer.full_name === 'Cliente Messenger') {
          const name = await fetchProfileName(senderId);
          if (name) patch.full_name = name;
        }
        await base44.asServiceRole.entities.Customer.update(customer.id, patch);
      }

      if (!conversation) {
        conversation = await base44.asServiceRole.entities.Conversation.create({
          customer_id: customer.id,
          channel: 'MESSENGER',
          status: 'OPEN',
          // Todo atendimento entra primeiro com a IA (Glória); só vai para humano se pedido.
          handoff_required: false,
          last_message_at: new Date().toISOString(),
          metadata: { source: 'messenger', messenger_user_id: senderId, messenger_page_id: recipientId },
        });
      }

      const message = await base44.asServiceRole.entities.Message.create({
        conversation_id: conversation.id,
        direction: 'IN',
        type,
        text,
        media_file_id: mediaUrl,
        raw_payload: { ...ev, messenger_message_id: fbMessageId },
        // Marca para a IA responder (o gatilho 'Resposta da Glória' assume daqui).
        ai_pending: !conversation.handoff_required,
        ai_source: 'messenger',
      });

      await base44.asServiceRole.entities.Conversation.update(conversation.id, {
        status: 'OPEN',
        last_message_id: message.id,
        last_message_at: new Date().toISOString(),
      });
    }

    return Response.json({ status: 'ok', processed: events.length });
  } catch (error) {
    console.error('messengerWebhook error:', error?.message || error);
    return Response.json({ status: 'error', message: error?.message || 'failed' });
  }
}