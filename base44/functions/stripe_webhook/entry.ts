import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@^14.0.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
        
        if (!stripeKey || !webhookSecret) {
            console.error("Stripe keys not configured");
            return Response.json({ error: "Stripe keys not configured" }, { status: 500 });
        }

        const stripe = new Stripe(stripeKey);
        
        const signature = req.headers.get("stripe-signature");
        const body = await req.text();
        
        console.log("Received webhook request with signature:", signature ? "present" : "missing");
        
        let event;
        try {
            event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
        } catch (err) {
            console.error(`Webhook signature verification failed: ${err.message}`);
            return Response.json({ error: err.message }, { status: 400 });
        }

        console.log(`Webhook event type: ${event.type}`);
        
        // Handle both checkout.session.completed AND payment_intent.succeeded
        if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
            
            let quoteId, customerId, sessionId;
            
            if (event.type === 'checkout.session.completed') {
                const session = event.data.object;
                quoteId = session.metadata?.quote_id;
                customerId = session.metadata?.customer_id;
                sessionId = session.id;
                console.log(`Processing checkout.session.completed - sessionId: ${sessionId}, quoteId: ${quoteId}, customerId: ${customerId}, payment_status: ${session.payment_status}`);
                
                // Only process if payment was actually collected
                if (session.payment_status !== 'paid') {
                    console.log(`Payment status is "${session.payment_status}", not "paid". Skipping.`);
                    return Response.json({ received: true, skipped: 'not_paid_yet' });
                }
            } else {
                // payment_intent.succeeded
                const paymentIntent = event.data.object;
                quoteId = paymentIntent.metadata?.quote_id;
                customerId = paymentIntent.metadata?.customer_id;
                sessionId = paymentIntent.id;
                console.log(`Processing payment_intent.succeeded - intentId: ${sessionId}, quoteId: ${quoteId}, customerId: ${customerId}`);
            }
            
            if (!quoteId) {
                console.log("No quoteId in metadata, skipping CRM updates");
                return Response.json({ received: true });
            }

            // 1. Update Payment entity to "succeeded"
            const payments = await base44.asServiceRole.entities.Payment.filter({ quote_id: quoteId });
            console.log(`Found ${payments.length} payment records for quoteId: ${quoteId}`);
            if (payments.length > 0) {
                await base44.asServiceRole.entities.Payment.update(payments[0].id, {
                    status: 'succeeded',
                    paid_at: new Date().toISOString()
                });
                console.log(`Payment ${payments[0].id} updated to succeeded`);
            }

            // 2. Update or Create PAYMENT pipeline CRM card to "Pago"
            const paymentCards = await base44.asServiceRole.entities.CrmCard.filter({ 
                pipeline_type: 'PAYMENT', 
                customer_id: customerId 
            });
            console.log(`Found ${paymentCards.length} PAYMENT pipeline cards for customer: ${customerId}`);
            
            if (paymentCards.length === 0 && customerId) {
                await base44.asServiceRole.entities.CrmCard.create({
                    pipeline_type: 'PAYMENT',
                    stage: 'Pago',
                    customer_id: customerId,
                    priority: 'MEDIUM',
                    linked_quote_id: quoteId
                });
                console.log(`Created new PAYMENT card in "Pago"`);
            } else {
                for (const card of paymentCards) {
                    if (card.stage !== 'Pago' && card.stage !== 'Conciliado') {
                        await base44.asServiceRole.entities.CrmCard.update(card.id, { stage: 'Pago' });
                        console.log(`PAYMENT card ${card.id} moved to "Pago"`);
                    }
                }
            }

            // 3. Update NEW_CUSTOMER pipeline card to "Convertido"
            const newCustomerCards = await base44.asServiceRole.entities.CrmCard.filter({ 
                pipeline_type: 'NEW_CUSTOMER', 
                customer_id: customerId 
            });
            console.log(`Found ${newCustomerCards.length} NEW_CUSTOMER pipeline cards for customer: ${customerId}`);
            for (const card of newCustomerCards) {
                if (card.stage !== 'Convertido') {
                    await base44.asServiceRole.entities.CrmCard.update(card.id, { stage: 'Convertido' });
                    console.log(`NEW_CUSTOMER card ${card.id} moved to "Convertido"`);
                }
            }

            // 4. Handle Quote -> Order conversion
            let orderCreated = null;
            const quotes = await base44.asServiceRole.entities.Quote.filter({});
            const quote = quotes.find(q => q.id === quoteId);
            console.log(`Quote lookup for ${quoteId}: ${quote ? 'found' : 'not found'}`);
            
            if (quote) {
                // It's a quote - convert to order
                orderCreated = await base44.asServiceRole.entities.Order.create({
                    customer_id: quote.customer_id,
                    status: 'pending',
                    total_amount: quote.total,
                    ticket_number: `ORD-${Math.floor(Math.random() * 10000)}`
                });
                console.log(`Order created: ${orderCreated.id}`);

                // Update QUOTE pipeline CRM card -> move to "Aprovado"
                const quoteCards = await base44.asServiceRole.entities.CrmCard.filter({ linked_quote_id: quoteId, pipeline_type: 'QUOTE' });
                console.log(`Found ${quoteCards.length} QUOTE pipeline cards for quoteId: ${quoteId}`);
                if (quoteCards.length > 0) {
                    await base44.asServiceRole.entities.CrmCard.update(quoteCards[0].id, {
                        stage: 'Aprovado'
                    });
                    console.log(`QUOTE card ${quoteCards[0].id} moved to "Aprovado"`);
                } else {
                    // If it was already moved to ORDER in a previous version, let's try to find it without pipeline_type
                    const anyQuoteCards = await base44.asServiceRole.entities.CrmCard.filter({ linked_quote_id: quoteId });
                    if (anyQuoteCards.length > 0 && anyQuoteCards[0].pipeline_type === 'ORDER') {
                        // Revert it back to QUOTE
                        await base44.asServiceRole.entities.CrmCard.update(anyQuoteCards[0].id, {
                            pipeline_type: 'QUOTE',
                            stage: 'Aprovado'
                        });
                    }
                }
                
                // Create a NEW card in ORDER pipeline
                await base44.asServiceRole.entities.CrmCard.create({
                    pipeline_type: 'ORDER',
                    stage: 'Recebido',
                    customer_id: quote.customer_id,
                    priority: 'HIGH',
                    linked_order_id: orderCreated.id,
                    linked_quote_id: quoteId
                });
                console.log(`Created new ORDER card in "Recebido"`);
                
                // Update Quote status
                await base44.asServiceRole.entities.Quote.update(quoteId, { status: 'ACCEPTED' });
                
            } else {
                // Might be an Order already (from sell_package)
                const orders = await base44.asServiceRole.entities.Order.filter({});
                const existingOrder = orders.find(o => o.id === quoteId);
                if (existingOrder) {
                    await base44.asServiceRole.entities.Order.update(existingOrder.id, { status: 'processing' });
                    console.log(`Existing order ${existingOrder.id} updated to processing`);
                    
                    const orderCards = await base44.asServiceRole.entities.CrmCard.filter({ linked_order_id: quoteId });
                    for (const card of orderCards) {
                        let newStage = card.stage;
                        if (card.pipeline_type === 'PLAN') newStage = 'Assinou/Ativou';
                        else if (card.pipeline_type === 'ORDER') newStage = 'Em processamento';
                        
                        if (newStage !== card.stage) {
                            await base44.asServiceRole.entities.CrmCard.update(card.id, { stage: newStage });
                            console.log(`Card ${card.id} moved to "${newStage}"`);
                        }
                    }
                }
            }

            // 5. Send WhatsApp confirmation
            try {
                const resolvedCustomerId = customerId || quote?.customer_id;
                if (resolvedCustomerId) {
                    const customer = await base44.asServiceRole.entities.Customer.get(resolvedCustomerId);
                    if (customer && customer.phones && customer.phones.length > 0) {
                        const ticketRef = orderCreated?.ticket_number || quoteId.slice(0, 8).toUpperCase();
                        await base44.asServiceRole.functions.invoke('zapi_sender', {
                            phone: customer.phones[0],
                            message: `✅ *Pagamento Confirmado!*\n\nOlá ${customer.full_name.split(' ')[0]}, recebemos o seu pagamento referente ao pedido #${ticketRef}. Já estamos cuidando de tudo para você!\n\nVocê pode acompanhar o status do seu pedido a qualquer momento por aqui.`
                        });
                        console.log(`WhatsApp confirmation sent to ${customer.phones[0]}`);
                    }
                }
            } catch (msgError) {
                console.error("Failed to send confirmation message:", msgError);
            }
        }

        return Response.json({ received: true });
    } catch (error) {
        console.error("Error in stripe_webhook:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});