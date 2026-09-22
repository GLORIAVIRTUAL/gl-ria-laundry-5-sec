// ============================================================================
// chatTurnGuard — bloco P0 do guia de auditoria de chatbots:
//   1. trace_id de ponta a ponta (webhook → gatilho → orquestrador → envio)
//   2. trava de processamento concorrente por conversa
//   3. escrita idempotente (Pickup, Quote, Order, CrmCard) via ProcessedEvent
// ============================================================================

export const newTraceId = () => crypto.randomUUID();

// Log estruturado de etapa do turno (grep por trace_id reconstrói o caminho inteiro).
export const traceLog = (stage, fields = {}) => {
  console.log(JSON.stringify({ stage, at: new Date().toISOString(), ...fields }));
};

const LOCK_TTL_MS = 90_000;
const LOCK_POLL_MS = 2_000;

// Trava por conversa guardada em Conversation.metadata.ai_lock. Espera até `waitMs`
// por uma trava alheia; travas mais antigas que LOCK_TTL_MS são consideradas mortas.
export async function acquireConversationLock(base44, conversationId, traceId, { waitMs = 20_000 } = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + waitMs;
  while (true) {
    const conversation = await base44.asServiceRole.entities.Conversation.get(conversationId);
    const lock = conversation?.metadata?.ai_lock;
    const lockAge = lock?.acquired_at ? Date.now() - new Date(lock.acquired_at).getTime() : Infinity;
    if (!lock || lockAge > LOCK_TTL_MS) {
      const metadata = { ...(conversation?.metadata || {}), ai_lock: { trace_id: traceId, acquired_at: new Date().toISOString() } };
      await base44.asServiceRole.entities.Conversation.update(conversationId, { metadata });
      const confirmed = await base44.asServiceRole.entities.Conversation.get(conversationId);
      if (confirmed?.metadata?.ai_lock?.trace_id === traceId) {
        return { acquired: true, waited_ms: Date.now() - startedAt, conversation: confirmed };
      }
    }
    if (Date.now() >= deadline) return { acquired: false, waited_ms: Date.now() - startedAt, conversation };
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
  }
}

export async function releaseConversationLock(base44, conversationId, traceId) {
  const conversation = await base44.asServiceRole.entities.Conversation.get(conversationId).catch(() => null);
  if (!conversation || conversation.metadata?.ai_lock?.trace_id !== traceId) return false;
  const { ai_lock: _released, ...metadata } = conversation.metadata;
  await base44.asServiceRole.entities.Conversation.update(conversationId, { metadata });
  return true;
}

// Executa `run()` uma única vez por `key`. Se a mesma chave já foi concluída,
// devolve o registro existente em vez de criar outro.
export async function idempotentWrite(base44, { key, entityType, unitId = null, traceId = null, run }) {
  const events = base44.asServiceRole.entities.ProcessedEvent;
  const prior = (await events.filter({ event_key: key }, '-created_date', 1))[0];
  if (prior?.status === 'completed' && prior.entity_id) {
    traceLog('write_deduplicated', { trace_id: traceId, key, entity_type: entityType, entity_id: prior.entity_id });
    const record = await base44.asServiceRole.entities[entityType].get(prior.entity_id).catch(() => ({ id: prior.entity_id }));
    return { record, deduplicated: true };
  }
  const event = prior || await events.create({
    event_key: key,
    event_type: `${entityType}.create`,
    source: 'internal',
    status: 'processing',
    entity_type: entityType,
    unit_id: unitId || undefined,
    started_at: new Date().toISOString(),
    result: { trace_id: traceId }
  });
  try {
    const record = await run();
    await events.update(event.id, { status: 'completed', entity_id: record.id, completed_at: new Date().toISOString(), result: { trace_id: traceId, entity_id: record.id } });
    return { record, deduplicated: false };
  } catch (error) {
    await events.update(event.id, { status: 'failed', error_message: String(error?.message || error).slice(0, 500) }).catch(() => {});
    throw error;
  }
}