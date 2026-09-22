import { normalizePhotoItems, quoteLines, brl, inspectionNotice, planLabel } from './chatQuotePresentation.js';

export async function finalizeChatPhotoQuote({ base44, customer, conversation, currentState, unitId }) {
  const db = base44.asServiceRole.entities;
  const items = normalizePhotoItems(currentState.temp_items || []);
  if (!items.length) return { message: 'Ainda não há peças neste orçamento. Envie uma foto ou a lista das peças para começar.', options: [] };
  const needsReview = items.some((item) => item.needs_review);
  const total = Math.round(items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0) * 100) / 100;
  const quote = await db.Quote.create({ customer_id: customer.id, unit_id: unitId, origin: 'whatsapp', status: needsReview ? 'HUMAN_REVIEW' : 'SENT', review_deadline_at: new Date(Date.now() + 3600000).toISOString(), items, subtotal: total, total, metadata: { conversation_id: conversation.id, photo_review_required: needsReview } });
  const cards = await db.CrmCard.filter({ pipeline_type: 'QUOTE', customer_id: customer.id, stage: 'Coletando itens' });
  const cardData = { stage: needsReview ? 'Em análise humana' : 'Enviado ao cliente', linked_quote_id: quote.id, due_at: quote.review_deadline_at };
  if (cards[0]) await db.CrmCard.update(cards[0].id, cardData);
  else await db.CrmCard.create({ ...cardData, pipeline_type: 'QUOTE', priority: 'HIGH', customer_id: customer.id, unit_id: unitId });
  Object.assign(currentState, { active_quote_id: quote.id, flow: needsReview ? 'HANDOFF_QUOTE_REVIEW' : 'AWAITING_QUOTE_APPROVAL', temp_items: items });
  await db.Conversation.update(conversation.id, { metadata: { ...currentState }, ...(needsReview ? { handoff_required: true } : {}) });
  await db.StaffNotification.create({ type: 'NEW_QUOTE', target_team: 'sales', payload: { conversation_id: conversation.id, customer_name: customer.full_name, quote_id: quote.id, summary: needsReview ? 'Conferir identificação, quantidade ou preço das peças antes de enviar a cobrança.' : 'Orçamento por fotos enviado para aprovação.' }, sent_at: new Date().toISOString() });
  if (needsReview) return { quote_id: quote.id, message: `Recebi suas peças:\n${quoteLines(items)}\n\nEncaminhei as fotos à equipe para conferir os itens e as quantidades antes de fechar o total. Nenhuma cobrança foi emitida.`, options: [] };
  const plans = await db.Product.filter({ active: true, category: 'Planos' }, 'price');
  const hasForbiddenBagItems = items.some((item) => /edredom|cobert|manta|tapete|cortina|terno|vestido|casaco|jaqueta|sof[aá]/i.test(item.garment_type));
  const offers = plans.length ? `\n\nPlanos pré-pagos disponíveis:\n${plans.map((product) => `- ${planLabel(product)}: ${product.description || 'Créditos para usar na lavanderia.'}`).join('\n')}` : '';
  return { quote_id: quote.id, message: `*Resumo do orçamento*\n${quoteLines(items)}\n\n*Total estimado: ${brl(total)}*\n${inspectionNotice}${offers}\n\nVocê prefere seguir com este orçamento ou conhecer os planos?`, options: [
    { id: 'follow_quote', title: 'Quero este orçamento', description: 'Aceitar esta estimativa' },
    { id: 'see_plans', title: 'Quero ver planos', description: 'Ver planos pré-pagos' },
    ...(!hasForbiddenBagItems ? [{ id: 'see_bags', title: 'Quero ver bags', description: 'Ver pacotes de peças' }] : []),
  ] };
}