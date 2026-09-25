// Transferência para atendimento humano: um único caminho para todos os casos
// (pedido do cliente, IA sem resposta, falha técnica, etapa sem saída).
// Efeitos: bloqueia a IA na conversa (nome pisca no Chat), cria notificação no sistema
// e devolve a mensagem que deve ser enviada ao cliente.
export const HANDOFF_MESSAGE = 'Vou transferir você para um dos nossos atendentes, que vai continuar o seu atendimento por aqui em instantes. 😊';

export async function transferToHuman({ base44, conversation, customer, currentState = {}, reason }) {
  const db = base44.asServiceRole.entities;
  const metadata = { ...currentState, flow: 'HANDOFF', handoff_reason: reason, handoff_at: new Date().toISOString() };
  await db.Conversation.update(conversation.id, { handoff_required: true, metadata });
  Object.assign(currentState, metadata);
  await db.StaffNotification.create({
    type: 'HUMAN_HANDOFF',
    target_team: 'support',
    payload: { conversation_id: conversation.id, customer_id: customer?.id, customer_name: customer?.full_name, summary: reason },
    sent_at: new Date().toISOString()
  }).catch((error) => console.error('Falha ao criar notificação de transferência:', error?.message));
  return HANDOFF_MESSAGE;
}