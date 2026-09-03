import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const units = await base44.asServiceRole.entities.Unit.list('name', 100);
        return Response.json({ units });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});