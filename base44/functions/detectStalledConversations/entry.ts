import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { authorizeUserOrInternal, securityErrorResponse } from '../../shared/functionSecurity.js';
import { logGuardEvent } from '../../shared/guardTelemetry.js';
import { traceLog } from '../../shared/chatTurnGuard.js';
import { sendOpsAlert } from '../../shared/opsAlert.js';

// ============================================================================
// ALERTA DE CONVERSA PARADA (bloco P2 do guia de auditoria).
//
// A rede de segurança (recoverUnansweredMessages) cobre a janela de 30 min.
// Depois disso, uma conversa pode ficar ENCALHADA sem ninguém perceber:
//   a) o cliente falou e NINGUÉM respondeu (nem IA nem humano) — falha grave;
//   b) a conversa está num fluxo operacional aberto (orçamento, pagamento,
//      coleta) e não avança há horas — cliente abandonado no meio do processo.
// Esta função detecta os dois casos e gera um alerta no painel de qualidade,
// no máximo UM por conversa por dia (idempotência por chave diária).
// ============================================================================

// Fluxos que representam um processo EM ABERTO esperando conclusão.
const OPEN_FLOWS = new Set([
  'QUOTE', 'TEXT_QUOTE',
  'AWAITING_FULFILLMENT_CHOICE', 'AWAITING_PAYMENT_METHOD', 'AWAITING_PAYMENT_CONFIRMATION',
  'GENERATING_PAYMENT', 'WAITING_RECEIPT',
  'AWAITING_PICKUP_PERIOD', 'AWAITING_PICKUP_CONFIRMATION',
  'AWAITING_PICKUP_DATE', 'PICKUP_ADDRESS_AUTO', 'AWAITING_PAYMENT_TIMING',
  'MOINHOS_PROMOTION_INTEREST'
]);

const UNANSWERED_AFTER_MS = 30 * 60 * 1000;      // cliente sem resposta há mais de 30 min
const OPEN_FLOW_STALE_AFTER_MS = 6 * 60 * 60 * 1000; // processo aberto sem avanço há 6 h
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;      // ignora conversas com mais de 7 dias
const CLOSE_AFTER_MS = 24 * 60 * 60 * 1000;      // finaliza a conversa após 24 h sem mensagens

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    await authorizeUserOrInternal(base44, req, body, {
      roles: ['super_admin', 'admin'],
      source: 'detect_stalled_conversations',
    });

    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const conversations = await base44.asServiceRole.entities.Conversation.list('-last_message_at', 200);
    const alerts = [];
    const closed = [];

    for (const conv of conversations) {
      if (conv.status === 'CLOSED') continue;
      const lastAt = conv.last_message_at ? new Date(conv.last_message_at).getTime() : 0;
      if (!lastAt) continue;
      const idleMs = now - lastAt;
      if (idleMs > MAX_AGE_MS && !conv.handoff_required) {
        await base44.asServiceRole.entities.Conversation.update(conv.id, {
          status: 'CLOSED',
          metadata: { ...(conv.metadata || {}), flow: null, step: null, closed_at: new Date().toISOString(), closed_reason: 'inactive_24h' }
        });
        closed.push(conv.id);
        continue;
      }
      if (idleMs > MAX_AGE_MS) continue;

      const lastMessages = await base44.asServiceRole.entities.Message.filter({ conversation_id: conv.id }, '-created_date', 1);
      const last = lastMessages[0];
      if (!last) continue;

      const flow = conv.metadata?.flow || null;

      // Finalização automática: 24 h sem mensagens. Só não fecha se o cliente
      // está esperando resposta de um atendente (isso continua alertando).
      const waitingHuman = last.direction === 'IN' && conv.handoff_required;
      if (idleMs > CLOSE_AFTER_MS && !waitingHuman) {
        await base44.asServiceRole.entities.Conversation.update(conv.id, {
          status: 'CLOSED',
          handoff_required: false,
          metadata: { ...(conv.metadata || {}), flow: null, step: null, closed_at: new Date().toISOString(), closed_reason: 'inactive_24h' }
        });
        closed.push(conv.id);
        continue;
      }

      let reason = null;
      if (last.direction === 'IN' && idleMs > UNANSWERED_AFTER_MS) {
        reason = conv.handoff_required
          ? `cliente aguarda resposta HUMANA há ${Math.round(idleMs / 60000)} min (conversa em atendimento humano)`
          : `cliente sem NENHUMA resposta há ${Math.round(idleMs / 60000)} min (fora da janela de recuperação automática)`;
      } else if (OPEN_FLOWS.has(flow) && idleMs > OPEN_FLOW_STALE_AFTER_MS) {
        reason = `processo "${flow}" aberto e sem avanço há ${Math.round(idleMs / 3600000)} h`;
      }
      if (!reason) continue;

      // Um alerta por conversa por dia: a chave diária evita enxurrada no painel.
      const alertKey = `stalled:${conv.id}:${today}`;
      const already = await base44.asServiceRole.entities.ProcessedEvent.filter({ event_key: alertKey }, '-created_date', 1);
      if (already.length) continue;

      const customer = await base44.asServiceRole.entities.Customer.get(conv.customer_id).catch(() => null);
      await base44.asServiceRole.entities.ProcessedEvent.create({
        event_key: alertKey,
        event_type: 'conversation.stalled',
        source: 'scheduler',
        status: 'completed',
        entity_type: 'Conversation',
        entity_id: conv.id,
        unit_id: conv.metadata?.unit_id || undefined,
        completed_at: new Date().toISOString(),
        result: { reason, flow, idle_ms: idleMs, trace_id: last.trace_id || null }
      });
      await logGuardEvent(base44, {
        guard: 'stalled_conversation',
        conversation_id: conv.id,
        customer_name: customer?.full_name,
        detail: `Conversa parada: ${reason}. Fluxo: ${flow || 'nenhum'}. trace_id=${last.trace_id || 'n/a'}`,
        excerpt: (last.text || '').slice(0, 300)
      });
      if (last.direction === 'IN') {
        await sendOpsAlert(base44, { key: `stalled:${conv.id}`, text: `Conversa parada.\nCliente: ${customer?.full_name || 'desconhecido'}\nMotivo: ${reason}` });
      }
      traceLog('stalled_conversation_alerted', { trace_id: last.trace_id || null, conversation_id: conv.id, flow, idle_ms: idleMs });
      alerts.push({ conversation_id: conv.id, flow, idle_minutes: Math.round(idleMs / 60000), reason });
    }

    return Response.json({ status: 'success', alert_count: alerts.length, alerts, closed_count: closed.length });
  } catch (error) {
    console.error('Error in detectStalledConversations:', error?.code || error?.message || error);
    return securityErrorResponse(error);
  }
});