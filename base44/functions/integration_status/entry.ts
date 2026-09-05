import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { authorizeUserOrInternal, securityErrorResponse } from '../../shared/functionSecurity.js';

const DEFINITIONS = [
  { id: 'garment_ai', name: 'IA para peças e documentos', type: 'ai', required: ['GEMINI_API_KEY'] },
  { id: 'asaas', name: 'Pagamentos Asaas', type: 'payment', required: ['ASAAS_API_KEY', 'ASAAS_ENVIRONMENT'] },
  { id: 'stripe', name: 'Pagamentos Stripe', type: 'payment', required: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] },
  { id: 'zapi_main', name: 'WhatsApp Z-API principal', type: 'messaging', required: ['ZAPI_INSTANCE_ID', 'ZAPI_TOKEN', 'ZAPI_SECURITY_TOKEN'] },
  { id: 'zapi_moinhos', name: 'WhatsApp Z-API Moinhos', type: 'messaging', required: ['ZAPI_MOINHOS_INSTANCE_ID', 'ZAPI_MOINHOS_TOKEN', 'ZAPI_MOINHOS_SECURITY_TOKEN'] },
  { id: 'whatsapp_moinhos', name: 'WhatsApp Cloud Moinhos', type: 'messaging', required: ['WHATSAPP_MOINHOS_ACCESS_TOKEN', 'WHATSAPP_MOINHOS_PHONE_NUMBER_ID', 'WHATSAPP_MOINHOS_VERIFY_TOKEN', 'WHATSAPP_MOINHOS_APP_SECRET'] },
  { id: 'maps', name: 'Google Maps', type: 'maps', required: ['GOOGLE_MAPS_API_KEY'] },
  { id: 'automation', name: 'Automações internas', type: 'automation', required: ['INTERNAL_FUNCTION_TOKEN'] },
];

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed', request_id: requestId }, { status: 405 });
    }
    const base44 = createClientFromRequest(req);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const principal = await authorizeUserOrInternal(base44, req, body, { allowInternal: false, source: 'integration_status' });
    const user = principal.user;
    if (!['super_admin', 'admin', 'manager'].includes(user.role) && !(user.permissions || []).includes('integrations.view_status')) {
      return Response.json({ error: 'forbidden', request_id: requestId }, { status: 403 });
    }

    const integrations = DEFINITIONS.map((definition) => {
      const missingKeys = definition.required.filter((key) => !Deno.env.get(key));
      return {
        id: definition.id,
        display_name: definition.name,
        integration_type: definition.type,
        configured: missingKeys.length === 0,
        health_status: missingKeys.length === 0 ? 'unknown' : 'not_configured',
        required_secret_names: definition.required,
        missing_secret_names: missingKeys,
      };
    });

    return Response.json({
      integrations,
      debug_endpoints_enabled: Deno.env.get('ENABLE_INTERNAL_DEBUG_ENDPOINTS') === 'true',
      checked_at: new Date().toISOString(),
      request_id: requestId,
    });
  } catch (error) {
    if (error?.name === 'SecurityError') return securityErrorResponse(error);
    console.error(`[integration_status:${requestId}]`, error);
    return Response.json({ error: 'integration_status_failed', request_id: requestId }, { status: 500 });
  }
});