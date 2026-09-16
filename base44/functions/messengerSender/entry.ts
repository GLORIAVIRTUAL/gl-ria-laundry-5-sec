import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Envia uma mensagem no Messenger e registra na conversa do chat.
// Aceita chamada interna (IA/orchestrator) via _internal_token ou usuário logado (atendente).
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const isInternal = Boolean(body._internal_token) && body._internal_token === Deno.env.get('INTERNAL_FUNCTION_TOKEN');
    const user = isInternal ? null : await base44.auth.me().catch(() => null);
    if (!isInternal && !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const conversationId = body.conversation_id;
    const text = (body.message || '').trim();
    const mediaUrl = body.mediaUrl || null;
    if (!conversationId || (!text && !mediaUrl)) {
      return Response.json({ error: 'conversation_id e message são obrigatórios' }, { status: 400 });
    }

    const pageToken = Deno.env.get('MESSENGER_PAGE_ACCESS_TOKEN') || Deno.env.get('FACEBOOK_PAGE_ACCESS_TOKEN');
    if (!pageToken) return Response.json({ error: 'MESSENGER_PAGE_ACCESS_TOKEN não configurado' }, { status: 503 });

    const conversation = await base44.asServiceRole.entities.Conversation.get(conversationId);
    const recipientId = (conversation?.metadata || {}).messenger_user_id;
    if (!recipientId) return Response.json({ error: 'Conversa sem usuário do Messenger' }, { status: 409 });

    const messagePayload = mediaUrl
      ? { attachment: { type: 'image', payload: { url: mediaUrl } } }
      : { text };

    const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: 'RESPONSE', message: messagePayload }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Messenger send failed:', JSON.stringify(data));
      return Response.json({ error: 'messenger_send_failed', details: data }, { status: 502 });
    }

    const saved = await base44.asServiceRole.entities.Message.create({
      conversation_id: conversationId,
      direction: 'OUT',
      type: mediaUrl ? 'IMAGE' : 'TEXT',
      text,
      media_file_id: mediaUrl,
      sent_by: isInternal ? '' : (body.sent_by || user?.full_name || 'Atendente'),
      raw_payload: { messenger_message_id: data.message_id },
    });

    await base44.asServiceRole.entities.Conversation.update(conversationId, {
      last_message_id: saved.id,
      last_message_at: new Date().toISOString(),
    });

    return Response.json({ id: saved.id, messenger_message_id: data.message_id });
  } catch (error) {
    console.error('messengerSender error:', error?.message || error);
    return Response.json({ error: error?.message || 'failed' }, { status: 500 });
  }
}