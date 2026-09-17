export const PAYMENT_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'debito', label: 'Débito em conta / cartão de débito' },
  { value: 'credito_vista', label: 'Crédito à vista' },
  { value: 'credito_parcelado', label: 'Crédito parcelado' },
  { value: 'pix', label: 'Pix' },
  { value: 'boleto', label: 'Boleto / duplicata' },
  { value: 'transferencia', label: 'Transferência (TED/DOC)' },
  { value: 'vale', label: 'Vale / benefício' },
  { value: 'outro', label: 'Outro' },
];

export function paymentMethodLabel(value) {
  if (!value) return 'Não informada';
  return PAYMENT_METHODS.find((method) => method.value === value)?.label || value;
}