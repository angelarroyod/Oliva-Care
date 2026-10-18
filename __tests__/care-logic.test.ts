import { fromMin, listY, longDate, num, toMin, weekRange, startOfWeek, relativeDay, greeting } from '@/features/care/clock';
import {
  severity, checkValue, rangeText, valueText, planFromRows, conditionChanges, sourceText, fmt, rangesFor, routineKinds,
} from '@/features/care/vitals';
import { inWindow, onShift, reminderRows, reminderTime, nextNurse, shiftLabel, shiftStart, type Nurse } from '@/features/care/shifts';
import { dosesForDay, summarize, summaryParts, parseTimes, isDue } from '@/features/care/doses';
import { eventsForDay, dayStatus, daySummary, filterEvents, feverState, namesFrom } from '@/features/care/timeline';
import type { DoseRow, ReadingRow, ScheduleRow, VitalPlanRow, EventRow } from '@/features/care/types';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m); // October 2026, local time
const iso = (d: Date) => d.toISOString();

const carmen: Nurse = { id: 'c', name: 'Carmen Morales', short: 'Carmen', start: '22:00', end: '06:00' };
const rosa: Nurse = { id: 'r', name: 'Rosa García', short: 'Rosa', start: '06:00', end: '22:00' };
const NURSES = [carmen, rosa];

describe('clock', () => {
  test('time math wraps midnight', () => {
    expect(toMin('06:00:00')).toBe(360);
    expect(fromMin(-15)).toBe('23:45');
    expect(fromMin(1440 + 5)).toBe('00:05');
  });
  test('spanish copy helpers', () => {
    expect(longDate(at(15, 23, 40))).toBe('jueves 15 de octubre');
    expect(weekRange(startOfWeek(at(15, 10)))).toBe('del 12 al 18 de octubre');
    expect(weekRange(new Date(2026, 8, 28))).toBe('del 28 de septiembre al 4 de octubre');
    expect(listY(['a', 'b', 'c'])).toBe('a, b y c');
    expect(relativeDay(at(14, 18, 20), at(15, 9))).toBe('ayer');
    expect(greeting(at(15, 23, 40))).toBe('Buenas noches');
  });
  test('num accepts comma decimals, rejects garbage', () => {
    expect(num('37,5')).toBe(37.5);
    expect(num('72')).toBe(72);
    expect(num('7a')).toBeNull();
    expect(num('')).toBeNull();
  });
});

describe('vitals', () => {
  const plan = planFromRows([]);
  test('basic plan when the patient has no rows', () => {
    expect(routineKinds(plan)).toEqual(['bp', 'hr', 'spo2', 'temp']);
  });
  test('severity: warn outside normal, alert outside alert band', () => {
    expect(severity(plan, 'hr', 72)).toBe('ok');
    expect(severity(plan, 'hr', 110)).toBe('warn');
    expect(severity(plan, 'hr', 140)).toBe('alert');
    expect(severity(plan, 'temp', 38.2)).toBe('warn');
  });
  test('bp takes the worse of systolic and diastolic', () => {
    expect(severity(plan, 'bp', 132, 80)).toBe('ok');
    expect(severity(plan, 'bp', 132, 95)).toBe('warn');
    expect(severity(plan, 'bp', 132, 125)).toBe('alert');
  });
  test('glucose range depends on the moment', () => {
    expect(severity(plan, 'glucose', 170, null, 'pre_meal')).toBe('warn');
    expect(severity(plan, 'glucose', 170, null, 'bedtime')).toBe('ok');
    expect(severity(plan, 'glucose', 262, null, 'pre_meal')).toBe('alert');
  });
  test('weight has no default range', () => {
    expect(rangesFor(plan, 'weight')).toEqual([]);
    expect(severity(plan, 'weight', 80)).toBe('ok');
  });
  test('plan rows override defaults, incl. alert band', () => {
    const rows: VitalPlanRow[] = [{
      patient_id: 'p', kind: 'spo2', frequency: 'Cada turno', in_routine: true, ranges: [[88, 100]],
      alert_low: 85, alert_high: 100, source_conditions: ['copd_asthma'], updated_by: null, updated_at: '',
    }];
    const p = planFromRows(rows);
    expect(severity(p, 'spo2', 89)).toBe('ok');
    expect(severity(p, 'spo2', 86)).toBe('warn');
    expect(severity(p, 'spo2', 84)).toBe('alert');
    expect(sourceText(p.spo2!.sources)).toBe('por EPOC / asma');
  });
  test('checkValue reports empty / invalid / direction', () => {
    expect(checkValue(null, '', [60, 100], [45, 130]).s).toBe('empty');
    expect(checkValue(null, 'x', [60, 100], [45, 130]).s).toBe('invalid');
    expect(checkValue(50, '50', [60, 100], [45, 130])).toEqual({ s: 'warn', dir: 'low' });
  });
  test('copy', () => {
    expect(rangeText('bp', [[90, 140], [60, 90]])).toBe('máxima 90 a 140, mínima 60 a 90');
    expect(rangeText('glucose', [[90, 150], [100, 180]])).toBe('90 a 150 antes de comer, 100 a 180 al acostarse');
    expect(rangeText('temp', [[36, 37.5]])).toBe('36,0 a 37,5 °C');
    expect(fmt('temp', 38.2)).toBe('38,2');
    expect(valueText('glucose', 128, null, 'fasting')).toEqual({ label: 'Glucosa en ayunas', value: '128 mg/dL' });
  });
  test('adding a condition: existing vitals gain the source, picked ones are added', () => {
    const { upserts, added } = conditionChanges(plan, 'copd_asthma', ['spo2', 'rr']);
    expect(added.map((s) => s.kind)).toEqual(['rr']); // spo2 is already in the basic plan
    expect(upserts.find((u) => u.kind === 'spo2')!.sources).toEqual(['copd_asthma']);
    expect(upserts.find((u) => u.kind === 'temp')!.sources).toEqual(['copd_asthma']);
    expect(upserts.find((u) => u.kind === 'rr')!.inRoutine).toBe(true);
  });
});

describe('shifts', () => {
  test('start inclusive, end exclusive, wraps', () => {
    expect(inWindow(toMin('22:00'), '22:00', '06:00')).toBe(true);
    expect(inWindow(toMin('05:59'), '22:00', '06:00')).toBe(true);
    expect(inWindow(toMin('06:00'), '22:00', '06:00')).toBe(false);
    expect(onShift(NURSES, '05:45')!.short).toBe('Carmen');
    expect(onShift(NURSES, '06:00')!.short).toBe('Rosa');
  });
  test('a nurse without a window covers the gaps', () => {
    const solo: Nurse = { id: 's', name: 'Ana', short: 'Ana', start: null, end: null };
    expect(onShift([carmen, solo], '12:00')!.short).toBe('Ana');
    expect(onShift([], '12:00')).toBeNull();
  });
  test('reminder before a dose can cross into the previous shift', () => {
    expect(reminderTime('06:00:00', 'before', 15)).toBe('05:45');
    expect(reminderTime('20:00', 'exact', 0)).toBe('20:00');
    const [row] = reminderRows(['06:00:00'], 'before', 15, NURSES);
    expect(row).toMatchObject({ time: '05:45', dose: '06:00', cross: true });
    expect(row.nurse!.short).toBe('Carmen');
    expect(row.owner!.short).toBe('Rosa');
  });
  test('labels, next nurse, shift start', () => {
    expect(shiftLabel(carmen)).toBe('Turno de noche · 22:00 a 06:00');
    expect(shiftLabel(rosa)).toBe('Turno de día · 06:00 a 22:00');
    expect(nextNurse(NURSES, 'c')!.short).toBe('Rosa');
    expect(shiftStart(carmen, at(16, 2))).toEqual(at(15, 22));
    expect(shiftStart(carmen, at(15, 23, 40))).toEqual(at(15, 22));
  });
});

const sched = (over: Partial<ScheduleRow>): ScheduleRow => ({
  id: 's1', patient_id: 'p', name: 'Metformina', dose: '850 mg', purpose: 'Diabetes · con la comida',
  times: ['08:00:00', '14:00:00', '20:00:00'], reminder_mode: 'before', reminder_minutes: 15, active: true,
  start_date: '2026-10-01', end_date: null, created_at: iso(at(1, 0)), updated_by: null, updated_at: '', ...over,
});
const doseRow = (over: Partial<DoseRow>): DoseRow => ({
  id: 'd', schedule_id: 's1', patient_id: 'p', scheduled_for: iso(at(15, 8)), status: 'given',
  recorded_at: iso(at(15, 8, 20)), recorded_by: 'r', recorded_late: false, skip_reason: null, skip_note: null, ...over,
});

describe('doses', () => {
  const now = at(15, 23, 40);
  test('status: recorded rows win; otherwise pending until +60 min, then unrecorded', () => {
    const los = sched({ id: 's2', name: 'Losartán', dose: '50 mg', times: ['23:30:00'] });
    const doses = dosesForDay([sched({}), los], [doseRow({}), doseRow({ id: 'd2', scheduled_for: iso(at(15, 20)), status: 'skipped', skip_reason: 'refused' })], at(15, 0), now);
    expect(doses.map((d) => `${d.time} ${d.name} ${d.status}`)).toEqual([
      '08:00 Metformina given', '14:00 Metformina unrecorded', '20:00 Metformina skipped', '23:30 Losartán pending',
    ]);
    expect(isDue(doses[3], now)).toBe(true);
    expect(summarize(doses)).toEqual({ given: 1, skipped: 1, unrecorded: 1, pending: 1, total: 4 });
    expect(summaryParts(summarize(doses))).toEqual(['1 no se dio', '1 sin registrar', '1 pendiente']);
  });
  test('boundary: exactly +60 min is unrecorded', () => {
    expect(dosesForDay([sched({ times: ['14:00'] })], [], at(15, 0), at(15, 14, 59))[0].status).toBe('pending');
    expect(dosesForDay([sched({ times: ['14:00'] })], [], at(15, 0), at(15, 15, 0))[0].status).toBe('unrecorded');
  });
  test('date bounds and creation time', () => {
    expect(dosesForDay([sched({ start_date: '2026-10-16' })], [], at(15, 0), now)).toHaveLength(0);
    expect(dosesForDay([sched({ end_date: '2026-10-14' })], [], at(15, 0), now)).toHaveLength(0);
    // created at 15:00 on its first day: the 08:00 and 14:00 slots never existed
    const fresh = sched({ start_date: '2026-10-15', created_at: iso(at(15, 15)) });
    expect(dosesForDay([fresh], [], at(15, 0), now).map((d) => d.time)).toEqual(['20:00']);
  });
  test('recorded doses survive suspension; a reset (pending) row is ignored', () => {
    const suspended = sched({ end_date: '2026-10-14', active: false });
    const doses = dosesForDay([suspended], [doseRow({}), doseRow({ id: 'x', scheduled_for: iso(at(15, 14)), status: 'pending', recorded_at: null })], at(15, 0), now);
    expect(doses.map((d) => d.status)).toEqual(['given']);
    const live = dosesForDay([sched({})], [doseRow({ status: 'pending', recorded_at: null })], at(15, 0), now);
    expect(live[0].status).toBe('unrecorded');
  });
  test('suspension: doses before the instant stay (even unrecorded), later ones disappear', () => {
    const stopped = sched({ active: false, suspended_at: iso(at(15, 16)) });
    expect(dosesForDay([stopped], [], at(15, 0), now).map((d) => `${d.time} ${d.status}`)).toEqual(['08:00 unrecorded', '14:00 unrecorded']);
    expect(dosesForDay([stopped], [], at(16, 0), at(16, 9))).toHaveLength(0);
  });
  test('parseTimes normalises, dedupes, sorts, rejects', () => {
    expect(parseTimes('22:00, 8:00 y 14')).toEqual(['08:00', '14:00', '22:00']);
    expect(parseTimes('8:00 8:00')).toEqual(['08:00']);
    expect(parseTimes('')).toBeNull();
    expect(parseTimes('25:00')).toBeNull();
    expect(parseTimes('8:00, mañana')).toBeNull();
    expect(parseTimes(Array.from({ length: 13 }, (_, i) => `${i}:00`).join(','))).toBeNull();
  });
});

describe('timeline', () => {
  const now = at(15, 23, 40);
  const names = namesFrom([
    { profile_id: 'c', profiles: { full_name: 'Carmen Morales' } },
    { profile_id: 'r', profiles: { full_name: 'Rosa García' } },
  ]);
  const reading = (over: Partial<ReadingRow>): ReadingRow => ({
    id: Math.random().toString(), patient_id: 'p', control_id: 'v2', kind: 'glucose', value: 262, value2: null, context: 'pre_meal',
    severity: 'alert', taken_at: iso(at(15, 19, 45)), taken_by: 'r', note: 'Rosa avisó a la familia y al Dr. Méndez.', family_notified: false, ...over,
  });
  const readings = [reading({}), reading({ kind: 'bp', value: 138, value2: 86, context: null, severity: 'ok', note: null })];
  const events: EventRow[] = [
    { id: 'n1', patient_id: 'p', author_id: 'c', type: 'note', title: 'A vigilar', body: 'Tos seca', severity: 'warning', occurred_at: iso(at(15, 22, 30)) },
    { id: 'old', patient_id: 'p', author_id: 'c', type: 'vitals', title: 'Signos vitales', body: '', severity: 'info', occurred_at: iso(at(15, 7)) },
  ];
  const doses = dosesForDay([sched({})], [doseRow({ scheduled_for: iso(at(15, 20)), status: 'skipped', skip_reason: 'other', skip_note: 'Vomitó la cena' })], at(15, 0), now);

  test('builds one list, newest first, with value chips and reasons', () => {
    const ev = eventsForDay({ day: at(15, 0), now, doses, readings, events, handoffs: [], names, nurses: NURSES });
    expect(ev.map((e) => `${e.time} ${e.kind} ${e.status}`)).toEqual([
      '22:30 note warn', '20:00 med skipped', '19:45 vitals alert', '14:00 med unrecorded', '08:00 med unrecorded',
    ]);
    const vit = ev.find((e) => e.kind === 'vitals')!;
    expect(vit.values.map((v) => `${v.label} ${v.value} ${v.status}`)).toEqual(['Presión 138/86 ok', 'Glucosa 262 mg/dL alert']);
    expect(vit.who).toBe('Rosa García');
    expect(ev.find((e) => e.status === 'skipped')!.reason).toBe('Otro motivo. Vomitó la cena');
    expect(ev.find((e) => e.time === '14:00')!.detail).toBe('Nadie la registró. A las 14:30 se avisó otra vez a Rosa.');
    expect(dayStatus(ev)).toBe('alert');
    expect(daySummary(ev)).toEqual({ meds: '0 de 3 dosis dadas · 1 no se dio · 2 sin registrar', vitals: '1 control de signos · 1 alerta' });
    expect(filterEvents(ev, 'notes').map((e) => e.kind)).toEqual(['note']);
  });
  test('fever: latest temperature above 37.5 until a doctor call', () => {
    const t = (v: number, h: number) => reading({ kind: 'temp', value: v, context: null, taken_at: iso(at(15, h)) });
    expect(feverState([t(38.2, 23)], [], now)).toMatchObject({ temp: 38.2, called: false });
    expect(feverState([t(38.2, 21), t(37.0, 23)], [], now)).toBeNull();
    const call: EventRow = { id: 'x', patient_id: 'p', author_id: 'c', type: 'doctor_call', title: null, body: null, severity: 'info', occurred_at: iso(at(15, 23, 30)) };
    expect(feverState([t(38.2, 23)], [call], now)!.called).toBe(true);
  });
});
