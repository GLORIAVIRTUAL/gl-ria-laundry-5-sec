import { getPickupLocalHour } from './pickupSchedule.js';
import { getPickupShiftEligibility } from './pickupShiftPolicy.js';

const normalize = (value = '') => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const toDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function resolvePickupAvailabilityRequest(text = '', now = new Date(), options = {}) {
  const value = normalize(text);
  const asksPickup = options.pickupProcessActive === true || /\b(coleta|coletar|recolher|recolhe|buscar|retirar|retirada)\b/.test(value);
  const asksAvailability = /\b(hoje|amanha|consegue|conseguem|pode|podem|disponibilidade|vaga|tem coleta|vai ter coleta)\b/.test(value);
  if (!asksPickup || !asksAvailability) return null;

  const brasiliaNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const requestedDate = new Date(brasiliaNow);
  let label = 'hoje';

  if (value.includes('amanha')) {
    requestedDate.setDate(requestedDate.getDate() + 1);
    label = 'amanhã';
  } else if (!value.includes('hoje')) {
    return null;
  }

  return { date: toDateKey(requestedDate), label };
}

export function buildPickupAvailabilityResponse({ request, schedule, pickups = [], now = new Date() }) {
  if (!schedule.isOpen) {
    return {
      message: schedule.error || `Não realizamos coletas ${request.label}.`,
      period: null,
      full: true
    };
  }

  let morningCount = 0;
  let afternoonCount = 0;
  for (const pickup of pickups) {
    if (getPickupLocalHour(pickup.scheduled_at) < 13) morningCount++;
    else afternoonCount++;
  }

  const eligible = getPickupShiftEligibility(request.date, now);
  const morningAvailable = eligible.morning ? Math.max(0, schedule.morningCapacity - morningCount) : 0;
  const afternoonAvailable = eligible.afternoon ? Math.max(0, schedule.afternoonCapacity - afternoonCount) : 0;

  if (morningAvailable > 0 && afternoonAvailable > 0) {
    // Os dois turnos livres: o cliente escolhe qual prefere (não escolhemos por ele).
    return {
      message: `Sim! Temos disponibilidade ${request.label} nos dois turnos: *${schedule.morningLabel}* ou *Tarde (das 13h às 16h)*. Qual você prefere? 😊`,
      period: null
    };
  }
  if (morningAvailable > 0) {
    return {
      message: `Sim! Temos disponibilidade ${request.label} no turno da ${schedule.morningLabel}. Posso agendar para você? 😊`,
      period: 'morning'
    };
  }
  if (afternoonAvailable > 0) {
    return {
      message: `Sim! Temos disponibilidade ${request.label} no turno da tarde (das 13h às 16h). Posso agendar para você? 😊`,
      period: 'afternoon'
    };
  }
  return {
    message: `Infelizmente não temos mais vagas para coleta ${request.label}.`,
    period: null,
    full: true
  };
}