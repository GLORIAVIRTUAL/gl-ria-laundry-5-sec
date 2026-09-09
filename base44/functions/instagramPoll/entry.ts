import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Busca ativa de DMs do Instagram via Graph API (fallback do webhook da Meta).
// Importa mensagens recebidas que ainda não estão no chat.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const pageId = Deno.env.get('MESSENGER_PAGE_ID');
    const pageToken = Deno.env.get('MESSENGER_PAGE_ACCESS_TOKEN') || Deno.env.get('FACEBOOK_PAGE_ACCESS_TOKEN');
    if (!pageId || !pageToken) return Response.json({ status: 'error', message: 'missing_page_credentials' });

    const url = `https://graph.facebook.com/v21.0/${pageId}/conversations?platform=instagram`
      + `&fields=participants,messages.limit(10){id,from,message,created_time,attachments}`
      + `&limit=25&access_token=${pageToken}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await res.json();
    if (!res.ok || data.error) {
      console.error('instagramPoll graph error:', data.error?.message);
      return Response.json({ status: 'error', message: data.error?.message || 'graph_error' });
    }

    const igAccountId = String(data.data?.[0]?.participants?.data?.find((p) => String(p.id).startsWith('178'))?.id || '');
    const existingMessages = await base44.asServiceRole.entities.Message.list('-created_date', 500);
    const seenIds = new Set(existingMessages.map((m) => (m.raw_payload || {}).instagram_message_id).filter(Boolean));
    const igConversations = await base44.asServiceRole.entities.Conversation.filter({ channel: 'INSTAGRAM' }, '-last_message_at', 500);

    let imported = 0;

    for (const thread of data.data || []) {
      const inbound = (thread.messages?.data || [])
        .filter((m) => m.from?.id && String(m.from.id) !== igAccountId && !seenIds.has(m.id))
        .filter((m) => m.message || (m.attachments?.data || []).length)
        .sort((a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime());
      if (!inbound.length) continue;

      const senderId = String(inbound[0].from.id);
      const username = inbound[0].from.username || inbound[0].from.name || '';

      let conversation = igConversations.find((c) => String((c.metadata || {}).instagram_user_id) === senderId);
      let customer = conversation ? await base44.asServiceRole.entities.Customer.get(conversation.customer_id).catch(() => null) : null;

      if (!customer) {
        customer = await base44.asServiceRole.entities.Customer.create({
          full_name: username ? `@${username}` : 'Cliente Instagram',
          phones: [],
          status: 'active',
          last_inbound_at: new Date().toISOString(),
          notes: `Contato via Instagram (id ${senderId})`,
        });
      } else {
        await base44.asServiceRole.entities.Customer.update(customer.id, { last_inbound_at: new Date().toISOString() });
      }

      if (!conversation) {
        conversation = await base44.asServiceRole.entities.Conversation.create({
          customer_id: customer.id,
          channel: 'INSTAGRAM',
          status: 'OPEN',
          handoff_required: true,
          last_message_at: new Date().toISOString(),
          metadata: { source: 'instagram_poll', instagram_user_id: senderId, instagram_account_id: igAccountId },
        });
        igConversations.push(conversation);
      }

      let lastMessageId = null;
      for (const m of inbound) {
        const attachment = (m.attachments?.data || [])[0];
        const mediaUrl = attachment?.image_data?.url || attachment?.file_url || attachment?.video_data?.url || null;
        const created = await base44.asServiceRole.entities.Message.create({
          conversation_id: conversation.id,
          direction: 'IN',
          type: mediaUrl ? 'IMAGE' : 'TEXT',
          text: m.message || '',
          media_file_id: mediaUrl,
          raw_payload: { instagram_message_id: m.id, from: m.from, created_time: m.created_time, source: 'poll' },
        });
        seenIds.add(m.id);
        lastMessageId = created.id;
        imported += 1;
      }

      await base44.asServiceRole.entities.Conversation.update(conversation.id, {
        status: 'OPEN',
        handoff_required: true,
        last_message_id: lastMessageId,
        last_message_at: new Date().toISOString(),
      });
    }

    return Response.json({ status: 'ok', imported });
  } catch (error) {
    console.error('instagramPoll error:', error?.message || error);
    return Response.json({ status: 'error', message: error?.message || 'failed' });
  }
}