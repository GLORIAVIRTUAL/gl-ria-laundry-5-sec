import { normalizeChatText } from './chatQuotePresentation.js';

const fields = [
  ['tax_id', 'CPF ou CNPJ do pagador (somente números)'],
  ['address', 'rua ou avenida do endereço de cobrança'],
  ['address_number', 'número do endereço de cobrança (ou “sem número”)'],
  ['zip_code', 'CEP do endereço de cobrança'],
  ['neighborhood', 'bairro do endereço de cobrança'],
];
export const missingPayerField = (customer) => fields.find(([key]) => !String(customer[key] || '').trim());
export const payerQuestion = (field) => `Para emitir a cobrança, preciso do ${field[1]}. Pode informar? Esses dados são de cobrança e não definem coleta ou entrega.`;
export function parsePayerField(field, text) {
  const value = String(text || '').trim();
  if (!value || value.length > 180 || /[?]/.test(value)) return null;
  if (field === 'tax_id') {
    const digits = value.replace(/\D/g, '');
    if (![11, 14].includes(digits.length) || /^(\d)\1+$/.test(digits)) return null;
    const check = (base, weights) => { const remainder = base.split('').reduce((sum, d, i) => sum + Number(d) * weights[i], 0) % 11; return remainder < 2 ? 0 : 11 - remainder; };
    const firstWeights = digits.length === 11 ? [10,9,8,7,6,5,4,3,2] : [5,4,3,2,9,8,7,6,5,4,3,2];
    const secondWeights = digits.length === 11 ? [11,10,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const base = digits.slice(0, -2);
    return check(base, firstWeights) === Number(digits.at(-2)) && check(digits.slice(0, -1), secondWeights) === Number(digits.at(-1)) ? digits : null;
  }
  if (field === 'zip_code') { const digits = value.replace(/\D/g, ''); return digits.length === 8 ? digits : null; }
  if (field === 'address_number') return /^(\d+[a-zA-Z]?(?:[\s/-]+\w+)?|s\/?n|sem n[uú]mero)$/i.test(value) ? value : null;
  if (/\b(nao|cancelar|pix|cartao|paguei|ajuda|atendente|coleta|orcamento)\b/.test(normalizeChatText(value))) return null;
  return value.length >= 3 ? value : null;
}

export function affirmativePaymentMethod(text) {
  const value = normalizeChatText(text);
  if (/\?|\b(nao|depois|paguei|pago|comprovante|estorno|cancelar|aceita|aceitam|como|qual|quanto)\b/.test(value)) return null;
  if (/\b(?:quero|vou|prefiro)(?:\s+pagar)?(?:\s+(?:por|via|no|com))?\s+pix(?:\s+(?:agora|antecipado))?\b/.test(value) || /\bpix\s+antecipado\b/.test(value)) return 'pix';
  if (/\b(?:quero|vou|prefiro)(?:\s+pagar)?(?:\s+(?:por|no|com))?\s+cartao(?:\s+de\s+credito)?(?:\s+(?:agora|online|antecipado))?\b/.test(value)) return 'credit_card';
  return null;
}

export function immediatePaymentMethod(text) {
  const value = normalizeChatText(text).replace(/[.!]+$/g, '');
  if (/\?|\b(nao|depois|paguei|pago|comprovante|estorno|cancelar|aceita|aceitam|pode ser|como|qual|quanto)\b/.test(value)) return null;
  if (/^(?:pix(?: agora| antecipado)?|(?:quero|vou|prefiro)(?: pagar)?(?: por| via| no| com)? pix(?: agora| antecipado)?|pagar(?: por| via| no| com)? pix(?: agora)?)$/.test(value)) return 'pix';
  if (/^(?:(?:quero|vou|prefiro)(?: pagar)?(?: por| no| com)? )?cartao(?: de credito)?(?: agora| online| antecipado)$/.test(value) || value === 'cartao de credito') return 'credit_card';
  return null;
}