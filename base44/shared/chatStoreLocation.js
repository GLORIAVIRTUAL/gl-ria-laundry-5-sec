import { normalizeChatText } from './chatQuotePresentation.js';

export function resolveChatStore(units = [], unitId) {
  return units.find(unit => unit.id === unitId) || (units.length === 1 ? units[0] : null);
}

export function storeAddressText(store) {
  const address = store?.address?.trim();
  return address ? `Nossa loja ${store.name} fica em:\n${address}\n\nMapa: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : 'O endereço da loja ainda não está cadastrado. A equipe precisa confirmar essa informação.';
}

export function buildStoreContext(units = [], unitId) {
  const store = resolveChatStore(units, unitId);
  return `ENDEREÇO OFICIAL ATUAL (cadastro da página de Coletas):\n${storeAddressText(store)}\nUse somente esse cadastro, mesmo que mensagens antigas citem outras lojas. Não invente contatos ou horários e não confunda endereço do cliente com endereço da loja.`;
}

export function buildStoreAddressReply(text, units, unitId) {
  const value = normalizeChatText(text);
  if (/\bmeu endereco\b|\bmoro\b|\bminha casa\b/.test(value)) return null;
  const asks = /(?:endereco|localizacao).{0,45}(?:loja|voces|lavanderia|unidade)|(?:loja|voces|lavanderia|unidade).{0,45}(?:endereco|localizacao)|onde.{0,25}(?:fica|ficam|voces estao)|qual.{0,15}(?:seu|o) endereco/.test(value);
  return asks ? storeAddressText(resolveChatStore(units, unitId)) : null;
}