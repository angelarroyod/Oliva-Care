import { dosesSpan, doctorRef, handoffBrief, heroNext, myHandoff, shiftLog } from '@/features/care/nextUp';
import { planFromRows } from '@/features/care/vitals';
import { shiftEnd, shiftStart, type Nurse } from '@/features/care/shifts';
import { feverState, namesFrom } from '@/features/care/timeline';
import type { DoseRow, EventRow, HandoffRow, ReadingRow, ScheduleRow, VitalKind, VitalPlanRow } from '@/features/care/types';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m); // October 2026, local time
const iso = (d: Date) => d.toISOString();
const NOW = at(15, 23, 40);

const carmen: Nurse = { id: 'c', name: 'Carmen Morales', short: 'Carmen', start: '22:00', end: '06:00' };
const rosa: Nurse = { id: 'r', name: 'Rosa García', short: 'Rosa', start: '06:00', end: '22:00' };
const NURSES = [carmen, rosa];
const names = namesFrom([
  { profile_id: 'c', profiles: { full_name: 'Carmen Morales' } },
  { profile_id: 'r', profiles: { full_name: 'Rosa García' } },
]);
const START = shiftStart(carmen, NOW);
const END = shiftEnd(carmen, NOW)!;

const sched = (id: string, name: string, dose: string, times: string[]): ScheduleRow => ({
  id, patient_id: 'p', name, dose, purpose: null, times: times.map((t) => `${t}:00`), reminder_mode: 'before', reminder_minutes: 15,
  active: true, start_date: '2026-10-01', end_date: null, created_at: iso(at(1, 0)), updated_by: null, updated_at: iso(at(1, 0)),
});
const SCHEDULES = [
  sched('lev', 'Levotiroxina', '50 mcg', ['06:00']),
  sched('met', 'Metformina', '850 mg', ['08:00', '14:00', '20:00']),
  sched('los', 'Losartán', '50 mg', ['23:30']),
];
const dose = (schedule_id: string, when: Date, status: DoseRow['status'], extra: Partial<DoseRow> = {}): DoseRow => ({
  id: `${schedule_id}-${when.getHours()}`, schedule_id, patient_id: 'p', scheduled_for: iso(when), status,
  recorded_at: iso(when), recorded_by: 'r', recorded_late: false, skip_reason: null, skip_note: null, ...extra,
});
const GIVEN = [
  dose('lev', at(15, 6), 'given'),
  dose('met', at(15, 8), 'given'),
  dose('met', at(15, 20), 'given'),
]; // 14:00 Metformina never recorded → unrecorded; 23:30 Losartán pending

const reading = (kind: VitalKind, value: number, when: Date, severity: ReadingRow['severity'] = 'ok', control = 'k1'): ReadingRow => ({
  id: `${kind}-${when.getTime()}`, patient_id: 'p', control_id: control, kind, value, value2: kind === 'bp' ? 80 : null,
  context: null, severity, taken_at: iso(when), taken_by: 'c', note: null, family_notified: false,
});
const event = (id: string, when: Date, extra: Partial<EventRow> = {}): EventRow => ({
  id, patient_id: 'p', author_id: 'c', type: 'note', title: 'A vigilar', body: 'Tos seca de vez en cuando, sin fiebre.',
  severity: 'warning', occurred_at: iso(when), ...extra,
});
const handoff = (id: string, nurse: string, when: Date): HandoffRow => ({
  id, patient_id: 'p', nurse_id: nurse, summary: 'Sin novedades.', recommendation: null, started_at: null, ended_at: iso(when),
});
const planRow = (kind: VitalKind): VitalPlanRow => ({
  patient_id: 'p', kind, frequency: 'Cada turno', in_routine: true, ranges: [], alert_low: null, alert_high: null,
  source_conditions: [], updated_by: null, updated_at: iso(at(1, 0)),
});
const PLAN = planFromRows((['bp', 'hr', 'glucose', 'pain'] as VitalKind[]).map(planRow));

const doses = (rows: DoseRow[] = GIVEN) => dosesSpan(SCHEDULES, rows, START, new Date(END.getTime() + 2 * 3_600_000), NOW);

const hero = (over: Partial<Parameters<typeof heroNext>[0]> = {}) =>
  heroNext({
    now: NOW, me: carmen, meId: 'c', myFirst: 'Carmen', next: rosa, start: START, fever: null, doses: doses(),
    readings: [], events: [], handoffs: [], plan: PLAN, doctor: null, ...over,
  });

describe('heroNext priority', () => {
  const temp = [reading('temp', 38.2, NOW, 'warn')];

  test('1. open fever: call the doctor', () => {
    const fever = feverState(temp, [], NOW);
    const h = hero({ fever, doctor: 'Dr. Méndez', events: [event('n1', at(15, 22, 30))] });
    expect(h).toMatchObject({
      kind: 'fever',
      eyebrow: 'AVISA AL MÉDICO',
      title: 'Fiebre de 38,2 °C a las 23:40',
      sub: 'Llama al Dr. Méndez y cuéntale también la nota de las 22:30.',
      cta: 'Llamar al Dr. Méndez',
    });
    expect(hero({ fever }).cta).toBe('Llamar al médico');
  });

  test('2. a called fever gives way to the due dose', () => {
    const fever = feverState(temp, [event('call', NOW, { type: 'doctor_call' })], NOW);
    expect(fever?.called).toBe(true);
    expect(hero({ fever })).toMatchObject({
      kind: 'dose',
      title: 'Dar Losartán 50 mg',
      sub: 'Tocaba a las 23:30, hace 10 min. Si no se puede dar, anota por qué.',
      cta: 'Ir a medicación',
    });
  });

  const losartanGiven = [...GIVEN, dose('los', at(15, 23, 30), 'given', { recorded_by: 'c' })];

  test('3. no control since the shift started', () => {
    // a control from the day shift does not count for the night
    const h = hero({ doses: doses(losartanGiven), readings: [reading('hr', 72, at(15, 19, 45))] });
    expect(h).toMatchObject({
      kind: 'vitals',
      title: 'Control de la noche: 4 signos',
      sub: 'Presión, pulso, glucosa y dolor, según su plan.',
      cta: 'Registrar signos',
    });
  });

  test('4. handoff still to do', () => {
    const h = hero({ doses: doses(losartanGiven), readings: [reading('hr', 72, at(15, 23, 0))] });
    expect(h).toMatchObject({ kind: 'handoff', title: 'Entregar el turno a Rosa a las 06:00', cta: 'Preparar relevo' });
    expect(hero({ doses: doses(losartanGiven), readings: [reading('hr', 72, at(15, 23, 0))], next: null, me: null }).title).toBe('Entregar el turno');
  });

  test('5. all done', () => {
    const h = hero({
      doses: doses(losartanGiven),
      readings: [reading('hr', 72, at(15, 23, 0))],
      handoffs: [handoff('old', 'c', at(15, 6)), handoff('h1', 'c', at(15, 23, 39))],
    });
    expect(h).toMatchObject({ kind: 'done', title: 'Todo al día', sub: 'Turno entregado. Buen descanso, Carmen.', cta: 'Ver relevo' });
  });

  test('a handoff from the previous shift does not count', () => {
    expect(myHandoff([handoff('old', 'c', at(15, 6))], 'c', START)).toBeNull();
    expect(myHandoff([handoff('r1', 'r', at(15, 23))], 'c', START)).toBeNull();
  });
});

test('doctorRef uses the right article', () => {
  expect(doctorRef(null)).toBe('al médico');
  expect(doctorRef('Dra. Ruiz')).toBe('a la Dra. Ruiz');
  expect(doctorRef('Javier Méndez')).toBe('a Javier Méndez');
});

describe('handoffBrief', () => {
  const skipped = dose('los', at(15, 23, 30), 'skipped', { recorded_by: 'c', skip_reason: 'asleep' });
  const base = { now: NOW, start: START, end: END, readings: [] as ReadingRow[], events: [event('n1', at(15, 22, 30))] };

  test('quiet shift: summary, watch and the list for the next nurse', () => {
    const b = handoffBrief({ ...base, fever: null, doses: doses([...GIVEN, skipped]) });
    expect(b.summary).toBe('Turno tranquilo por ahora. Hay 1 cosa a vigilar.');
    expect(b.watch.map((w) => w.text)).toEqual(['A las 22:30: Tos seca de vez en cuando, sin fiebre.']);
    expect(b.watchLine).toBe('1 cosa a vigilar: nota de las 22:30');
    expect(b.para).toEqual([
      'Losartán de las 23:30: no se dio (paciente dormido).',
      'Metformina de las 14:00: sigue sin registrar. Confirmar si se dio.',
      'Dar Levotiroxina 50 mcg a las 06:00.',
      'Avisar al médico si aparece fiebre (más de 37,5 °C).',
    ]);
    expect(b.record).toBe('Turno tranquilo por ahora. Hay 1 cosa a vigilar. A las 22:30: Tos seca de vez en cuando, sin fiebre.');
  });

  test('fever, a due dose and an out-of-range value', () => {
    const readings = [reading('temp', 38.2, NOW, 'warn'), reading('glucose', 262, at(15, 23, 0), 'alert', 'k2'), reading('glucose', 300, at(15, 19, 45), 'alert', 'k3')];
    const b = handoffBrief({ ...base, readings, fever: feverState(readings, [], NOW), doses: doses() });
    expect(b.summary).toBe('Turno con fiebre. Hay 3 cosas a vigilar.');
    expect(b.watch.map((w) => w.short)).toEqual(['fiebre', 'nota de las 22:30', 'glucosa de las 23:00']);
    expect(b.watch[2].text).toBe('Glucosa 262 mg/dL a las 23:00: muy fuera de lo normal.');
    expect(b.para[0]).toBe('Avisar al médico por la fiebre de 38,2 °C.');
    expect(b.para[1]).toBe('Losartán 50 mg de las 23:30: aún sin dar.');
    expect(b.para.at(-1)).toBe('Tomar la temperatura cada 2 horas.');
  });

  test('nothing to watch', () => {
    const b = handoffBrief({ ...base, events: [], fever: null, doses: doses() });
    expect(b.summary).toBe('Turno tranquilo por ahora. Nada a vigilar.');
    expect(b.watchLine).toBe('Nada a vigilar');
  });
});

test('shiftLog: since my shift started, oldest first, without my own handoff', () => {
  const log = shiftLog({
    now: NOW, start: START, meId: 'c', names, nurses: NURSES,
    doses: doses([...GIVEN, dose('los', at(15, 23, 30), 'skipped', { recorded_by: 'c', skip_reason: 'asleep' })]),
    readings: [reading('hr', 74, at(15, 19, 45)), reading('bp', 132, at(15, 23, 0), 'ok', 'k2'), reading('hr', 72, at(15, 23, 0), 'ok', 'k2')],
    events: [event('n1', at(15, 22, 30)), event('n0', at(15, 16, 10), { severity: 'info' })],
    handoffs: [handoff('rosa', 'r', at(15, 22)), handoff('mine', 'c', at(15, 23, 39))],
  });
  expect(log.map((e) => `${e.time} ${e.title}`)).toEqual([
    '22:00 Rosa entregó el turno a Carmen',
    '22:30 A vigilar',
    '23:00 Signos vitales',
    '23:30 Losartán 50 mg',
  ]);
  expect(log[2].body).toBe('Presión 132/80, Pulso 72.');
  expect(log[3]).toMatchObject({ body: 'No se dio: paciente dormido.', warn: true });
  expect(log[1].warn).toBe(true);
  expect(log[0].warn).toBe(false);
});

test('shiftLog spans midnight for a night shift', () => {
  const now = at(16, 1, 0);
  const start = shiftStart(carmen, now);
  const log = shiftLog({
    now, start, meId: 'c', names, nurses: NURSES, doses: [], handoffs: [],
    readings: [reading('hr', 72, at(15, 23, 0)), reading('hr', 70, at(16, 0, 30), 'ok', 'k2')],
    events: [],
  });
  expect(log.map((e) => e.time)).toEqual(['23:00', '00:30']);
});

describe('handoffBrief at and after the shift end', () => {
  // 16 Oct 06:05: Carmen hands over after her 06:00 end; nothing recorded overnight.
  const now = at(16, 6, 5);
  const start = shiftStart(carmen, now);
  const end = shiftEnd(carmen, now)!;
  const rows = [...GIVEN, dose('los', at(15, 23, 30), 'given', { recorded_by: 'c' })];
  const span = dosesSpan(SCHEDULES, rows, start, new Date(end.getTime() + 2 * 3_600_000), now);
  const brief = (over: Partial<Parameters<typeof handoffBrief>[0]> = {}) =>
    handoffBrief({ now, start, end, fever: null, doses: span, readings: [], events: [], ...over });

  test('each dose is listed once, and yesterday is named', () => {
    // 06:00 is due (not also "Dar … a las 06:00"); 08:00 falls outside [06:00, 08:00).
    expect(brief().para).toEqual([
      'Levotiroxina 50 mcg de las 06:00: aún sin dar.',
      'Metformina de las 14:00 de ayer: sigue sin registrar. Confirmar si se dio.',
      'Avisar al médico si aparece fiebre (más de 37,5 °C).',
    ]);
  });

  test('no fixed shift: upcoming starts after now, without repeating a due dose', () => {
    const p = brief({ end: null, start: shiftStart(null, now), doses: dosesSpan(SCHEDULES, rows, shiftStart(null, now), new Date(now.getTime() + 2 * 3_600_000), now) }).para;
    expect(p.filter((l) => l.includes('Levotiroxina'))).toEqual(['Levotiroxina 50 mcg de las 06:00: aún sin dar.']);
    expect(p).toContain('Dar Metformina 850 mg a las 08:00.');
  });
});

test('shiftLog: warn items carry a word, not only the dot colour', () => {
  const log = shiftLog({
    now: NOW, start: START, meId: 'c', names, nurses: NURSES, doses: [], handoffs: [],
    readings: [reading('glucose', 262, at(15, 23, 0), 'alert', 'k2'), reading('hr', 110, at(15, 23, 20), 'warn', 'k3')],
    events: [event('n2', at(15, 22, 45), { title: 'Tos', body: 'Más seca que ayer.' }), event('n1', at(15, 22, 30))],
  });
  expect(log.map((e) => e.body)).toEqual([
    'Tos seca de vez en cuando, sin fiebre.',
    'A vigilar. Más seca que ayer.',
    'Glucosa 262 mg/dL. Muy fuera de lo normal.',
    'Pulso 110. Fuera de lo normal.',
  ]);
  expect(log.every((e) => e.warn)).toBe(true);
});
