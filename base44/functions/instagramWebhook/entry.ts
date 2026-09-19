import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getPageAccessToken } from '../../shared/metaPageToken.js';
import { resolveChannelCustomer } from '../../shared/channelCustomer.js';

// Webhook do Instagram (Meta). Recebe DMs e grava no chat como conversa INSTAGRAM.
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
      const expected = Deno.env.get('INSTAGRAM_VERIFY_TOKEN');
      if (mode === 'subscribe' && token && expected && token === expected) {
        return new Response(challenge || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
      }
      return new Response('forbidden', { status: 403 });
    }

    if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

    const rawBody = await req.text();
    const base44 = createClientFromRequest(req);
    const appSecret = Deno.env.get('INSTAGRAM_APP_SECRET');
    const signature = req.headers.get('x-hub-signature-256') || '';
    if (signature) {
      // A DM pode chegar pelo app do Instagram ou pelo app da Página (Messenger API for Instagram),
      // que assinam com segredos diferentes. Aceitamos qualquer um dos dois.
      const secrets = [appSecret, Deno.env.get('MESSENGER_APP_SECRET')].filter(Boolean);
      const valid = [];
      for (const secret of secrets) valid.push(`sha256=${await hmacSha256Hex(secret, rawBody)}`);
      if (!valid.includes(signature)) {
        console.warn('Instagram webhook signature mismatch.');
        return new Response('invalid_signature', { status: 401 });
      }
    } else {
      // Sem assinatura da Meta: só aceitamos de um usuário logado do app (testes internos).
      const tester = await base44.auth.me().catch(() => null);
      if (!tester) return new Response('invalid_signature', { status: 401 });
    }

    const payload = JSON.parse(rawBody || '{}');
    const igAccountId = Deno.env.get('INSTAGRAM_ACCOUNT_ID');
    const pageToken = (await getPageAccessToken(Deno.env.get('MESSENGER_PAGE_ID')))?.token || null;

    // Nome/@ do contato do Instagram (Graph da Página resolve o IGSID).
    const fetchProfileName = async (senderId) => {
      if (!pageToken) return '';
      try {
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${senderId}?fields=name,username&access_token=${pageToken}`,
          { signal: AbortSignal.timeout(4000) },
        );
        if (!res.ok) return '';
        const info = await res.json();
        return info.name || (info.username ? `@${info.username}` : '');
      } catch {
        console.warn('Could not fetch Instagram profile name.');
        return '';
      }
    };

    // A Meta envia DMs em dois formatos: entry[].messaging[] (produção) e
    // entry[].changes[{field:'messages', value:{...}}] (testes do painel e algumas contas).
    const events = [];
    for (const entry of payload.entry || []) {
      for (const ev of entry.messaging || []) events.push(ev);
      for (const change of entry.changes || []) {
        if (change.field === 'messages' && change.value) events.push(change.value);
      }
    }
    if (payload.field === 'messages' && payload.value) events.push(payload.value);

    for (const ev of events) {
      const senderId = String(ev.sender?.id || '');
      const recipientId = String(ev.recipient?.id || '');
      // Ecos das nossas próprias mensagens: já registradas pelo instagramSender.
      if (!senderId || ev.message?.is_echo) continue;
      if (igAccountId && senderId === String(igAccountId)) continue;

      const igMessageId = ev.message?.mid;
      const text = ev.message?.text || '';
      const attachment = (ev.message?.attachments || [])[0];
      let type = 'TEXT';
      let mediaUrl = null;
      if (attachment) {
        mediaUrl = attachment.payload?.url || null;
        type = attachment.type === 'image' ? 'IMAGE' : attachment.type === 'audio' ? 'AUDIO' : 'DOC';
      }
      if (!text && !mediaUrl) continue;

      // Deduplicação pelo mid do Instagram
      if (igMessageId) {
        const recent = await base44.asServiceRole.entities.Message.list('-created_date', 10);
        if (recent.some((m) => (m.raw_payload || {}).instagram_message_id === igMessageId)) continue;
      }

      // Conversa existente deste usuário do Instagram
      const igConversations = await base44.asServiceRole.entities.Conversation.filter({ channel: 'INSTAGRAM' }, '-last_message_at', 500);
      let conversation = igConversations.find((c) => String((c.metadata || {}).instagram_user_id) === senderId);
      let customer = conversation ? await base44.asServiceRole.entities.Customer.get(conversation.customer_id).catch(() => null) : null;

      if (!customer) {
        // Chave única do canal: nunca cria um segundo cliente para o mesmo IGSID.
        const name = await fetchProfileName(senderId);
        const resolved = await resolveChannelCustomer(base44, {
          field: 'instagram_user_id',
          externalId: senderId,
          name,
          createData: {
            full_name: name || 'Cliente Instagram',
            phones: [],
            notes: `Contato via Instagram (id ${senderId})`,
          },
        });
        customer = resolved.customer;
      } else {
        const patch = { last_inbound_at: new Date().toISOString() };
        if (String(customer.instagram_user_id || '') !== senderId) patch.instagram_user_id = senderId;
        if (customer.full_name === 'Cliente Instagram') {
          const name = await fetchProfileName(senderId);
          if (name) patch.full_name = name;
        }
        await base44.asServiceRole.entities.Customer.update(customer.id, patch);
      }

      if (!conversation) {
        conversation = await base44.asServiceRole.entities.Conversation.create({
          customer_id: customer.id,
          channel: 'INSTAGRAM',
          status: 'OPEN',
          // Todo atendimento entra primeiro com a IA (Glória); só vai para humano se pedido.
          handoff_required: false,
          last_message_at: new Date().toISOString(),
          metadata: { source: 'instagram', instagram_user_id: senderId, instagram_account_id: recipientId },
        });
      }

      const message = await base44.asServiceRole.entities.Message.create({
        conversation_id: conversation.id,
        direction: 'IN',
        type,
        text,
        media_file_id: mediaUrl,
        raw_payload: { ...ev, instagram_message_id: igMessageId },
        // Marca para a IA responder (o gatilho 'Resposta da Glória' assume daqui).
        ai_pending: !conversation.handoff_required,
        ai_source: 'instagram',
      });

      await base44.asServiceRole.entities.Conversation.update(conversation.id, {
        status: 'OPEN',
        last_message_id: message.id,
        last_message_at: new Date().toISOString(),
      });
    }

    return Response.json({ status: 'ok', processed: events.length });
  } catch (error) {
    console.error('instagramWebhook error:', error?.message || error);
    // Sempre 200 para a Meta não reenfileirar indefinidamente.
    return Response.json({ status: 'error', message: error?.message || 'failed' });
  }
}