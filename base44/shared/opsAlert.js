// Alerta operacional por WhatsApp para o responsável técnico (Thiago).
// Envia direto pela Z-API (não entra em nenhuma conversa de cliente) e
// limita a UM alerta por chave por hora, para não virar enxurrada.
export const OPS_ALERT_PHONE = '5587988020504';

export async function sendOpsAlert(base44, { key, text }) {
  try {
    const instance = Deno.env.get('ZAPI_INSTANCE_ID');
    const token = Deno.env.get('ZAPI_TOKEN');
    const clientToken = Deno.env.get('ZAPI_SECURITY_TOKEN');
    if (!instance || !token || !clientToken) return false;

    const hour = new Date().toISOString().slice(0, 13);
    const eventKey = `ops_alert:${key}:${hour}`;
    const db = base44.asServiceRole.entities;
    const already = await db.ProcessedEvent.filter({ event_key: eventKey }, '-created_date', 1);
    if (already.length) return false;
    await db.ProcessedEvent.create({ event_key: eventKey, event_type: 'ops.alert', source: 'internal', status: 'completed', completed_at: new Date().toISOString() });

    const res = await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': clientToken },
      body: JSON.stringify({ phone: OPS_ALERT_PHONE, message: `⚠️ *Alerta Glória*\n${String(text).slice(0, 1500)}` }),
      signal: AbortSignal.timeout(10000)
    });
    return res.ok;
  } catch (error) {
    console.warn('opsAlert: falha ao enviar alerta:', error?.message);
    return false;
  }
}