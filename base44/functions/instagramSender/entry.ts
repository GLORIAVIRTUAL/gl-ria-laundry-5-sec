import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getPageAccessToken } from '../../shared/metaPageToken.js';

// Envia uma DM do Instagram e registra a mensagem na conversa do chat.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Chamada interna (IA/orchestrator) ou atendente logado.
    const isInternal = Boolean(body._internal_token) && body._internal_token === Deno.env.get('INTERNAL_FUNCTION_TOKEN');
    const user = isInternal ? null : await base44.auth.me().catch(() => null);
    if (!isInternal && !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const conversationId = body.conversation_id;
    const text = (body.message || '').trim();
    const mediaUrl = body.mediaUrl || null;
    if (!conversationId || (!text && !mediaUrl)) {
      return Response.json({ error: 'conversation_id e message são obrigatórios' }, { status: 400 });
    }

    const conversation = await base44.asServiceRole.entities.Conversation.get(conversationId);
    // DMs do Instagram são enviadas com o token da Página vinculada.
    const page = await getPageAccessToken(Deno.env.get('MESSENGER_PAGE_ID'));
    if (!page?.token) return Response.json({ error: 'Token da Página do Instagram indisponível' }, { status: 503 });

    const recipientId = (conversation?.metadata || {}).instagram_user_id;
    if (!recipientId) return Response.json({ error: 'Conversa sem usuário do Instagram' }, { status: 409 });

    const messagePayload = mediaUrl
      ? { attachment: { type: 'image', payload: { url: mediaUrl } } }
      : { text };

    const res = await fetch(`https://graph.facebook.com/v21.0/${page.pageId}/messages?access_token=${page.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, message: messagePayload }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Instagram send failed:', JSON.stringify(data));
      return Response.json({ error: 'instagram_send_failed', details: data }, { status: 502 });
    }

    const saved = await base44.asServiceRole.entities.Message.create({
      conversation_id: conversationId,
      direction: 'OUT',
      type: mediaUrl ? 'IMAGE' : 'TEXT',
      text,
      media_file_id: mediaUrl,
      sent_by: isInternal ? '' : (body.sent_by || user?.full_name || 'Atendente'),
      raw_payload: { instagram_message_id: data.message_id },
    });

    await base44.asServiceRole.entities.Conversation.update(conversationId, {
      last_message_id: saved.id,
      last_message_at: new Date().toISOString(),
    });

    return Response.json({ id: saved.id, instagram_message_id: data.message_id });
  } catch (error) {
    console.error('instagramSender error:', error?.message || error);
    return Response.json({ error: error?.message || 'failed' }, { status: 500 });
  }
}