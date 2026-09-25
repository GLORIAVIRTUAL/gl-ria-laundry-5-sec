export const brl = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
export const normalizeChatText = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export const planLabel = (product) => `Plano de ${brl(product.price)}`;
export const inspectionNotice = 'Estimativa sujeita à inspeção das peças pela equipe. Qualquer alteração de valor será informada para sua aprovação antes do serviço; um pagamento antecipado será considerado no acerto.';

// awaitingChoice: a Glória acabou de perguntar "coleta ou loja?" — aceita respostas curtas
// e naturais ("na minha casa", "coleta", "eu levo", "loja").
export function explicitFulfillment(text, { awaitingChoice = false } = {}) {
  const value = normalizeChatText(text);
  if (/\?|\bnao\b/.test(value)) return null;
  if (awaitingChoice) {
    if (/\b(loja|eu levo|levo eu|vou levar|levar ai|deixar ai)\b/.test(value)) return 'store';
    if (/\b(coleta|coletar|buscar|busca|busquem|retirar|minha casa|em casa|aqui em casa|meu endereco|no endereco|domicilio|delivery|tele)\b/.test(value)) return 'pickup';
  }
  if (/^(quero coleta|acrescentar coleta|adicionar coleta|want_pickup|add_pickup)[.! ]*$/.test(value) || /\b(?:quero|prefiro|preciso)(?:\s+de)?\s+coleta\b/.test(value) || /(?:quero|preciso|prefiro|pode|podem)\s+(?:que\s+)?(?:voces\s+)?(?:buscar|busquem|coletar|retirar)/.test(value)) return 'pickup';
  if (/^(vou levar na loja|store_dropoff)[.! ]*$/.test(value) || /(?:vou|prefiro|quero)\s+(?:levar|deixar).{0,25}\bloja\b/.test(value)) return 'store';
  return null;
}

export function normalizePhotoItems(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item.message_id) return true;
    if (seen.has(item.message_id)) return false;
    seen.add(item.message_id); return true;
  }).map((item, index) => {
    const legacyBikiniPair = /biquini/.test(normalizeChatText(item.garment_type)) && /(?:duas|2) pecas/.test(normalizeChatText(item.notes));
    const qty = Number(item.qty ?? (legacyBikiniPair ? 2 : 1));
    const validQty = Number.isInteger(qty) && qty > 0 && qty <= 100;
    const unitPrice = item.unit_price == null ? null : Number(item.unit_price);
    const validPrice = Number.isFinite(unitPrice) && unitPrice > 0;
    const subtotal = validQty && validPrice ? Math.round(qty * unitPrice * 100) / 100 : null;
    return { ...item, line_id: item.line_id || item.message_id || `photo-${index + 1}`, qty: validQty ? qty : null, unit_price: validPrice ? unitPrice : null, subtotal, total_amount: subtotal,
      quantity_uncertain: item.quantity_uncertain === true || !validQty,
      needs_review: item.needs_review === true || item.quantity_uncertain === true || item.multiple_product_types === true || !validQty || !validPrice || Number(item.confidence ?? 1) < 0.6 };
  });
}

export function quoteLines(items) {
  const grouped = new Map();
  for (const item of items) {
    const key = `${item.garment_type}:${item.unit_price}:${item.needs_review}`;
    const line = grouped.get(key) || { name: item.garment_type, qty: 0, unit: item.unit_price, total: 0, review: item.needs_review };
    line.qty += Number(item.qty || 0); line.total += Number(item.subtotal || 0); grouped.set(key, line);
  }
  return [...grouped.values()].map((item) => `- ${item.qty || '?'}x ${item.name}: ${item.review ? 'a conferir pela equipe' : `${brl(item.unit)} cada — ${brl(item.total)}`}`).join('\n');
}