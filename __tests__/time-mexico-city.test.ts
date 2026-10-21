/**
 * @jest-environment ./jest/timezone-environment.js
 * @jest-environment-options {"timezone": "America/Mexico_City"}
 */
// Edge cases of the pure care modules in the primary zone, America/Mexico_City
// (UTC−06:00 all year): midnight, week / month / year boundaries, overnight
// shifts and dose expansion. DST transitions live in time-dst-madrid.test.ts.
import {
  addDays, atTime, firstName, fromMin, greeting, hhmm, listY, localDate, longDate, num, relativeDay, sameDay, startOfDay,
  startOfWeek, toMin, weekRange,
} from '@/features/care/clock';
import {
  inWindow, nextNurse, nursesFrom, onShift, reminderRows, shiftEnd, shiftKind, shiftLabel, shiftStart, type Nurse,
} from '@/features/care/shifts';
import { dosesByDay, dosesForDay, isDue, parseTimes, summaryParts } from '@/features/care/doses';
import { dosesSpan, handoffBrief, heroNext, myHandoff, shiftLog } from '@/features/care/nextUp';
import { hero, knows, trends, weekMeds, weekSummary } from '@/features/care/estado';
import { feverState, namesFrom } from '@/features/care/timeline';
import { planFromRows } from '@/features/care/vitals';
import type { DoseRow, EventRow, HandoffRow, MemberRow, PatientRow, ReadingRow, ScheduleRow } from '@/features/care/types';

// Local wall-clock instant in 2026 (month is 1-based here).
const at = (mo: number, d: number, h = 0, mi = 0, y = 2026) => new Date(y, mo - 1, d, h, mi);
const iso = (d: Date) => d.toISOString();

const carmen: Nurse = { id: 'c', name: 'Carmen Morales', short: 'Carmen', start: '22:00', end: '06:00' };
const rosa: Nurse = { id: 'r', name: 'Rosa García', short: 'Rosa', start: '06:00', end: '22:00' };
const NURSES = [carmen, rosa];
const plan = planFromRows([]);

const sched = (over: Partial<ScheduleRow> = {}): ScheduleRow => ({
  id: 's1', patient_id: 'p', name: 'Metformina', dose: '850 mg', purpose: null, times: ['08:00:00'],
  reminder_mode: 'exact', reminder_minutes: 0, active: true, start_date: '2026-01-01', end_date: null,
  created_at: iso(at(1, 1)), updated_by: null, updated_at: iso(at(1, 1)), ...over,
});
const doseRow = (when: Date | string, over: Partial<DoseRow> = {}): DoseRow => ({
  id: `d-${String(when)}`, schedule_id: 's1', patient_id: 'p', scheduled_for: typeof when === 'string' ? when : iso(when),
  status: 'given', recorded_at: null, recorded_by: 'r', recorded_late: false, skip_reason: null, skip_note: null, ...over,
});
let seq = 0;
const reading = (kind: ReadingRow['kind'], value: number, when: Date, severity: ReadingRow['severity'] = 'ok'): ReadingRow => ({
  id: `rd${seq++}`, patient_id: 'p', control_id: `k${when.getTime()}`, kind, value, value2: kind === 'bp' ? 80 : null,
  context: null, severity, taken_at: iso(when), taken_by: 'r', note: null, family_notified: false,
});
const note = (id: string, when: Date): EventRow => ({
  id, patient_id: 'p', author_id: 'c', type: 'note', title: 'A vigilar', body: 'Tos seca.', severity: 'warning', occurred_at: iso(when),
});

describe('the zone itself', () => {
  test('America/Mexico_City is UTC−06:00 all year and has no DST gap', () => {
    expect(at(1, 15, 12).getTimezoneOffset()).toBe(360);
    expect(at(7, 15, 12).getTimezoneOffset()).toBe(360);
    // First Sunday of April used to be the spring-forward day; 02:30 exists now.
    expect(hhmm(at(4, 5, 2, 30))).toBe('02:30');
    expect(iso(at(10, 15, 8))).toBe('2026-10-15T14:00:00.000Z');
  });
});

describe('clock: midnight', () => {
  test('after 18:00 the UTC date is already tomorrow, but the local day is still today', () => {
    const evening = at(10, 15, 19);
    expect(iso(evening).slice(0, 10)).toBe('2026-10-16');
    expect(localDate(evening)).toBe('2026-10-15');
    expect(sameDay(evening, at(10, 15, 0))).toBe(true);
  });
  test('23:59 and 00:00 are different days; 00:00 starts its own day', () => {
    expect(sameDay(at(10, 15, 23, 59), at(10, 16, 0, 0))).toBe(false);
    expect(startOfDay(at(10, 15, 23, 59))).toEqual(at(10, 15));
    expect(startOfDay(at(10, 16, 0, 0))).toEqual(at(10, 16));
    expect(atTime(at(10, 15, 13), '00:00:00')).toEqual(at(10, 15, 0, 0));
    expect(atTime(at(10, 15, 13), '23:59')).toEqual(at(10, 15, 23, 59));
  });
  test('relativeDay switches exactly at local midnight', () => {
    expect(relativeDay(at(10, 15, 0, 0), at(10, 15, 23, 59))).toBe('hoy');
    expect(relativeDay(at(10, 14, 23, 59), at(10, 16, 0, 0))).toBe('el miércoles');
    expect(relativeDay(at(10, 14, 23, 59), at(10, 15, 0, 0))).toBe('ayer');
    expect(relativeDay(at(10, 9, 12), at(10, 15, 0, 1))).toBe('el viernes'); // 6 days back
    expect(relativeDay(at(10, 8, 12), at(10, 15, 0, 1))).toBe('el 8 de octubre'); // 7 days back
  });
  test('greeting boundaries at 06:00, 13:00 and 21:00', () => {
    expect([0, 5, 6, 12, 13, 20, 21, 23].map((h) => greeting(at(10, 15, h, h === 5 || h === 12 || h === 20 ? 59 : 0)))).toEqual([
      'Buenas noches', 'Buenas noches', 'Buenos días', 'Buenos días', 'Buenas tardes', 'Buenas tardes', 'Buenas noches', 'Buenas noches',
    ]);
  });
  test('minute math wraps at midnight in both directions', () => {
    expect(toMin('00:00')).toBe(0);
    expect(toMin('23:59:59')).toBe(1439);
    expect(fromMin(1439)).toBe('23:59');
    expect(fromMin(1440)).toBe('00:00');
    expect(fromMin(-1)).toBe('23:59');
  });
});

describe('clock: week, month and year boundaries', () => {
  test('weeks start on Monday 00:00; Sunday 23:59 still belongs to the week before', () => {
    expect(startOfWeek(at(10, 12, 0, 0))).toEqual(at(10, 12)); // Monday
    expect(startOfWeek(at(10, 18, 23, 59))).toEqual(at(10, 12)); // Sunday
    expect(startOfWeek(at(10, 19, 0, 0))).toEqual(at(10, 19)); // next Monday
  });
  test('a week that crosses a month or a year', () => {
    expect(weekRange(startOfWeek(at(10, 28)))).toBe('del 26 de octubre al 1 de noviembre');
    const jan1 = at(1, 1, 9, 0, 2027); // Friday
    expect(startOfWeek(jan1)).toEqual(at(12, 28));
    expect(weekRange(startOfWeek(jan1))).toBe('del 28 de diciembre al 3 de enero');
    expect(addDays(at(12, 31, 15, 30), 1)).toEqual(at(1, 1, 0, 0, 2027));
    expect(longDate(at(10, 18))).toBe('domingo 18 de octubre');
  });
});

describe('clock: text and number helpers', () => {
  test('num trims, takes one decimal comma, rejects everything else', () => {
    expect(num('  37,5 ')).toBe(37.5);
    expect(num('-1')).toBe(-1);
    expect(num(0)).toBe(0);
    expect(num('0')).toBe(0);
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
    for (const bad of ['1e3', '37,5,1', '.5', '5.', '37 5', 'NaN']) expect(num(bad)).toBeNull();
  });
  test('listY and firstName', () => {
    expect(listY([])).toBe('');
    expect(listY(['a'])).toBe('a');
    expect(listY(['a', 'b'])).toBe('a y b');
    expect(firstName('  Rosa   María ')).toBe('Rosa');
    expect(firstName('')).toBe('');
  });
});

describe('shifts: overnight windows', () => {
  test('nursesFrom keeps nurses only, trims names and drops the seconds', () => {
    const m = (profile_id: string, role: MemberRow['role'], full_name: string | null, s: string | null, e: string | null): MemberRow => ({
      id: profile_id, patient_id: 'p', profile_id, role, relationship: null, shift: null, shift_start: s, shift_end: e,
      profiles: full_name == null ? null : { full_name },
    });
    expect(nursesFrom([
      m('c', 'nurse', '  Carmen Morales ', '22:00:00', '06:00:00'),
      m('f', 'family', 'Lucía Rivas', null, null),
      m('x', 'nurse', '   ', null, null),
      m('y', 'nurse', null, '06:00:00', null),
    ])).toEqual([
      { id: 'c', name: 'Carmen Morales', short: 'Carmen', start: '22:00', end: '06:00' },
      { id: 'x', name: 'Enfermera', short: 'Enfermera', start: null, end: null },
      { id: 'y', name: 'Enfermera', short: 'Enfermera', start: '06:00', end: null },
    ]);
  });
  test('a 22:00–06:00 window covers 22:00…05:59 on both sides of midnight', () => {
    const inNight = (t: string) => inWindow(toMin(t), '22:00', '06:00');
    expect(['21:59', '22:00', '23:59', '00:00', '05:59', '06:00'].map(inNight)).toEqual([false, true, true, true, true, false]);
    const inDay = (t: string) => inWindow(toMin(t), '06:00', '22:00');
    expect(['05:59', '06:00', '21:59', '22:00'].map(inDay)).toEqual([false, true, true, false]);
    expect(inWindow(toMin('03:00'), '08:00', '08:00')).toBe(true); // same start and end = 24 h
  });
  test('who is on shift at the handover minutes', () => {
    expect(onShift(NURSES, '21:59')!.id).toBe('r');
    expect(onShift(NURSES, '22:00')!.id).toBe('c');
    expect(onShift(NURSES, '00:00')!.id).toBe('c');
    expect(onShift(NURSES, '06:00')!.id).toBe('r');
  });
  test('shift kind: crossing midnight or starting from 20:00 is night; from 13:00 afternoon', () => {
    const n = (start: string | null, end: string | null): Nurse => ({ id: 'n', name: 'N', short: 'N', start, end });
    expect(shiftKind(n('22:00', '06:00'))).toBe('noche');
    expect(shiftKind(n('19:00', '07:00'))).toBe('noche');
    expect(shiftKind(n('20:00', '23:00'))).toBe('noche');
    expect(shiftKind(n('13:00', '21:00'))).toBe('tarde');
    expect(shiftKind(n('06:00', '14:00'))).toBe('día');
    expect(shiftKind(n(null, null))).toBeNull();
    expect(shiftLabel(n('06:00', null))).toBe('Sin turno fijo');
  });
  test('a window that ends exactly at 00:00 does not cross midnight: 16:00–00:00 is an afternoon shift', () => {
    // Documented rule (shifts.ts): 'noche' when the window crosses midnight or starts from 20:00; 'tarde' from 13:00.
    const late: Nurse = { id: 'l', name: 'Lola', short: 'Lola', start: '16:00', end: '00:00' };
    expect(shiftKind(late)).toBe('tarde');
    expect(shiftLabel(late)).toBe('Turno de tarde · 16:00 a 00:00');
  });
  test('shiftStart is the most recent start: yesterday 22:00 after midnight, today 22:00 from 22:00 on', () => {
    expect(shiftStart(carmen, at(10, 15, 21, 59))).toEqual(at(10, 14, 22));
    expect(shiftStart(carmen, at(10, 15, 22, 0))).toEqual(at(10, 15, 22));
    expect(shiftStart(carmen, at(10, 16, 0, 0))).toEqual(at(10, 15, 22));
    expect(shiftStart(carmen, at(10, 16, 5, 59))).toEqual(at(10, 15, 22));
    expect(shiftStart(null, at(10, 16, 5, 59))).toEqual(at(10, 16));
  });
  test('shiftEnd of an overnight shift is 06:00 the next morning, also across a month and a year', () => {
    expect(shiftEnd(carmen, at(10, 15, 23))).toEqual(at(10, 16, 6));
    expect(shiftEnd(carmen, at(10, 16, 3))).toEqual(at(10, 16, 6));
    expect(shiftEnd(carmen, at(11, 1, 2))).toEqual(at(11, 1, 6));
    expect(shiftStart(carmen, at(11, 1, 2))).toEqual(at(10, 31, 22));
    expect(shiftStart(carmen, at(1, 1, 3, 0, 2027))).toEqual(at(12, 31, 22));
    expect(shiftEnd(carmen, at(1, 1, 3, 0, 2027))).toEqual(at(1, 1, 6, 0, 2027));
    expect(shiftEnd(rosa, at(10, 15, 12))).toEqual(at(10, 15, 22));
    expect(shiftEnd({ ...rosa, start: '08:00', end: '08:00' }, at(10, 15, 9))).toEqual(at(10, 16, 8));
    expect(shiftEnd(null, at(10, 15, 9))).toBeNull();
  });
  test('next nurse: the one starting when mine ends, else anyone else, else nobody', () => {
    const ana: Nurse = { id: 'a', name: 'Ana', short: 'Ana', start: '14:00', end: '22:00' };
    expect(nextNurse([ana, rosa, carmen], 'c')!.id).toBe('r');
    expect(nextNurse([ana, carmen], 'c')!.id).toBe('a');
    expect(nextNurse([{ ...carmen, end: null }, ana], 'c')!.id).toBe('a');
    expect(nextNurse([carmen], 'c')).toBeNull();
  });
  test('reminders before a dose wrap past midnight and can land in the other shift', () => {
    const rows = reminderRows(['00:10:00', '22:10:00', '01:00:00'], 'before', 30, NURSES);
    expect(rows.map((r) => `${r.time}→${r.dose} ${r.nurse!.id}/${r.owner!.id} ${r.cross}`)).toEqual([
      '23:40→00:10 c/c false', '21:40→22:10 r/c true', '00:30→01:00 c/c false',
    ]);
    expect(reminderRows(['01:00'], 'before', 120, NURSES)[0].time).toBe('23:00');
  });
});

describe('doses: expansion', () => {
  test('start_date and end_date are both inclusive local days', () => {
    const s = sched({ start_date: '2026-10-15', end_date: '2026-10-15' });
    expect([14, 15, 16].map((d) => dosesForDay([s], [], at(10, d), at(10, 20)).length)).toEqual([0, 1, 0]);
  });
  test('first day: a slot in the minute the medication was added counts; earlier slots never existed', () => {
    const made = (h: number, m: number, s = 0) => sched({ start_date: '2026-10-15', created_at: iso(new Date(2026, 9, 15, h, m, s)) });
    expect(dosesForDay([made(8, 0, 30)], [], at(10, 15), at(10, 15, 9))).toHaveLength(1);
    expect(dosesForDay([made(8, 5)], [], at(10, 15), at(10, 15, 9))).toHaveLength(0);
    // Created on an earlier day: nothing on later days is hidden.
    expect(dosesForDay([made(23, 0)], [], at(10, 16), at(10, 16, 9))).toHaveLength(1);
  });
  test('suspension at the exact dose minute removes that dose; a minute later keeps it', () => {
    const s = (iso8601: string) => sched({ suspended_at: iso8601 });
    expect(dosesForDay([s(iso(at(10, 15, 8)))], [], at(10, 15), at(10, 15, 9))).toHaveLength(0);
    expect(dosesForDay([s(iso(at(10, 15, 8, 1)))], [], at(10, 15), at(10, 15, 9))).toHaveLength(1);
  });
  test('a 00:00 dose belongs to its own day, not the evening before', () => {
    const s = sched({ times: ['00:00:00', '23:59:00'] });
    expect(dosesForDay([s], [], at(10, 16), at(10, 16, 12)).map((d) => d.at)).toEqual([at(10, 16, 0), at(10, 16, 23, 59)]);
    expect(dosesForDay([s], [], at(10, 15), at(10, 16, 12)).map((d) => d.time)).toEqual(['00:00', '23:59']);
  });
  test('a 23:30 dose turns "sin registrar" at 00:30, after midnight', () => {
    const s = sched({ times: ['23:30:00'] });
    expect(dosesForDay([s], [], at(10, 15), at(10, 16, 0, 29))[0].status).toBe('pending');
    expect(dosesForDay([s], [], at(10, 15), at(10, 16, 0, 30))[0].status).toBe('unrecorded');
  });
  test('chronological, then by name; duplicate times collapse into one dose', () => {
    const met = sched({ times: ['20:00:00', '08:00:00', '08:00'] });
    const asp = sched({ id: 's2', name: 'Aspirina', times: ['08:00:00'] });
    expect(dosesForDay([met, asp], [], at(10, 15), at(10, 15, 7)).map((d) => `${d.time} ${d.name}`)).toEqual([
      '08:00 Aspirina', '08:00 Metformina', '20:00 Metformina',
    ]);
  });
  test('a recorded row matches its slot whatever the timestamp format', () => {
    // 08:00 in Mexico City is 14:00 UTC; PostgREST sends "+00:00", not "Z".
    const doses = dosesForDay([sched()], [doseRow('2026-10-15T14:00:00+00:00')], at(10, 15), at(10, 15, 9));
    expect(doses.map((d) => `${d.time} ${d.status}`)).toEqual(['08:00 given']);
  });
  test('recorded rows: kept when the time was removed, ignored for other days or unknown schedules', () => {
    const now = at(10, 15, 23);
    const rows = [
      doseRow(at(10, 15, 12), { status: 'skipped', skip_reason: 'refused' }), // 12:00 no longer scheduled
      doseRow(at(10, 14, 8)), // yesterday
      doseRow(at(10, 15, 9), { schedule_id: 'gone' }),
      doseRow(at(10, 15, 13), { status: 'unrecorded' }), // a stored "unrecorded" outside the plan adds nothing
    ];
    expect(dosesForDay([sched()], rows, at(10, 15), now).map((d) => `${d.time} ${d.status}`)).toEqual(['08:00 unrecorded', '12:00 skipped']);
  });
  test('a stored "unrecorded" row is honoured even inside the first hour', () => {
    const [d] = dosesForDay([sched()], [doseRow(at(10, 15, 8), { status: 'unrecorded' })], at(10, 15), at(10, 15, 8, 10));
    expect(d.status).toBe('unrecorded');
  });
  test('seven days across the year end are seven local midnights', () => {
    const days = dosesByDay([sched()], [], at(12, 28, 15), 7, at(1, 10, 0, 0, 2027));
    expect(days.map((d) => localDate(d.day))).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ]);
    expect(days.every((d) => d.day.getHours() === 0 && d.doses.length === 1 && d.doses[0].time === '08:00')).toBe(true);
  });
  test('isDue: from the dose minute while pending; never once recorded or unrecorded', () => {
    const [d] = dosesForDay([sched()], [], at(10, 15), at(10, 15, 8));
    expect(isDue(d, at(10, 15, 7, 59))).toBe(false);
    expect(isDue(d, at(10, 15, 8))).toBe(true);
    const [late] = dosesForDay([sched()], [], at(10, 15), at(10, 15, 9));
    expect(isDue(late, at(10, 15, 9))).toBe(false);
  });
  test('parseTimes edge cases', () => {
    expect(parseTimes('0')).toEqual(['00:00']);
    expect(parseTimes('23:59')).toEqual(['23:59']);
    expect(parseTimes(' 8:00 ')).toEqual(['08:00']);
    expect(parseTimes('8,14;20')).toEqual(['08:00', '14:00', '20:00']);
    expect(parseTimes('7:5')).toBeNull();
    expect(parseTimes('24')).toBeNull();
    expect(parseTimes('y')).toBeNull();
    expect(parseTimes(Array.from({ length: 12 }, (_, i) => `${i * 2}`).join(' '))).toHaveLength(12);
  });
  test('summary parts use plurals and skip zeros', () => {
    expect(summaryParts({ skipped: 2, unrecorded: 1, pending: 3 })).toEqual(['2 no se dieron', '1 sin registrar', '3 pendientes']);
    expect(summaryParts({ skipped: 0, unrecorded: 0, pending: 0 })).toEqual([]);
  });
});

describe('nextUp across midnight', () => {
  const SCH = [sched({ id: 'lev', name: 'Levotiroxina', dose: '50 mcg', times: ['06:00:00'] }), sched({ id: 'los', name: 'Losartán', dose: '50 mg', times: ['23:30:00'] })];
  test('a night shift spans two local days of doses; one day when it does not cross midnight', () => {
    const span = dosesSpan(SCH, [], at(10, 15, 22), at(10, 16, 8), at(10, 16, 1));
    expect(span.map((d) => `${localDate(d.at)} ${d.time}`)).toEqual([
      '2026-10-15 06:00', '2026-10-15 23:30', '2026-10-16 06:00', '2026-10-16 23:30',
    ]);
    expect(dosesSpan(SCH, [], at(10, 15, 6), at(10, 15, 22), at(10, 15, 7))).toHaveLength(2);
    expect(dosesSpan(SCH, [], at(12, 31, 22), at(1, 1, 8, 0, 2027), at(1, 1, 1, 0, 2027)).map((d) => localDate(d.at))).toEqual([
      '2026-12-31', '2026-12-31', '2027-01-01', '2027-01-01',
    ]);
  });
  test('myHandoff: my own, after the shift started, by end time or else start time', () => {
    const h = (id: string, nurse: string, started: Date | null, ended: Date | null): HandoffRow => ({
      id, patient_id: 'p', nurse_id: nurse, summary: null, recommendation: null,
      started_at: started && iso(started), ended_at: ended && iso(ended),
    });
    const start = at(10, 15, 22);
    expect(myHandoff([h('a', 'c', at(10, 14, 22), at(10, 15, 6))], 'c', start)).toBeNull();
    expect(myHandoff([h('b', 'r', null, at(10, 16, 5))], 'c', start)).toBeNull();
    expect(myHandoff([h('c', 'c', at(10, 15, 22), null)], 'c', start)!.id).toBe('c');
    expect(myHandoff([h('d', 'c', null, at(10, 15, 22))], 'c', start)!.id).toBe('d');
  });
  test('hero: the earliest due dose wins, counted in minutes across midnight', () => {
    const now = at(10, 16, 0, 20);
    const sch = [sched({ id: 'a', name: 'Aspirina', dose: '100 mg', times: ['00:00:00'] }), sched({ id: 'b', name: 'Bisoprolol', dose: '5 mg', times: ['23:40:00'] })];
    const h = heroNext({
      now, me: carmen, meId: 'c', myFirst: 'Carmen', next: rosa, start: shiftStart(carmen, now), fever: null,
      doses: dosesSpan(sch, [], shiftStart(carmen, now), at(10, 16, 8), now), readings: [], events: [], handoffs: [], plan, doctor: null,
    });
    expect(h).toMatchObject({ kind: 'dose', title: 'Dar Bisoprolol 5 mg', sub: 'Tocaba a las 23:40, hace 40 min. Si no se puede dar, anota por qué.' });
  });
  test('hero: a control taken just before the shift started does not count', () => {
    const now = at(10, 16, 1);
    const base = {
      now, me: carmen, meId: 'c', myFirst: 'Carmen', next: null, start: shiftStart(carmen, now), fever: null, doses: [], events: [],
      handoffs: [], plan, doctor: null,
    };
    expect(heroNext({ ...base, readings: [reading('hr', 72, at(10, 15, 21, 59))] }).title).toMatch(/^Control de la noche: /);
    expect(heroNext({ ...base, readings: [reading('hr', 72, at(10, 15, 22))] }).title).toBe('Entregar el turno a las 06:00');
  });
  test('handoff brief after midnight: names yesterday and "el martes", skips doses skipped before my shift', () => {
    const now = at(10, 15, 5); // Thursday 05:00, Carmen started Wednesday 22:00
    const start = shiftStart(carmen, now);
    const rows = [
      doseRow(at(10, 14, 23, 30), { schedule_id: 'los', status: 'skipped', skip_reason: 'refused' }),
      doseRow(at(10, 14, 6), { schedule_id: 'lev', status: 'skipped', skip_reason: 'asleep' }), // Rosa's shift
    ];
    const tuesday = dosesForDay([sched({ id: 'met', times: ['14:00:00'] })], [], at(10, 13), now); // unrecorded
    const doses = [...tuesday, ...dosesSpan(SCH, rows, start, at(10, 15, 8), now)];
    const { para } = handoffBrief({ now, start, end: shiftEnd(carmen, now), fever: null, doses, readings: [], events: [] });
    expect(para).toEqual([
      'Losartán de las 23:30 de ayer: no se dio (lo rechazó).',
      'Metformina de las 14:00 del martes: sigue sin registrar. Confirmar si se dio.',
      'Dar Levotiroxina 50 mcg a las 06:00.',
      'Avisar al médico si aparece fiebre (más de 37,5 °C).',
    ]);
  });
  test('handoff brief: "Para" covers [end, end + 2 h) — the end minute in, two hours later out', () => {
    const now = at(10, 16, 5);
    const sch = [sched({ id: 'x', name: 'X', dose: '1', times: ['06:00:00', '07:59:00', '08:00:00'] })];
    const start = shiftStart(carmen, now);
    const end = shiftEnd(carmen, now)!;
    const { para } = handoffBrief({ now, start, end, fever: null, doses: dosesSpan(sch, [], start, at(10, 16, 8), now), readings: [], events: [] });
    expect(para.filter((l) => l.startsWith('Dar'))).toEqual(['Dar X 1 a las 06:00.', 'Dar X 1 a las 07:59.']);
  });
  test('Inicio after midnight, nurse without a fixed shift: yesterday\'s 23:30 dose that is still due is "Lo siguiente"', () => {
    // As inicio.tsx composes it: start = shiftStart(me, now); doses = dosesSpan(…, start, now, now).
    const ana: Nurse = { id: 'a', name: 'Ana', short: 'Ana', start: null, end: null };
    const now = at(10, 16, 0, 10);
    const start = shiftStart(ana, now);
    const h = heroNext({
      now, me: ana, meId: 'a', myFirst: 'Ana', next: null, start, fever: null, doses: dosesSpan(SCH, [], start, now, now),
      readings: [], events: [], handoffs: [], plan, doctor: null,
    });
    expect(h).toMatchObject({ kind: 'dose', title: 'Dar Losartán 50 mg' });
  });
  test('handoff brief: an earlier, higher fever reading is still listed next to the (latest) fever line', () => {
    const now = at(10, 15, 23, 40);
    const temp = (v: number, when: Date, sev: ReadingRow['severity']) => ({ ...reading('temp', v, when, sev), value2: null });
    const readings = [temp(38.8, at(10, 15, 22, 30), 'alert'), temp(38.0, at(10, 15, 23, 30), 'warn')];
    const fever = feverState(readings, [], now);
    expect(fever).toMatchObject({ temp: 38.0, called: false });
    const { watch } = handoffBrief({ now, start: shiftStart(carmen, now), end: shiftEnd(carmen, now), fever, doses: [], readings, events: [] });
    expect(watch.map((w) => w.text)).toContainEqual(expect.stringMatching(/38,8.*22:30/));
  });
  test('fever boundaries: above 37,5 °C, open until a call made after it, looking back 24 h', () => {
    const now = at(10, 15, 12);
    const t = (v: number, when: Date) => ({ ...reading('temp', v, when), value2: null });
    const call = (when: Date): EventRow => ({ ...note('call', when), type: 'doctor_call', severity: 'info' });
    expect(feverState([t(37.5, at(10, 15, 11))], [], now)).toBeNull();
    expect(feverState([t(37.6, at(10, 15, 11))], [], now)).toMatchObject({ temp: 37.6, called: false });
    expect(feverState([t(38.2, at(10, 15, 11))], [call(at(10, 15, 10))], now)!.called).toBe(false);
    expect(feverState([t(38.2, at(10, 15, 11))], [call(at(10, 15, 11, 5))], now)!.called).toBe(true);
    expect(feverState([t(38.2, at(10, 14, 11, 59))], [], now)).toBeNull();
    expect(feverState([t(38.2, at(10, 14, 12))], [], now)).not.toBeNull();
  });
  test('shift log: from my start minute to now, across midnight', () => {
    const now = at(10, 16, 1);
    const names = namesFrom([{ profile_id: 'c', profiles: { full_name: 'Carmen Morales' } }]);
    const log = shiftLog({
      now, start: shiftStart(carmen, now), meId: 'c', names, nurses: NURSES, doses: [], handoffs: [], readings: [],
      events: [note('before', at(10, 15, 21, 59)), note('start', at(10, 15, 22)), note('midnight', at(10, 16, 0)), note('now', now), note('later', at(10, 16, 1, 1))],
    });
    // 21:59 (before my start) and 01:01 (after now) stay out.
    expect(log.map((e) => e.time)).toEqual(['22:00', '00:00', '01:00']);
  });
});

describe('estado: day and week boundaries', () => {
  const patient: PatientRow = { id: 'p', full_name: 'Elena Rivas', age: 78, room: null, status: 'Estable', allergies: null };
  test('Monday 00:00: only Monday has arrived; last week is not counted', () => {
    const rows = [doseRow(at(10, 11, 8), { status: 'skipped', skip_reason: 'refused' })]; // Sunday before
    const w = weekMeds([sched()], rows, at(10, 12, 0, 0));
    expect(w.days.map((d) => d.state)).toEqual(['pending', 'future', 'future', 'future', 'future', 'future', 'future']);
    expect(w.days[0].today).toBe(true);
    expect(w.days[1].aria).toBe('martes 13: aún no ha llegado');
    expect(w).toMatchObject({ given: 0, total: 0, sub: '', exceptions: [] });
  });
  test('Sunday 23:59: the whole week has arrived and Sunday is today', () => {
    const w = weekMeds([sched()], [doseRow(at(10, 18, 8))], at(10, 18, 23, 59));
    expect(w.days.map((d) => d.state)).toEqual(['unrec', 'unrec', 'unrec', 'unrec', 'unrec', 'unrec', 'ok']);
    expect(w.days.map((d) => d.today)).toEqual([false, false, false, false, false, false, true]);
    expect(w).toMatchObject({ given: 1, total: 7, sub: '6 sin registrar' });
  });
  test('a week across a month boundary keeps its letters and day numbers', () => {
    const w = weekMeds([sched()], [], at(11, 1, 12)); // Sunday 1 November
    expect(w.days.map((d) => `${d.letter}${d.n}`)).toEqual(['L26', 'M27', 'X28', 'J29', 'V30', 'S31', 'D1']);
  });
  test('trends: Monday 00:00 is this week, Sunday 23:59 the week before', () => {
    const rs = [reading('hr', 110, at(10, 11, 23, 59), 'warn'), reading('hr', 72, at(10, 12, 0, 0)), reading('hr', 70, at(10, 13, 9))];
    const hr = trends(rs, plan, 'Elena', at(10, 14, 12)).find((t) => t.kind === 'hr')!;
    expect(hr.week.days).toBe(2);
    expect(hr).toMatchObject({
      status: 'ok', word: 'Más estable',
      compare: 'La semana pasada hubo 1 lectura fuera de su rango. Esta semana, ninguna.',
    });
  });
  test('hero: a night nurse after midnight, a nurse without a fixed shift, last night\'s handoff', () => {
    const ana: Nurse = { id: 'a', name: 'Ana', short: 'Ana', start: null, end: null };
    const base = { patient, short: 'Elena', fever: null, nurses: [carmen, rosa], now: at(10, 16, 2) };
    const lastNight: HandoffRow = { id: 'h', patient_id: 'p', nurse_id: 'c', summary: null, recommendation: null, started_at: null, ended_at: iso(at(10, 15, 6)) };
    expect(hero({ ...base, nurse: carmen, handoffs: [lastNight] }).caregiver).toBe('Carmen, su enfermera de noche, está con Elena desde las 22:00.');
    expect(hero({ ...base, nurse: ana, handoffs: [] }).caregiver).toBe('Ana, su enfermera, está con Elena.');
  });
  test('"Lo que debes saber" only takes notes from today, from 00:00', () => {
    const k = knows({
      fever: null, readings: [], doses: [], plan, short: 'Elena', nurse: rosa, now: at(10, 16, 9),
      events: [note('y', at(10, 15, 23, 59)), { ...note('t', at(10, 16, 0)), body: 'Durmió mal.' }],
    });
    expect(k).toEqual([{ tone: 'warn', lead: 'Para saber:', text: 'Durmió mal (anotado a las 00:00).' }]);
  });
  test('family hero: with a fever and nobody on shift, it does not say a nurse is already looking after her', () => {
    const fever = { temp: 38.4, at: at(10, 15, 20, 50), called: false };
    const h = hero({ patient, short: 'Elena', fever, nurse: null, nurses: [carmen, rosa], handoffs: [], now: at(10, 15, 21, 30) });
    expect(`${h.headline} ${h.caregiver}`).not.toMatch(/Ya está recibiendo atención|La enfermera va a avisar/);
    expect(h.caregiver).toMatch(/ninguna enfermera de turno/);
  });
  test('trends on Monday morning: no readings yet this week is not "the same as last week"', () => {
    const rs = [reading('hr', 72, at(10, 5, 9)), reading('hr', 72, at(10, 6, 9)), reading('hr', 72, at(10, 7, 9))];
    const hr = trends(rs, plan, 'Elena', at(10, 12, 9)).find((t) => t.kind === 'hr')!;
    expect(hr.summary).toBe('Esta semana aún no hay lecturas.');
    expect(hr.compare).not.toBe('Igual que la semana pasada.');
  });
  test('"Lo que debes saber" quotes the blood-pressure range that made it an alert', () => {
    // 145/125: systolic is 5 over (warn), diastolic is past the 120 alert line.
    const bp = { ...reading('bp', 145, at(10, 15, 9), 'alert'), value2: 125 };
    const [k] = knows({ fever: null, readings: [bp], events: [], doses: [], plan, short: 'Elena', nurse: rosa, now: at(10, 15, 10) });
    expect(k.text).toMatch(/\(60 a 90\)/);
  });
  test('week summary with nothing recorded', () => {
    expect(weekSummary(trends([], plan, 'Elena', at(10, 14)), { given: 0, total: 0 }, at(10, 14))).toBe('Aún no hay registros esta semana.');
  });
});
