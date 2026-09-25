// ============================================================================
// chatStateMachine — bloco P1 do guia de auditoria de chatbots:
//   1. versão do estado da conversa (state_version) + migração explícita
//   2. last_successful_action (o que de fato foi concluído no turno anterior)
//   3. ferramentas permitidas por etapa (a IA não enxerga ferramenta fora de contexto)
// ============================================================================

export const STATE_SCHEMA_VERSION = 2;

// Garante que o estado carregado tenha versão. Estados antigos (sem versão) são
// marcados como v1 e migrados aqui, num único ponto — nunca espalhado pelo fluxo.
export const migrateState = (state = {}) => {
  const version = Number(state.state_version || 1);
  if (version >= STATE_SCHEMA_VERSION) return { state, migrated: false, from: version };
  // v1 → v2: passa a registrar a última ação concluída de forma estruturada.
  const migrated = {
    ...state,
    state_version: STATE_SCHEMA_VERSION,
    last_successful_action: state.last_successful_action || null
  };
  return { state: migrated, migrated: true, from: version };
};

// Registra a última ação CONCLUÍDA com sucesso (coleta criada, orçamento aprovado,
// cobrança gerada...). É isso que permite retomar a conversa sem repetir a ação.
export async function recordSuccessfulAction(base44, conversation, state, action, details = {}) {
  const entry = { action, at: new Date().toISOString(), ...details };
  Object.assign(state, { state_version: STATE_SCHEMA_VERSION, last_successful_action: entry });
  await base44.asServiceRole.entities.Conversation.update(conversation.id, { metadata: { ...state } });
  return entry;
}

// Frase injetada no prompt para a IA não refazer o que já foi concluído.
export const lastActionFact = (state = {}) => {
  const last = state.last_successful_action;
  if (!last?.action) return null;
  const labels = {
    pickup_scheduled: 'a coleta JÁ foi agendada com sucesso',
    quote_created: 'o orçamento JÁ foi criado e enviado',
    quote_accepted: 'o orçamento JÁ foi aprovado pelo cliente',
    payment_charge_created: 'a cobrança JÁ foi gerada e enviada ao cliente',
    package_sold: 'o plano/bag JÁ foi registrado no sistema'
  };
  const label = labels[last.action] || `a ação "${last.action}" JÁ foi concluída`;
  return `🚨 ÚLTIMA AÇÃO CONCLUÍDA NESTE ATENDIMENTO: ${label} (em ${new Date(last.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}). É PROIBIDO executar essa mesma ação de novo ou pedir ao cliente os dados que ela já consumiu. Siga para a próxima etapa do atendimento.`;
};

// ---------------------------------------------------------------------------
// Ferramentas permitidas por etapa
// ---------------------------------------------------------------------------
// Ferramentas que valem em qualquer etapa (consulta, suporte, transferência).
const ALWAYS_ALLOWED = new Set([
  'check_distance_to_stores',
  'calculate_area_quote',
  'check_pickup_availability',
  'schedule_pickup',
  'register_complaint',
  'request_urgent_delivery',
  'transfer_to_human'
]);

const PAYMENT_IN_PROGRESS_FLOWS = new Set([
  'WAITING_RECEIPT',
  'GENERATING_PAYMENT',
  'AWAITING_PAYMENT_CONFIRMATION',
  'PAYMENT_NEEDS_REVIEW'
]);

// Etapas conduzidas pelo sistema depois da aprovação (ver chatFlowController).
const POST_APPROVAL_FLOWS = new Set([
  'AWAITING_PICKUP_DATE',
  'PICKUP_ADDRESS_AUTO',
  'AWAITING_PAYMENT_TIMING',
  'AWAITING_PAYMENT_METHOD',
  'PAYMENT_AT_STORE'
]);

// Regra de cada ferramenta restrita: devolve o motivo do bloqueio ou null (liberada).
const RESTRICTED = {
  // Aprovar orçamento não faz sentido depois que a cobrança já está em andamento.
  approve_quote: (state) =>
    state.payment_confirmed ? 'o pagamento deste atendimento já foi confirmado'
      : PAYMENT_IN_PROGRESS_FLOWS.has(state.flow) ? 'a cobrança deste orçamento já está em andamento'
        : POST_APPROVAL_FLOWS.has(state.flow) ? 'o orçamento deste atendimento já foi aprovado'
          : null,
  // Cobrar exige algo concreto para cobrar (orçamento aprovado ou pedido criado).
  generate_payment_charge: (state) =>
    (state.active_quote_id || state.active_order_id) ? null
      : 'ainda não existe orçamento aprovado nem pedido para cobrar',
  // Vender plano/bag no meio de uma cobrança em andamento embaralha o pagamento.
  sell_package: (state) =>
    PAYMENT_IN_PROGRESS_FLOWS.has(state.flow) ? 'há uma cobrança em andamento neste atendimento' : null
};

export const toolBlockReason = (toolName, state = {}) => {
  if (ALWAYS_ALLOWED.has(toolName)) return null;
  const rule = RESTRICTED[toolName];
  return rule ? rule(state) : null;
};

// Remove da lista enviada ao modelo as ferramentas que não cabem na etapa atual.
// `alwaysInclude` cobre as reexecuções forçadas pelos guardas anti-alucinação.
export const filterToolsForState = (tools, state = {}, alwaysInclude = []) =>
  tools.filter((tool) => {
    const name = tool?.function?.name;
    if (!name || alwaysInclude.includes(name)) return true;
    return !toolBlockReason(name, state);
  });