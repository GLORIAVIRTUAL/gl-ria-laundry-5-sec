// Consultas do cliente sobre pedido, coleta ou pagamento: resposta montada pelo
// SISTEMA a partir dos registros reais — a IA não participa e não pode inventar.
const norm = (v = '') => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const brl = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;

const TOPICS = {
  order: /\b(como (esta|ta) (o )?meu pedido|status do meu pedido|meu pedido (ja )?(esta|ta|ficou|saiu)|(ta|esta|ficou|ficaram|estao|ja esta|ja estao) pront[ao]s?|quando (fica|ficam) pront[ao]s?|status do pedido|andamento)\b/,
  pickup: /\b(minha coleta|a coleta (esta|ta) (marcada|agendada|confirmada)|que horas (voces )?(passa|passam|vem|vêm)|quando (voces )?(vem|vao) (buscar|pegar|coletar))\b/,
  payment: /\b(meu pagamento|pagamento (caiu|entrou|foi confirmado|confirmou)|(voces )?(receberam|recebeu) (o|meu) (pagamento|pix)|o pix (caiu|entrou)|ja (paguei|pago))\b/,
};

const ORDER_STATUS = {
  awaiting_approval: 'aguardando sua aprovação',
  pending: 'recebido na loja, aguardando início da lavagem',
  processing: 'em processamento',
  partially_ready: 'parcialmente pronto',
  ready: 'pronto para retirada ✅',
  out_for_delivery: 'saiu para entrega 🚚',
  partially_delivered: 'parcialmente entregue',
  delivered: 'entregue',
};
const PAYMENT_STATUS = {
  pending: 'aguardando confirmação do banco',
  pending_confirmation: 'em conferência pela nossa equipe',
  succeeded: 'confirmado ✅',
  failed: 'não aprovado',
  expired: 'expirado (a cobrança venceu)',
  refunded: 'estornado',
};

const brtDate = (iso) => new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
const dayLabel = (iso) => { const d = brtDate(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };

export function detectStatusInquiry(text = '') {
  const t = norm(text);
  return Object.keys(TOPICS).filter((k) => TOPICS[k].test(t));
}

export async function answerStatusInquiry({ base44, customer, text }) {
  const topics = detectStatusInquiry(text);
  if (!topics.length) return null;
  const db = base44.asServiceRole.entities;
  const lines = [];

  if (topics.includes('order')) {
    const orders = (await db.Order.filter({ customer_id: customer.id }, '-created_date', 10))
      .filter((o) => !['finished', 'cancelled', 'delivered'].includes(o.status));
    lines.push(orders.length
      ? `📦 *Seus pedidos em aberto:*\n${orders.slice(0, 3).map((o) => `• Pedido ${o.ticket_number ? `#${o.ticket_number}` : o.id.slice(-5)}: ${ORDER_STATUS[o.status] || o.status}${o.expected_finish_at ? ` — previsão ${dayLabel(o.expected_finish_at)}` : ''}${Number(o.open_amount) > 0 ? ` (saldo a pagar ${brl(o.open_amount)})` : ''}`).join('\n')}`
      : '📦 Não encontrei nenhum pedido em aberto no seu cadastro.');
  }

  if (topics.includes('pickup')) {
    const pickups = (await db.Pickup.filter({ customer_id: customer.id, status: 'scheduled' }, 'scheduled_at', 3));
    lines.push(pickups.length
      ? `🚚 *Coleta agendada:*\n${pickups.map((p) => `• ${dayLabel(p.scheduled_at)}, turno da ${brtDate(p.scheduled_at).getHours() < 13 ? 'manhã (8h às 12h)' : 'tarde (13h às 16h)'}${p.address ? ` — ${p.address}` : ''}`).join('\n')}`
      : '🚚 Não há nenhuma coleta agendada no seu nome no momento.');
  }

  if (topics.includes('payment')) {
    const [payment] = await db.Payment.filter({ customer_id: customer.id }, '-created_date', 1);
    lines.push(payment
      ? `💳 Seu último pagamento de ${brl(payment.amount)} está *${PAYMENT_STATUS[payment.status] || payment.status}*.`
      : '💳 Não encontrei nenhum pagamento registrado no seu cadastro.');
  }

  const nothingFound = lines.every((l) => l.includes('Não encontrei') || l.includes('Não há'));
  if (nothingFound) lines.push('Se você deixou peças na loja ou pagou recentemente, digite *atendente* que nossa equipe confere para você. 😊');
  return lines.join('\n\n');
}