import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { prospect_ids, message, image_url, send_to_all } = await req.json();

        if (!message && !image_url) {
            return Response.json({ error: 'Envie uma mensagem ou uma imagem' }, { status: 400 });
        }

        const INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID");
        const TOKEN = Deno.env.get("ZAPI_TOKEN");
        const CLIENT_TOKEN = Deno.env.get("ZAPI_SECURITY_TOKEN");

        if (!INSTANCE_ID || !TOKEN) {
            return Response.json({ error: 'Z-API não configurada.' }, { status: 400 });
        }

        let prospects = [];
        if (send_to_all) {
            prospects = await base44.asServiceRole.entities.Prospect.list('-created_date', 10000);
        } else if (prospect_ids && prospect_ids.length > 0) {
            for (const id of prospect_ids) {
                const p = await base44.asServiceRole.entities.Prospect.get(id);
                if (p) prospects.push(p);
            }
        }

        prospects = prospects.filter(p => p.phone);

        if (prospects.length === 0) {
            return Response.json({ error: 'Nenhuma empresa elegível encontrada (precisam ter telefone).' }, { status: 400 });
        }

        const textUrl = `https://api.z-api.io/instances/${INSTANCE_ID}/token/${TOKEN}/send-text`;
        const imageUrl = `https://api.z-api.io/instances/${INSTANCE_ID}/token/${TOKEN}/send-image`;
        const results = { sent: 0, failed: 0, total: prospects.length };

        for (const prospect of prospects) {
            const phone = prospect.phone;
            const finalMessage = (message || '')
                .replace(/{empresa}/gi, prospect.company_name || 'Empresa')
                .replace(/{contato}/gi, prospect.contact_name || '')
                .replace(/{nome}/gi, prospect.contact_name || prospect.company_name || '');

            try {
                const response = await fetch(image_url ? imageUrl : textUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'client-token': CLIENT_TOKEN || ''
                    },
                    body: JSON.stringify(
                        image_url
                            ? { phone, image: image_url, caption: finalMessage }
                            : { phone, message: finalMessage }
                    )
                });

                if (response.ok) {
                    results.sent++;
                } else {
                    results.failed++;
                    const err = await response.json();
                    console.error(`Failed to send to ${phone}:`, err);
                }

                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (err) {
                results.failed++;
                console.error(`Error sending to ${phone}:`, err.message);
            }
        }

        return Response.json({ status: "success", results });
    } catch (error) {
        console.error("Error in sendProspectDispatch:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});