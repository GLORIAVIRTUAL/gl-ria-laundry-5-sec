// Encontra o PRÓXIMO DIA com vaga real de coleta (qualquer turno), olhando a agenda
// dia a dia — nunca "o mesmo dia da semana que vem".
import { getPickupDateRange, getPickupLocalHour, getPickupScheduleForDate } from './pickupSchedule.js';
import { getPickupShiftEligibility } from './pickupShiftPolicy.js';

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

const todayKey = (now) => now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export const pickupDayLabel = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
};

export async function findNextAvailablePickupDay(base44, fromDate, { includeFromDate = false, maxDays = 21, now = new Date() } = {}) {
  const today = todayKey(now);
  let date = includeFromDate ? fromDate : addDays(fromDate, 1);
  if (date < today) date = today;

  for (let i = 0; i < maxDays; i++, date = addDays(date, 1)) {
    const schedule = getPickupScheduleForDate(date);
    if (!schedule.isOpen) continue;
    const range = getPickupDateRange(date);
    const pickups = await base44.asServiceRole.entities.Pickup.filter({
      scheduled_at: { $gte: range.start, $lte: range.end },
      status: { $ne: 'cancelled' }
    });
    const morningCount = pickups.filter((p) => getPickupLocalHour(p.scheduled_at) < 13).length;
    const eligible = getPickupShiftEligibility(date, now);
    const morning = eligible.morning ? Math.max(0, (schedule.morningCapacity || 0) - morningCount) : 0;
    const afternoon = eligible.afternoon ? Math.max(0, (schedule.afternoonCapacity || 0) - (pickups.length - morningCount)) : 0;
    if (morning > 0 || afternoon > 0) {
      return { date, label: pickupDayLabel(date), morning, afternoon, morningLabel: schedule.morningLabel };
    }
  }
  return null;
}

// Frase pronta oferecendo o próximo dia disponível.
export const nextDayOffer = (next) => {
  if (!next) return 'No momento não encontrei vagas de coleta nos próximos dias. Vou verificar a agenda e te retorno. 😊';
  const shifts = next.morning > 0 && next.afternoon > 0
    ? `nos dois turnos: *${next.morningLabel || 'Manhã (das 8h às 12h)'}* ou *Tarde (das 13h às 16h)*. Qual você prefere?`
    : next.morning > 0
      ? `no turno da *${next.morningLabel || 'Manhã (das 8h às 12h)'}*. Posso agendar para você?`
      : 'no turno da *Tarde (das 13h às 16h)*. Posso agendar para você?';
  return `O próximo dia com vaga é *${next.label}*, ${shifts} 😊`;
};