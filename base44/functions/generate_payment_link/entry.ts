import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const DEFAULT_ORIGIN = 'https://lavanderia-5asec-connect-copy-d8ddd176.base44.app';

const ALLOWED_BILLING_TYPES = new Set(['pix', 'credit_card']);

function apiBase() {
  const env = (Deno.env.get('ASAAS_ENVIRONMENT') || 'sandbox').toLowerCase();
  return env === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
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

function asaasHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    'access_token': apiKey,
    'accept': 'application/json',
  };
}

// Find or create an Asaas customer, returns Asaas customer ID
async function ensureAsaasCustomer(apiKey: string, customer: any): Promise<string | null> {
  if (!customer) return null;

  // Search by CPF/CNPJ
  if (customer.tax_id) {
    try {
      const resp = await fetch(`${apiBase()}/customers?cpfCnpj=${encodeURIComponent(customer.tax_id)}`, {
        headers: asaasHeaders(apiKey),
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.data && json.data.length > 0) return json.data[0].id;
      }
    } catch (_) { /* ignore */ }
  }

  // Search by email
  if (customer.email) {
    try {
      const resp = await fetch(`${apiBase()}/customers?email=${encodeURIComponent(customer.email)}`, {
        headers: asaasHeaders(apiKey),
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.data && json.data.length > 0) return json.data[0].id;
      }
    } catch (_) { /* ignore */ }
  }

  // Create new customer
  const body: any = { name: customer.full_name || 'Cliente' };
  if (customer.tax_id) body.cpfCnpj = customer.tax_id;
  if (customer.email) body.email = customer.email;
  if (customer.phones?.length) body.phone = customer.phones[0].replace(/\D/g, '');

  try {
    const resp = await fetch(`${apiBase()}/customers`, {
      method: 'POST',
      headers: asaasHeaders(apiKey),
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      const json = await resp.json();
      return json.id;
    }
    // If duplicate, try searching again by CPF/CNPJ
    if (customer.tax_id) {
      try {
        const resp2 = await fetch(`${apiBase()}/customers?cpfCnpj=${encodeURIComponent(customer.tax_id)}`, {
          headers: asaasHeaders(apiKey),
        });
        if (resp2.ok) {
          const json2 = await resp2.json();
          if (json2.data && json2.data.length > 0) return json2.data[0].id;
        }
      } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }

  return null;
}

// Create a direct PIX payment — returns QR code + copy-paste key
async function createDirectPixPayment(
  apiKey: string,
  asaasCustomerId: string,
  amount: number,
  referenceLabel: string,
  referenceId: string,
  customerName: string
): Promise<{ data: any; error: string | null }> {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 1);

  const body = {
    customer: asaasCustomerId,
    billingType: 'PIX',
    value: Math.round(amount * 100) / 100,
    dueDate: dueDate.toISOString().split('T')[0],
    externalReference: referenceId,
    description: `Pedido #${referenceLabel} - ${customerName || 'Cliente'}`,
  };

  try {
    const resp = await fetch(`${apiBase()}/payments`, {
      method: 'POST',
      headers: asaasHeaders(apiKey),
      body: JSON.stringify(body),
    });
    const json = await resp.json();
    if (!resp.ok) {
      const errMsg = json?.errors?.map((e: any) => e.description).join('; ') || JSON.stringify(json);
      console.error('[generate_payment_link] Direct PIX error', errMsg);
      return { data: null, error: errMsg };
    }
    return { data: json, error: null };
  } catch (err) {
    console.error('[generate_payment_link] Direct PIX fetch error', err);
    return { data: null, error: String(err) };
  }
}

// Create a checkout session (used for credit card or PIX fallback)
async function createCheckoutSession(
  apiKey: string,
  billingType: string,
  amount: number,
  referenceLabel: string,
  referenceId: string,
  customer: any,
  origin: string
): Promise<{ data: any; error: string | null }> {
  const asaasBillingType = billingType === 'pix' ? 'PIX' : 'CREDIT_CARD';

  const customerData: any = {};
  if (customer?.full_name) customerData.name = customer.full_name;
  if (customer?.tax_id) customerData.cpfCnpj = customer.tax_id;
  if (customer?.email) customerData.email = customer.email;
  if (customer?.phones?.length) customerData.phone = customer.phones[0].replace(/\D/g, '');

  const body: any = {
    billingTypes: [asaasBillingType],
    chargeTypes: ['DETACHED'],
    minutesToExpire: 1440,
    externalReference: referenceId,
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
    body.customerData = customerData;
  }

  try {
    const resp = await fetch(`${apiBase()}/checkouts`, {
      method: 'POST',
      headers: asaasHeaders(apiKey),
      body: JSON.stringify(body),
    });
    const json = await resp.json();
    if (!resp.ok) {
      const errMsg = json?.errors?.map((e: any) => e.description).join('; ') || JSON.stringify(json);
      console.error('[generate_payment_link] Checkout error', errMsg);
      return { data: null, error: errMsg };
    }
    return { data: json, error: null };
  } catch (err) {
    console.error('[generate_payment_link] Checkout fetch error', err);
    return { data: null, error: String(err) };
  }
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

    const billingType = (body.billing_type || 'pix').toString().toLowerCase();
    if (!ALLOWED_BILLING_TYPES.has(billingType)) {
      return Response.json({ error: 'invalid_billing_type', request_id: requestId }, { status: 400 });
    }

    let order: any = null;
    let quote: any = null;
    try { order = await base44.asServiceRole.entities.Order.get(referenceId); } catch (_) { /* maybe quote */ }
    if (!order) {
      try { quote = await base44.asServiceRole.entities.Quote.get(referenceId); } catch (_) { /* not found */ }
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
    const origin = DEFAULT_ORIGIN;
    const referenceLabel = order?.ticket_number || referenceId.slice(0, 8).toUpperCase();
    const referenceIdForAsaas = order?.id || quote?.id || referenceId;

    let result: { type: string; asaasId: string; url: string; pixQrCode?: string; pixCopyPasteKey?: string } | null = null;
    let lastError: string | null = null;

    // For PIX: try direct payment first (returns QR code + copy-paste key)
    if (billingType === 'pix') {
      const asaasCustomerId = await ensureAsaasCustomer(apiKey, customer);
      if (asaasCustomerId) {
        const pixResult = await createDirectPixPayment(apiKey, asaasCustomerId, amount, referenceLabel, referenceIdForAsaas, customer?.full_name);
        if (pixResult.data?.pixQrCode) {
          result = {
            type: 'direct_pix',
            asaasId: pixResult.data.id,
            url: pixResult.data.invoiceUrl,
            pixQrCode: pixResult.data.pixQrCode,
            pixCopyPasteKey: pixResult.data.pixCopyPasteKey,
          };
        } else {
          lastError = pixResult.error;
        }
      } else {
        lastError = 'Não foi possível criar/obter cliente no Asaas (CPF/CNPJ pode ser necessário).';
      }
    }

    // Fallback: checkout session (for credit card, or if direct PIX failed)
    if (!result) {
      const checkoutResult = await createCheckoutSession(apiKey, billingType, amount, referenceLabel, referenceIdForAsaas, customer, origin);
      if (checkoutResult.data) {
        result = {
          type: 'checkout',
          asaasId: checkoutResult.data.id,
          url: checkoutResult.data.link || `https://asaas.com/checkoutSession/show?id=${checkoutResult.data.id}`,
        };
      } else {
        lastError = checkoutResult.error || lastError;
      }
    }

    if (!result) {
      return Response.json({
        error: 'asaas_request_failed',
        asaas_error: lastError,
        message: lastError || 'Falha ao comunicar com o Asaas.',
        request_id: requestId,
      }, { status: 502 });
    }

    // Create internal payment record
    const payment = await base44.asServiceRole.entities.Payment.create({
      customer_id: customerId,
      quote_id: quote?.id,
      order_id: order?.id,
      unit_id: source.unit_id,
      status: 'pending',
      amount,
      payment_method: billingType === 'pix' ? 'pix' : 'credit_card',
      external_reference: result.asaasId,
      idempotency_key: `asaas:${result.asaasId}`,
      notes: result.type === 'direct_pix'
        ? `Pix direto Asaas. request_id=${requestId}`
        : `Checkout Asaas. request_id=${requestId}`,
    });

    await base44.asServiceRole.entities.AuditLog.create({
      action: 'create',
      entity_type: 'payment',
      entity_id: payment.id,
      item_label: referenceLabel,
      customer_name: customer?.full_name,
      amount,
      reason: result.type === 'direct_pix' ? 'pix_payment_created_asaas' : 'payment_link_created_asaas',
      user_email: user.email,
      user_name: user.full_name || user.display_name,
      user_role: user.role,
      unit_id: source.unit_id,
      request_id: requestId,
      success: true,
    });

    return Response.json({
      url: result.url,
      pix_qr_code: result.pixQrCode || null,
      pix_copy_paste_key: result.pixCopyPasteKey || null,
      checkout_id: result.type === 'checkout' ? result.asaasId : null,
      payment_id: payment.id,
      billing_type: billingType,
      payment_type: result.type,
      request_id: requestId,
    });
  } catch (error) {
    console.error(`[generate_payment_link:${requestId}]`, error);
    return Response.json({ error: 'payment_link_failed', request_id: requestId }, { status: 500 });
  }
});