import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Envia mensagens pelo número exclusivo da unidade Moinhos via WhatsApp Cloud API (Meta).
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const body = await req.json();
        const { phone, message, type = 'TEXT', mediaUrl, conversation_id } = body;

        const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_MOINHOS_PHONE_NUMBER_ID");
        const ACCESS_TOKEN = Deno.env.get("WHATSAPP_MOINHOS_ACCESS_TOKEN");

        if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
            return Response.json({ error: "Credenciais da Cloud API (Moinhos) não configuradas." }, { status: 500 });
        }

        // Delay humano aleatório entre 3 e 8 segundos (anti-spam)
        const humanDelayMs = 3000 + Math.floor(Math.random() * 5000);
        await new Promise((resolve) => setTimeout(resolve, humanDelayMs));

        const toPhone = (phone || '').replace(/\D/g, '');
        const graphUrl = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

        // Monta o payload conforme o tipo
        let graphPayload = {
            messaging_product: "whatsapp",
            to: toPhone,
            type: "text",
            text: { body: message || '' }
        };

        if (type === 'IMAGE') {
            graphPayload = {
                messaging_product: "whatsapp",
                to: toPhone,
                type: "image",
                image: { link: mediaUrl, caption: message || '' }
            };
        } else if (type === 'AUDIO') {
            graphPayload = {
                messaging_product: "whatsapp",
                to: toPhone,
                type: "audio",
                audio: { link: mediaUrl }
            };
        } else if (type === 'DOC') {
            graphPayload = {
                messaging_product: "whatsapp",
                to: toPhone,
                type: "document",
                document: { link: mediaUrl, caption: message || '' }
            };
        }

        const response = await fetch(graphUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ACCESS_TOKEN}`
            },
            body: JSON.stringify(graphPayload)
        });

        const responseData = await response.json();

        if (!response.ok) {
            console.error("Erro Cloud API (Moinhos):", JSON.stringify(responseData));
            throw new Error(`Cloud API Error: ${JSON.stringify(responseData.error || responseData)}`);
        }

        const waMessageId = responseData.messages?.[0]?.id || null;

        // Registra a mensagem no banco
        let finalConversationId = conversation_id;
        if (!finalConversationId && toPhone) {
            const customers = await base44.asServiceRole.entities.Customer.filter({ phones: toPhone });
            if (customers.length > 0) {
                const conversations = await base44.asServiceRole.entities.Conversation.filter({
                    customer_id: customers[0].id,
                    channel: 'WHATSAPP'
                });
                if (conversations.length > 0) finalConversationId = conversations[0].id;
            }
        }

        let newMessage = null;
        if (finalConversationId) {
            newMessage = await base44.asServiceRole.entities.Message.create({
                conversation_id: finalConversationId,
                direction: 'OUT',
                type: type,
                text: message || (type === 'IMAGE' ? 'Imagem enviada' : type === 'AUDIO' ? 'Áudio enviado' : ''),
                media_file_id: mediaUrl,
                raw_payload: { ...responseData, wa_message_id: waMessageId, source: 'whatsapp_moinhos' }
            });

            await base44.asServiceRole.entities.Conversation.update(finalConversationId, {
                last_message_at: new Date().toISOString(),
                last_message_id: newMessage.id
            });
        }

        return Response.json({ ...responseData, id: newMessage?.id || null });

    } catch (error) {
        console.error("Erro no whatsapp_moinhos_sender:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});