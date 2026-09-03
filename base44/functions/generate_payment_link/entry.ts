import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@^14.0.0';

const DEFAULT_ORIGIN = 'https://chat5asec.com.br';

function allowedOrigins() {
  return new Set(
    (Deno.env.get('PAYMENT_ALLOWED_ORIGINS') || DEFAULT_ORIGIN)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function resolveOrigin(req: Request) {
  const requestedOrigin = req.headers.get('origin') || '';
  return allowedOrigins().has(requestedOrigin) ? requestedOrigin : DEFAULT_ORIGIN;
}

function canAccessUnit(user: any, unitId?: string) {
  if (!unitId) return true;
  if (['super_admin', 'admin'].includes(user?.role)) return true;

  const allowed = new Set([
    user?.primary_unit_id,
    ...(Array.isArray(user?.allowed_unit_ids) ? user.allowed_unit_ids : []),
  ].filter(Boolean));

  return allowed.has(unitId);
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed', request_id: requestId }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'authentication_required', request_id: requestId }, { status: 401 });
    }

    const body = await req.json();
    const referenceId = body.order_id || body.quote_id;
    if (!referenceId || typeof referenceId !== 'string') {
      return Response.json({ error: 'order_or_quote_required', request_id: requestId }, { status: 400 });
    }

    let order: any = null;
    let quote: any = null;

    try {
      order = await base44.asServiceRole.entities.Order.get(referenceId);
    } catch (_) {
      // O identificador também pode ser de um orçamento legado.
    }

    if (!order) {
      try {
        quote = await base44.asServiceRole.entities.Quote.get(referenceId);
      } catch (_) {
        // Tratado abaixo como registro não encontrado.
      }
    }

    const source = order || quote;
    if (!source) {
      return Response.json({ error: 'order_or_quote_not_found', request_id: requestId }, { status: 404 });
    }

    if (!canAccessUnit(user, source.unit_id)) {
      return Response.json({ error: 'forbidden_unit', request_id: requestId }, { status: 403 });
    }

    const amount = Number(order?.total_amount ?? quote?.total);
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: 'invalid_server_amount', request_id: requestId }, { status: 422 });
    }

    const customerId = source.customer_id;
    if (!customerId) {
      return Response.json({ error: 'customer_not_found_on_reference', request_id: requestId }, { status: 422 });
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return Response.json({
        error: 'payment_integration_not_configured',
        message: 'Configure STRIPE_SECRET_KEY antes de gerar links reais.',
        request_id: requestId,
      }, { status: 503 });
    }

    const stripe = new Stripe(stripeKey);
    const origin = resolveOrigin(req);
    const customer = await base44.asServiceRole.entities.Customer.get(customerId);
    const customerEmail = customer?.email || undefined;
    const referenceLabel = order?.ticket_number || referenceId.slice(0, 8).toUpperCase();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'boleto'],
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: { name: `Pedido/Orçamento #${referenceLabel}` },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${origin}/PaymentSuccess?reference_id=${encodeURIComponent(referenceId)}`,
      cancel_url: `${origin}/Orders?canceled=true`,
      customer_email: customerEmail,
      metadata: {
        quote_id: quote?.id || '',
        order_id: order?.id || '',
        customer_id: customerId,
        unit_id: source.unit_id || '',
        request_id: requestId,
      },
      payment_intent_data: {
        metadata: {
          quote_id: quote?.id || '',
          order_id: order?.id || '',
          customer_id: customerId,
          unit_id: source.unit_id || '',
          request_id: requestId,
        },
      },
    });

    const payment = await base44.asServiceRole.entities.Payment.create({
      customer_id: customerId,
      quote_id: quote?.id,
      order_id: order?.id,
      unit_id: source.unit_id,
      status: 'pending',
      amount,
      payment_method: 'link',
      stripe_intent_id: session.id,
      notes: `Checkout criado com cálculo server-side. request_id=${requestId}`,
    });

    await base44.asServiceRole.entities.AuditLog.create({
      action: 'create',
      entity_type: 'payment',
      entity_id: payment.id,
      item_label: referenceLabel,
      customer_name: customer?.full_name,
      amount,
      reason: 'payment_link_created',
      user_email: user.email,
      user_name: user.full_name || user.display_name,
      user_role: user.role,
      unit_id: source.unit_id,
      request_id: requestId,
      success: true,
    });

    return Response.json({ url: session.url, payment_id: payment.id, request_id: requestId });
  } catch (error) {
    console.error(`[generate_payment_link:${requestId}]`, error);
    return Response.json({ error: 'payment_link_failed', request_id: requestId }, { status: 500 });
  }
});
