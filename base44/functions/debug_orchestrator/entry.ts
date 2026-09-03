import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        try {
            console.log("Invoking orchestrator...");
            const res = await base44.asServiceRole.functions.invoke('orchestrator', {
                conversation_id: '699f46061c657afaa4108a59',
                message_id: '69a5947f17f6010e40621376',
                customer_id: '699f46061c657afaa4108a58',
                payload: {}
            });
            console.log("Orchestrator invoked successfully:", res.status);
            return Response.json({ success: true, status: res.status });
        } catch (e) {
            console.error("Orchestrator invoke error:", e.message, e.response?.status);
            return Response.json({ error: e.message, status: e.response?.status }, { status: 500 });
        }

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});