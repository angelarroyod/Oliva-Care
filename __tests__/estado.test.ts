import { hero, knows, latestVitals, todayTiles, trends, weekMeds, weekSummary, EMPTY_TREND } from '@/features/care/estado';
import { dosesForDay } from '@/features/care/doses';
import { feverState } from '@/features/care/timeline';
import { planFromRows } from '@/features/care/vitals';
import type { Nurse } from '@/features/care/shifts';
import type { DoseRow, EventRow, HandoffRow, PatientRow, ReadingRow, ScheduleRow } from '@/features/care/types';

// Thursday 15 October 2026, 23:40 local. Week: lun 12 … dom 18. Trends start lun 21 sep.
const at = (m: number, d: number, h: number, mi = 0) => new Date(2026, m - 1, d, h, mi);
const now = at(10, 15, 23, 40);
const iso = (d: Date) => d.toISOString();

const carmen: Nurse = { id: 'c', name: 'Carmen Morales', short: 'Carmen', start: '22:00', end: '06:00' };
const rosa: Nurse = { id: 'r', name: 'Rosa García', short: 'Rosa', start: '06:00', end: '22:00' };
const nurses = [carmen, rosa];
const patient: PatientRow = { id: 'p1', full_name: 'Elena Rivas', age: 78, room: null, status: 'Estable', allergies: null };
const plan = planFromRows([]);

const sched = (id: string, name: string, times: string[], start: string): ScheduleRow => ({
  id, patient_id: 'p1', name, dose: '', purpose: null, times, reminder_mode: 'exact', reminder_minutes: 0, active: true,
  start_date: start, end_date: null, created_at: iso(at(10, Number(start.slice(8)), 0)), updated_by: null, updated_at: iso(at(10, 1, 0)),
});
const schedules = [sched('met', 'Metformina', ['08:00:00', '14:00:00'], '2026-10-13'), sched('los', 'Losartán', ['23:30:00'], '2026-10-15')];
const dose = (sid: string, d: Date, over: Partial<DoseRow> = {}): DoseRow => ({
  id: `${sid}${d.getTime()}`, schedule_id: sid, patient_id: 'p1', scheduled_for: iso(d), status: 'given',
  recorded_at: iso(d), recorded_by: 'r', recorded_late: false, skip_reason: null, skip_note: null, ...over,
});
const doseRows = [
  dose('met', at(10, 13, 8)),
  dose('met', at(10, 13, 14), { status: 'skipped', skip_reason: 'refused' }),
  dose('met', at(10, 14, 8)),
  dose('met', at(10, 14, 14)),
  dose('met', at(10, 15, 8)),
  // 15 Oct 14:00 Metformina → sin registrar; 23:30 Losartán → pendiente
];

let n = 0;
const rd = (kind: ReadingRow['kind'], value: number, d: Date, over: Partial<ReadingRow> = {}): ReadingRow => ({
  id: `r${n++}`, patient_id: 'p1', control_id: `c${d.getTime()}`, kind, value, value2: null, context: null, severity: 'ok',
  taken_at: iso(d), taken_by: 'r', note: null, family_notified: false, ...over,
});
// Glucose before dinner every day from 21 Sep to 14 Oct, one high (warn) on 7 Oct.
const history: ReadingRow[] = [];
for (let d = new Date(2026, 8, 21); d < at(10, 15, 0); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
  const high = d.getMonth() === 9 && d.getDate() === 7;
  history.push(rd('glucose', high ? 170 : 140, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 19), { context: 'pre_meal', severity: high ? 'warn' : 'ok' }));
}
const today: ReadingRow[] = [
  rd('temp', 36.6, at(10, 15, 8)),
  rd('glucose', 262, at(10, 15, 19, 45), { control_id: 'ctl1', context: 'pre_meal', severity: 'alert', note: 'Rosa avisó al Dr. Méndez.' }),
  rd('bp', 128, at(10, 15, 19, 45), { control_id: 'ctl1', value2: 80 }),
  rd('hr', 72, at(10, 15, 19, 45), { control_id: 'ctl1' }),
];
const readings = [...history, ...today];
const note: EventRow = {
  id: 'n1', patient_id: 'p1', author_id: 'c', type: 'note', title: 'A vigilar', body: 'Tos seca de vez en cuando.', severity: 'warning', occurred_at: iso(at(10, 15, 22, 30)),
};
const todayDoses = dosesForDay(schedules, doseRows, now, now);

test('today tiles count doses and controls', () => {
  const t = todayTiles(todayDoses, today);
  expect(t.med).toMatchObject({ given: 1, total: 3 });
  expect(t.med.lines.map((l) => l.text)).toEqual(['1 sin registrar', '1 pendiente']);
  expect(t.vitals.controls).toBe(2);
  expect(t.vitals.lines.map((l) => l.text)).toEqual(['1 alerta']);
  const calm = todayTiles(todayDoses.filter((d) => d.status === 'given'), [today[0]]);
  expect(calm.med.lines.map((l) => l.text)).toEqual(['Todas dadas']);
  expect(calm.vitals.lines.map((l) => l.text)).toEqual(['Todo normal']);
});

test('"Lo que debes saber" lists today in alert → warn → unrecorded order', () => {
  const k = knows({ fever: null, readings: today, events: [note], doses: todayDoses, plan, short: 'Elena', nurse: carmen, now });
  expect(k.map((x) => [x.tone, x.lead, x.text])).toEqual([
    ['alert', 'Importante:', 'glucosa 262 mg/dL a las 19:45, muy lejos de lo normal para Elena (90 a 150). Rosa avisó al Dr. Méndez.'],
    ['warn', 'Para saber:', 'Tos seca de vez en cuando (anotado a las 22:30).'],
    ['unrec', 'Sin registrar:', 'nadie anotó si se dio Metformina de las 14:00. Puedes preguntárselo a Carmen.'],
  ]);
  const tue = dosesForDay(schedules, doseRows, at(10, 13, 0), now);
  expect(knows({ fever: null, readings: [], events: [], doses: tue, plan, short: 'Elena', nurse: null, now })).toEqual([
    { tone: 'warn', lead: 'Para saber:', text: 'Metformina de las 14:00 no se dio. Motivo: lo rechazó.' },
  ]);
  expect(knows({ fever: null, readings: [], events: [], doses: [], plan, short: 'Elena', nurse: null, now })).toEqual([
    { tone: 'ok', lead: 'Todo en orden:', text: 'hoy no hay nada fuera de lo normal.' },
  ]);
});

test('fever leads the list, hides the fever reading and changes the hero', () => {
  const temp = rd('temp', 38.2, at(10, 15, 23), { severity: 'warn' });
  const call: EventRow = { ...note, id: 'd1', type: 'doctor_call', severity: 'info', occurred_at: iso(at(10, 15, 23, 10)) };
  const r = [...today, temp];
  const before = feverState(r, [], now);
  const k = knows({ fever: before, readings: r, events: [], doses: [], plan, short: 'Elena', nurse: carmen, now });
  expect(k[0]).toEqual({ tone: 'alert', lead: 'Importante:', text: 'tiene fiebre (38,2 °C a las 23:00). Carmen va a avisar al médico.' });
  expect(k.some((x) => x.text.startsWith('temperatura'))).toBe(false);
  const called = feverState(r, [call], now);
  expect(hero({ patient, short: 'Elena', fever: called, nurse: carmen, nurses, handoffs: [], now })).toEqual({
    status: 'Necesita atención · en casa',
    headline: 'Elena tiene fiebre. Ya está recibiendo atención.',
    caregiver: 'Carmen está con Elena y ya avisó al médico.',
  });
});

test('hero caregiver line: shift, handoff done, nobody on shift', () => {
  const base = { patient, short: 'Elena', fever: null, nurse: carmen, nurses, now };
  expect(hero({ ...base, handoffs: [] })).toEqual({
    status: 'Estable · en casa',
    headline: 'Todo tranquilo con Elena.',
    caregiver: 'Carmen, su enfermera de noche, está con Elena desde las 22:00.',
  });
  const h: HandoffRow = { id: 'h', patient_id: 'p1', nurse_id: 'c', summary: null, recommendation: null, started_at: iso(at(10, 15, 22)), ended_at: iso(at(10, 15, 23, 30)) };
  expect(hero({ ...base, handoffs: [h] }).caregiver).toBe('Rosa ya tiene el resumen del turno de Carmen.');
  expect(hero({ ...base, nurse: null, handoffs: [] }).caregiver).toBe('Ahora no hay ninguna enfermera de turno.');
});

test('latest vitals: one tile per kind in order', () => {
  expect(latestVitals(today).map((v) => [v.label, v.value, v.unit, v.sev, v.time])).toEqual([
    ['Presión', '128/80', 'mmHg', 'ok', '19:45'],
    ['Pulso', '72', 'lat/min', 'ok', '19:45'],
    ['Glucosa', '262', 'mg/dL', 'alert', '19:45'],
    ['Temperatura', '36,6', '°C', 'ok', '08:00'],
  ]);
  expect(latestVitals([rd('glucose', 120, at(10, 15, 7), { context: 'fasting' }), rd('pain', 2, at(10, 15, 9))]).map((v) => [v.label, v.unit]))
    .toEqual([['Glucosa en ayunas', 'mg/dL'], ['Dolor', 'de 10']]);
});

test('week medication strip, totals and exceptions', () => {
  const w = weekMeds(schedules, doseRows, now);
  expect(w.days.map((d) => [d.letter, d.n, d.state])).toEqual([
    ['L', 12, 'none'], ['M', 13, 'skipped'], ['X', 14, 'ok'], ['J', 15, 'unrec'], ['V', 16, 'future'], ['S', 17, 'future'], ['D', 18, 'future'],
  ]);
  expect(w.days[1].aria).toBe('martes 13: 1 dosis no se dio. Ver historial');
  expect(w.days[2].aria).toBe('miércoles 14: todas las dosis dadas. Ver historial');
  expect(w.days[3].aria).toBe('jueves 15, hoy: 1 sin registrar. Ver historial');
  expect(w.days[4].aria).toBe('viernes 16: aún no ha llegado');
  expect([w.given, w.total, w.sub]).toEqual([4, 6, '1 no se dio · 1 sin registrar']);
  expect(w.exceptions).toEqual([
    { text: 'Mar 13 · Metformina 14:00', st: 'no se dio: lo rechazó', skipped: true },
    { text: 'Jue 15 · Metformina 14:00', st: 'sin registrar', skipped: false },
  ]);
});

test('trends: 28 daily points, status from this week vs last week, empty under 3 days', () => {
  const [bp, glu, pain, hr] = trends(readings, plan, 'Elena', now);
  expect(glu.title).toBe('Glucosa antes de cenar');
  expect(glu.points).toHaveLength(28);
  expect(glu.points[0]).toBe(140);
  expect(glu.points[16]).toBe(170); // 7 Oct
  expect(glu.points[24]).toBe(262); // today
  expect(glu.points.slice(25)).toEqual([null, null, null]);
  expect(glu.weeks).toEqual(['21 sep', '28 sep', '5 oct', 'Esta semana']);
  expect(glu).toMatchObject({
    status: 'alert',
    word: '1 alerta',
    summary: 'Hoy a las 19:45 llegó a 262. El resto de días, dentro de su rango.',
    compare: 'La semana pasada hubo 1 lectura fuera de su rango.',
    bandLabel: 'Rango de Elena (90 a 150)',
    band: [90, 150],
    alertBand: [70, 250],
    domain: [64, 288],
  });
  expect(bp).toMatchObject({ title: 'Presión (máxima)', status: 'empty', emptyText: EMPTY_TREND });
  expect(pain).toMatchObject({ title: 'Dolor', status: 'empty', bandLabel: 'Aceptable para Elena (0 a 3)', domain: [0, 10] });
  expect(hr.title).toBe('Pulso');

  // A calm week after a week with a high reading reads "Más estable".
  const calm = trends(readings.filter((r) => r.id !== today[1].id), plan, 'el paciente', now)[1];
  expect(calm).toMatchObject({
    status: 'ok', word: 'Más estable', summary: 'Esta semana, todas las lecturas dentro de su rango.',
    compare: 'La semana pasada hubo 1 lectura fuera de su rango. Esta semana, ninguna.', bandLabel: 'Rango del paciente (90 a 150)',
  });
});

test('week summary sentence', () => {
  const ts = trends(readings, plan, 'Elena', now);
  expect(weekSummary(ts, { given: 4, total: 6 }, now)).toBe(
    'La presión se mantuvo en su rango toda la semana. La glucosa tuvo una alerta hoy. El pulso se mantuvo en su rango toda la semana. Medicación: 4 de 6 dosis dadas.',
  );
  expect(weekSummary(trends([], plan, 'Elena', now), { given: 0, total: 0 }, now)).toBe('Aún no hay registros esta semana.');
});

// Pulse every evening 12–14 Oct so the card isn't empty.
const pulseBase = [12, 13, 14].map((d) => rd('hr', 72, at(10, d, 19, 45)));

test('trend status comes from every reading, not just the plotted one', () => {
  // Pulse: 135 at 10:00 (alert) then 72 at 19:45; the day plots 72.
  const hr = trends([...pulseBase, rd('hr', 135, at(10, 15, 10), { severity: 'alert' }), rd('hr', 72, at(10, 15, 19, 45))], plan, 'Elena', now)[3];
  expect(hr.points[24]).toBe(72);
  expect(hr).toMatchObject({ status: 'alert', word: '1 alerta', summary: 'Hoy a las 10:00 llegó a 135. El resto de días, dentro de su rango.' });
  expect(weekSummary([hr], { given: 0, total: 0 }, now)).toBe('El pulso tuvo una alerta hoy.');

  // BP 132/125: systolic in range, diastolic alert (stored severity).
  const bpRows = [12, 13, 14].map((d) => rd('bp', 125, at(10, d, 9), { value2: 80 }));
  const bp = trends([...bpRows, rd('bp', 132, at(10, 15, 9), { value2: 125, severity: 'alert' })], plan, 'Elena', now)[0];
  expect(bp).toMatchObject({ status: 'alert', word: '1 alerta', summary: 'Hoy a las 09:00 llegó a 132/125. El resto de días, dentro de su rango.' });
  expect(weekSummary([bp], { given: 0, total: 0 }, now)).not.toContain('se mantuvo');
});

test('glucose trend plots only before-meal range readings', () => {
  const g = (d: number, h: number, v: number, context: ReadingRow['context'], severity: ReadingRow['severity'] = 'ok') =>
    rd('glucose', v, at(10, d, h), { context, severity });
  const rows = [g(12, 19, 140, 'pre_meal'), g(13, 19, 130, 'pre_meal'), g(13, 22, 175, 'bedtime'), g(14, 7, 120, 'fasting'), g(15, 22, 170, 'bedtime')];
  const glu = trends(rows, plan, 'Elena', now)[1];
  expect(glu.points.slice(21, 25)).toEqual([140, 130, 120, null]); // 15 Oct: only a bedtime reading
  expect(glu).toMatchObject({ status: 'ok', word: 'Estable', summary: 'Esta semana, todas las lecturas dentro de su rango.' });
});

test('trend warn word and summaries, one day and several days', () => {
  const g = (d: number, v: number, severity: ReadingRow['severity'] = 'ok') => rd('glucose', v, at(10, d, 19), { context: 'pre_meal', severity });
  const one = trends([g(5, 140), g(12, 140), g(13, 170, 'warn'), g(14, 140)], plan, 'Elena', now)[1];
  expect(one).toMatchObject({
    status: 'warn', word: '1 día con más glucosa',
    summary: 'El martes a las 19:00 llegó a 170. El resto de días, dentro de su rango.',
    compare: 'La semana pasada, todas las lecturas dentro de su rango.',
  });
  const low = trends([g(12, 80, 'warn'), g(13, 85, 'warn'), g(14, 140)], plan, 'Elena', now)[1];
  expect(low).toMatchObject({
    status: 'warn', word: '2 días con menos glucosa',
    summary: 'El lunes a las 19:00 llegó a 80. En total, 2 días fuera de su rango.',
    compare: 'La semana pasada no hubo lecturas.',
  });
  expect(weekSummary([one, low], { given: 0, total: 0 }, now)).toBe(
    'La glucosa estuvo fuera de su rango una vez. La glucosa estuvo fuera de su rango 2 veces.',
  );
  const two = trends([g(12, 140), g(13, 262, 'alert'), g(14, 40, 'alert')], plan, 'Elena', now)[1];
  expect(two).toMatchObject({ status: 'alert', word: '2 alertas' });
  expect(weekSummary([two], { given: 0, total: 0 }, now)).toBe('La glucosa tuvo 2 alertas esta semana.');
});

test('today with only upcoming doses reads "en curso"', () => {
  const w = weekMeds(schedules, doseRows, at(10, 15, 7));
  expect(w.days[3]).toMatchObject({ state: 'pending', aria: 'jueves 15, hoy: en curso. Ver historial' });
});
