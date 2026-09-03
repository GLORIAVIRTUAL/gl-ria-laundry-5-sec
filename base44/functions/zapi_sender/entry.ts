import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 1. Parse body ONCE
        const body = await req.json();
        const { phone, message, type = 'TEXT', mediaUrl, conversation_id, buttons = [], optionList = null, sent_by = null } = body;

        // SEGURANÇA: nunca enviar para um ID de grupo de WhatsApp.
        // Grupos têm formato "...@g.us", terminam em "-group" ou contêm "-" no id.
        // Enviar para um grupo entrega a mensagem para todos os participantes do grupo,
        // não para o chat privado do cliente. Bloqueamos para evitar vazamentos.
        const isGroupTarget = typeof phone === 'string' &&
            (phone.includes('@g.us') || phone.includes('-group') || phone.includes('-'));
        if (isGroupTarget) {
            console.warn("Blocked: attempt to send to a WhatsApp GROUP id:", phone);
            return Response.json({ error: 'Envio bloqueado: este contato é um grupo de WhatsApp, não um número individual.' }, { status: 400 });
        }

        // Delay humano aleatório entre 3 e 8 segundos antes de enviar (anti-spam Meta)
        const humanDelayMs = 3000 + Math.floor(Math.random() * 5000);
        await new Promise((resolve) => setTimeout(resolve, humanDelayMs));

        const INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID");
        const TOKEN = Deno.env.get("ZAPI_TOKEN");
        const CLIENT_TOKEN = Deno.env.get("ZAPI_SECURITY_TOKEN");

        // 2. Determine Z-API Endpoint
        let zapiUrl = `https://api.z-api.io/instances/${INSTANCE_ID}/token/${TOKEN}/send-text`;
        let payload = { phone, message, delayTyping: 4 };

        if (type === 'IMAGE') {
            zapiUrl = `https://api.z-api.io/instances/${INSTANCE_ID}/token/${TOKEN}/send-image`;
            payload = { phone, image: mediaUrl, caption: message, delayTyping: 4 };
        } else if (type === 'AUDIO') {
            zapiUrl = `https://api.z-api.io/instances/${INSTANCE_ID}/token/${TOKEN}/send-audio`;
            payload = { phone, audio: mediaUrl };
        } else if (type === 'DOC') {
             zapiUrl = `https://api.z-api.io/instances/${INSTANCE_ID}/token/${TOKEN}/send-document`;
             payload = { phone, document: mediaUrl, caption: message, delayTyping: 3 };
        } else if (type === 'BUTTONS') {
            zapiUrl = `https://api.z-api.io/instances/${INSTANCE_ID}/token/${TOKEN}/send-button-list`;
            payload = {
                phone,
                message,
                buttonList: {
                    buttons: buttons.map((button, index) => ({
                        id: button.id || String(index + 1),
                        label: button.label
                    }))
                },
                delayMessage: 2
            };
        } else if (type === 'OPTION_LIST') {
            zapiUrl = `https://api.z-api.io/instances/${INSTANCE_ID}/token/${TOKEN}/send-option-list`;
            payload = {
                phone,
                message,
                optionList,
                delayMessage: 2
            };
        }

        // 3. Send to Z-API (if configured)
        let zapiResponseData = { status: "simulated", messageId: "sim-" + Date.now() };
        
        if (INSTANCE_ID && TOKEN) {
            console.log(`Sending to Z-API: ${zapiUrl}`, JSON.stringify(payload));

            const sendRequest = async (url, requestPayload) => {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'client-token': CLIENT_TOKEN || ''
                    },
                    body: JSON.stringify(requestPayload)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Z-API Error: ${errorText}`);
                }

                return await response.json();
            };

            try {
                zapiResponseData = await sendRequest(zapiUrl, payload);
            } catch (error) {
                const isInteractive = type === 'BUTTONS' || type === 'OPTION_LIST';
                if (!isInteractive) {
                    console.error('Z-API Error:', error.message);
                    throw error;
                }

                console.warn('Interactive message failed, retrying as plain text:', error.message);
                const fallbackMessage = type === 'BUTTONS'
                    ? `${message}\n\n${buttons.map((button) => `- ${button.label}`).join('\n')}`
                    : `${message}\n\n${optionList?.options?.map((option) => `- ${option.title}`).join('\n') || ''}`;

                zapiUrl = `https://api.z-api.io/instances/${INSTANCE_ID}/token/${TOKEN}/send-text`;
                payload = { phone, message: fallbackMessage.trim(), delayTyping: 4 };
                zapiResponseData = await sendRequest(zapiUrl, payload);
            }
        } else {
            console.warn("Z-API secrets not configured. Simulating send.");
        }

        // 4. Log Message in Database
        let finalConversationId = conversation_id;
        
        // If no conversation_id, try to find one by phone
        if (!finalConversationId && phone) {
             const customers = await base44.asServiceRole.entities.Customer.filter({ phones: phone });
             if (customers.length > 0) {
                 const conversations = await base44.asServiceRole.entities.Conversation.filter({ 
                     customer_id: customers[0].id,
                     channel: 'WHATSAPP'
                 });
                 // Só considera conversas da conexão principal (Moinhos tem chat separado).
                 const mainConv = conversations.find(c => (c.metadata || {}).source !== 'zapi_moinhos');
                 if (mainConv) {
                     finalConversationId = mainConv.id;
                 }
             }
        }

        let newMessage = null;

        if (finalConversationId) {
             const loggedType = ['BUTTONS', 'OPTION_LIST'].includes(type) ? 'TEXT' : type;
             newMessage = await base44.asServiceRole.entities.Message.create({
                conversation_id: finalConversationId,
                direction: 'OUT',
                type: loggedType,
                text: message || (type === 'IMAGE' ? 'Imagem enviada' : 'Áudio enviado'),
                media_file_id: mediaUrl,
                sent_by: sent_by || null,
                raw_payload: zapiResponseData
             });
            
            await base44.asServiceRole.entities.Conversation.update(finalConversationId, {
                last_message_at: new Date().toISOString(),
                last_message_id: newMessage.id
            });
        }
        
        return Response.json({ ...zapiResponseData, id: newMessage?.id || null });

    } catch (error) {
        console.error("Error in zapi_sender:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});