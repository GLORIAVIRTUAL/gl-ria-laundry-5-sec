import { getPickupLocalHour, PICKUP_TIME_ZONE } from './pickupSchedule.js';

// Uma conversa pela manhã só pode receber oferta para a tarde ou dias seguintes.
// A partir de 12h, nenhum turno do próprio dia pode ser oferecido ou agendado.
export function getPickupShiftEligibility(date, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PICKUP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const part = (type) => parts.find((p) => p.type === type)?.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(String(date || ''));
  return {
    morning: valid && date > today,
    afternoon: valid && (date > today || (date === today && getPickupLocalHour(now) < 12))
  };
}

export function pickupShiftError(date, period, now = new Date()) {
  if (!['morning', 'afternoon'].includes(period)) return 'Informe um turno válido: manhã ou tarde.';
  if (getPickupShiftEligibility(date, now)[period]) return null;
  return 'Não é permitido oferecer ou agendar coleta no turno atual ou em um turno passado. Consulte o próximo turno disponível e peça a confirmação do cliente.';
}