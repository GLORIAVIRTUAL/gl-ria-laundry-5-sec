import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { getPickupShiftEligibility, pickupShiftError } from '../../shared/pickupShiftPolicy.js';
import { getPickupScheduleForDate } from '../../shared/pickupSchedule.js';
import { buildPickupAvailabilityResponse } from '../../shared/pickupAvailability.js';
import { findNextAvailablePickupDay } from '../../shared/nextPickupDay.js';
import { handlePickupStep } from '../../shared/chatPickupFlow.js';


export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'super_admin'].includes(user.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });
    const checks = {};
    const morning = new Date('2026-09-24T10:46:00-03:00');
    const afternoon = new Date('2026-09-24T14:00:00-03:00');
    const atNoon = new Date('2026-09-24T12:00:00-03:00');
    const eligible = getPickupShiftEligibility('2026-09-24', morning);
    checks.screenshotScenario = !eligible.morning && eligible.afternoon;
    checks.noonBlocksToday = !getPickupShiftEligibility('2026-09-24', atNoon).afternoon;
    checks.afternoonBlocksToday = !getPickupShiftEligibility('2026-09-24', afternoon).afternoon;
    checks.futureUnchanged = Object.values(getPickupShiftEligibility('2026-09-25', afternoon)).every(Boolean);
    checks.pastBlocked = Object.values(getPickupShiftEligibility('2026-09-23', morning)).every(v => !v);
    checks.brasiliaNotUtc = getPickupShiftEligibility('2026-09-25', new Date('2026-09-25T01:00:00Z')).morning;
    const response = buildPickupAvailabilityResponse({ request: { date: '2026-09-24', label: 'hoje' }, schedule: getPickupScheduleForDate('2026-09-24'), now: morning });
    checks.offerOnlyAfternoon = response.period === 'afternoon' && !response.message.includes('manhã');
    const mock = { asServiceRole: { entities: { Pickup: { filter: async () => [] }, Conversation: { update: async () => {} } } } };
    const nextMorning = await findNextAvailablePickupDay(mock, '2026-09-24', { includeFromDate: true, now: morning });
    const nextAfternoon = await findNextAvailablePickupDay(mock, '2026-09-24', { includeFromDate: true, now: afternoon });
    checks.nextTurnMorning = nextMorning.date === '2026-09-24' && nextMorning.morning === 0 && nextMorning.afternoon > 0;
    checks.nextDayAfternoon = nextAfternoon.date === '2026-09-25' && nextAfternoon.morning > 0;
    const saturday = await findNextAvailablePickupDay(mock, '2026-09-26', { includeFromDate: true, now: new Date('2026-09-26T10:00:00-03:00') });
    checks.saturdaySkipsSunday = saturday.date === '2026-09-28';
    let calledSchedule = false;
    const state = { flow: 'AWAITING_PICKUP_CONFIRMATION', pending_pickup: { date: '2020-01-02', period: 'morning' } };
    const stale = await handlePickupStep({ base44: mock, text: 'sim', currentState: state, conversation: { id: 'mock' }, schedulePickup: async () => { calledSchedule = true; } });
    checks.staleOfferReplaced = !calledSchedule && stale.messages[0].includes('Não agendamos') && state.pending_pickup?.date !== '2020-01-02';

    checks.rejectSameMorning = Boolean(pickupShiftError('2026-09-24', 'morning', morning));
    return Response.json({ passed: Object.values(checks).every(Boolean), checks, sampleResponse: response.message, whatsappSent: false, fullSchedulingVerified: false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}