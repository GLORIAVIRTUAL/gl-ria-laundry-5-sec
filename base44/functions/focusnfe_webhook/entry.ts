import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

const STATUS_MAP = {
  autorizado: 'authorized',
  autorizada: 'authorized',
  cancelado: 'cancelled',
  cancelada: 'cancelled',
  erro_autorizacao: 'rejected',
  processando_autorizacao: 'processing',
};

export default async function (req) {
  try {
    const expected = secrets.get('FOCUSNFE_WEBHOOK_TOKEN');
    const provided = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    if (!expected || provided.replace(/^Bearer\s+/i, '').trim() !== expected) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const ref = payload?.ref;
    if (!ref) return Response.json({ error: 'missing_ref' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const candidates = await base44.asServiceRole.entities.FiscalDocument.list('-created_date', 200);
    const doc = candidates.find((item) => item?.metadata?.focusnfe_ref === ref);
    if (!doc) return Response.json({ ok: true, matched: false, ref });

    const status = STATUS_MAP[String(payload.status || '').toLowerCase()] || 'processing';
    const update = {
      status,
      nfse_number: payload.numero || doc.nfse_number,
      verification_code: payload.codigo_verificacao || doc.verification_code,
      metadata: { ...(doc.metadata || {}), focusnfe_webhook: payload },
    };
    if (status === 'authorized') update.authorized_at = new Date().toISOString();
    if (status === 'cancelled') update.cancelled_at = new Date().toISOString();
    if (status === 'rejected') {
      const first = Array.isArray(payload.erros) ? payload.erros[0] : null;
      update.last_error_code = first?.codigo || 'erro_autorizacao';
      update.last_error_message = first?.mensagem || 'Rejeitado pela prefeitura';
    }

    await base44.asServiceRole.entities.FiscalDocument.update(doc.id, update);
    return Response.json({ ok: true, matched: true, fiscal_document_id: doc.id, status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}