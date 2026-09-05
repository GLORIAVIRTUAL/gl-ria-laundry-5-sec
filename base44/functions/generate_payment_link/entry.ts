import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const DEFAULT_ORIGIN = 'https://lavanderia-5asec-connect-copy-d8ddd176.base44.app';

const ALLOWED_BILLING_TYPES = new Set(['pix', 'credit_card']);

function apiBase() {
  const env = (Deno.env.get('ASAAS_ENVIRONMENT') || 'sandbox').toLowerCase();
  return env === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
}

function resolveOrigin(req: Request) {
  return DEFAULT_ORIGIN;
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

    const billingTypeRaw = (body.billing_type || 'pix').toString().toLowerCase();
    if (!ALLOWED_BILLING_TYPES.has(billingTypeRaw)) {
      return Response.json({ error: 'invalid_billing_type', request_id: requestId }, { status: 400 });
    }
    const asaasBillingType = billingTypeRaw === 'pix' ? 'PIX' : 'CREDIT_CARD';

    let order: any = null;
    let quote: any = null;

    try {
      order = await base44.asServiceRole.entities.Order.get(referenceId);
    } catch (_) { /* maybe it's a quote */ }

    if (!order) {
      try {
        quote = await base44.asServiceRole.entities.Quote.get(referenceId);
      } catch (_) { /* not found */ }
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

    const apiKey = Deno.env.get('ASAAS_API_KEY');
    if (!apiKey) {
      return Response.json({
        error: 'payment_integration_not_configured',
        message: 'Configure ASAAS_API_KEY antes de gerar links.',
        request_id: requestId,
      }, { status: 503 });
    }

    const customer = await base44.asServiceRole.entities.Customer.get(customerId);
    const origin = resolveOrigin(req);
    const referenceLabel = order?.ticket_number || referenceId.slice(0, 8).toUpperCase();

    // Build customer data for Asaas checkout
    const customerData: any = {};
    if (customer?.full_name) customerData.name = customer.full_name;
    if (customer?.tax_id) customerData.cpfCnpj = customer.tax_id;
    if (customer?.email) customerData.email = customer.email;
    if (customer?.phones?.length) customerData.phone = customer.phones[0].replace(/\D/g, '');

    const checkoutBody: any = {
      billingTypes: [asaasBillingType],
      chargeTypes: ['DETACHED'],
      minutesToExpire: body.minutes_to_expire || 1440,
      externalReference: order?.id || quote?.id || referenceId,
      callback: {
        successUrl: `${origin}/PaymentSuccess?reference_id=${encodeURIComponent(referenceId)}`,
        cancelUrl: `${origin}/Orders?canceled=true`,
        expiredUrl: `${origin}/Orders?expired=true`,
      },
      items: [{
        name: `Pedido #${referenceLabel}`,
        description: `Pagamento de lavanderia - ${customer?.full_name || 'Cliente'}`,
        quantity: 1,
        value: Math.round(amount * 100) / 100,
      }],
    };
    if (Object.keys(customerData).length > 0) {
      checkoutBody.customerData = customerData;
    }

    const asaasResponse = await fetch(`${apiBase()}/checkouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
        'accept': 'application/json',
      },
      body: JSON.stringify(checkoutBody),
    });

    const asaasJson = await asaasResponse.json();

    if (!asaasResponse.ok) {
      console.error(`[generate_payment_link:${requestId}] Asaas error`, asaasJson);
      const errorMsg = asaasJson?.errors?.[0]?.description || asaasJson?.error || 'asaas_request_failed';
      return Response.json({ error: 'asaas_checkout_failed', message: errorMsg, request_id: requestId }, { status: 502 });
    }

    const checkoutUrl = asaasJson.link || `https://asaas.com/checkoutSession/show?id=${asaasJson.id}`;

    const payment = await base44.asServiceRole.entities.Payment.create({
      customer_id: customerId,
      quote_id: quote?.id,
      order_id: order?.id,
      unit_id: source.unit_id,
      status: 'pending',
      amount,
      payment_method: billingTypeRaw === 'pix' ? 'pix' : 'credit_card',
      external_reference: asaasJson.id,
      idempotency_key: `asaas:${asaasJson.id}`,
      notes: `Checkout Asaas (${asaasBillingType}). request_id=${requestId}`,
    });

    await base44.asServiceRole.entities.AuditLog.create({
      action: 'create',
      entity_type: 'payment',
      entity_id: payment.id,
      item_label: referenceLabel,
      customer_name: customer?.full_name,
      amount,
      reason: 'payment_link_created_asaas',
      user_email: user.email,
      user_name: user.full_name || user.display_name,
      user_role: user.role,
      unit_id: source.unit_id,
      request_id: requestId,
      success: true,
    });

    return Response.json({
      url: checkoutUrl,
      checkout_id: asaasJson.id,
      payment_id: payment.id,
      billing_type: billingTypeRaw,
      request_id: requestId,
    });
  } catch (error) {
    console.error(`[generate_payment_link:${requestId}]`, error);
    return Response.json({ error: 'payment_link_failed', request_id: requestId }, { status: 500 });
  }
});