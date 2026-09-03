import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@^14.0.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { amount, customer_id, quote_id, description, origin } = await req.json();

        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        
        if (!stripeKey) {
             return Response.json({ 
                 url: `https://checkout.stripe.com/pay/mock-session-${Math.random().toString(36).substring(7)}` 
             });
        }

        const stripe = new Stripe(stripeKey);

        const baseOrigin = origin || req.headers.get("origin") || "https://chat5asec.com.br";
        
        let customerEmail = "cliente@chat5asec.com.br";
        if (customer_id) {
            const customer = await base44.asServiceRole.entities.Customer.get(customer_id);
            if (customer && customer.email) customerEmail = customer.email;
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'boleto'],
            line_items: [{
                price_data: {
                    currency: 'brl',
                    product_data: {
                        name: description || (quote_id ? `Pedido/Orçamento #${quote_id.slice(0, 8)}` : 'Pagamento 5àsec'),
                    },
                    unit_amount: Math.round(amount * 100), // cents
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${baseOrigin}/PaymentSuccess?quote_id=${quote_id || ''}`,
            cancel_url: `${baseOrigin}/orders?canceled=true`,
            customer_email: customerEmail,
            metadata: {
                quote_id: quote_id,
                customer_id: customer_id
            }
        });

        // Create Payment Record
        if (customer_id && quote_id) {
            await base44.asServiceRole.entities.Payment.create({
                customer_id: customer_id,
                quote_id: quote_id,
                status: 'pending',
                amount: amount,
                stripe_intent_id: session.id
            });
        }

        return Response.json({ url: session.url });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});