import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Use service role for scheduled task
        const quotes = await base44.asServiceRole.entities.Quote.filter({ status: 'SENT' });
        
        const now = new Date();
        const expirationThreshold = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        
        const updates = [];

        for (const quote of quotes) {
            const lastUpdated = new Date(quote.updated_date);
            const diff = now.getTime() - lastUpdated.getTime();
            
            if (diff > expirationThreshold) {
                // Expire the quote
                await base44.asServiceRole.entities.Quote.update(quote.id, { status: 'EXPIRED' });
                
                // Update linked CRM card
                const cards = await base44.asServiceRole.entities.CrmCard.filter({ linked_quote_id: quote.id });
                if (cards.length > 0) {
                    await base44.asServiceRole.entities.CrmCard.update(cards[0].id, { stage: 'Expirado' });
                }
                
                updates.push(quote.id);
            }
        }

        return Response.json({ 
            success: true, 
            expired_count: updates.length, 
            expired_ids: updates 
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});