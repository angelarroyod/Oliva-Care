/**
 * @jest-environment ./jest/timezone-environment.js
 * @jest-environment-options {"timezone": "Europe/Madrid"}
 */
// DST transition days for the pure care modules, in a zone that observes DST
// (Europe/Madrid, also 0003's LEGACY_TZ default). In 2026 the clocks jump
// 02:00 → 03:00 on Sunday 29 March (a 23-hour day) and fall back
// 03:00 → 02:00 on Sunday 25 October (a 25-hour day).
import { addDays, hhmm, localDate, minutesBetween, relativeDay, startOfDay, startOfWeek, weekRange } from '@/features/care/clock';
import { onShift, shiftEnd, shiftStart, type Nurse } from '@/features/care/shifts';
import { dosesByDay, dosesForDay } from '@/features/care/doses';
import { dosesSpan, handoffBrief } from '@/features/care/nextUp';
import { trends, weekMeds } from '@/features/care/estado';
import { planFromRows } from '@/features/care/vitals';
import type { DoseRow, ReadingRow, ScheduleRow } from '@/features/care/types';

const at = (mo: number, d: number, h = 0, mi = 0) => new Date(2026, mo - 1, d, h, mi);
const iso = (d: Date) => d.toISOString();
const HOUR = 3_600_000;

const carmen: Nurse = { id: 'c', name: 'Carmen Morales', short: 'Carmen', start: '22:00', end: '06:00' };
const rosa: Nurse = { id: 'r', name: 'Rosa García', short: 'Rosa', start: '06:00', end: '22:00' };
const plan = planFromRows([]);

const sched = (over: Partial<ScheduleRow> = {}): ScheduleRow => ({
  id: 's1', patient_id: 'p', name: 'Metformina', dose: '850 mg', purpose: null, times: ['08:00:00'],
  reminder_mode: 'exact', reminder_minutes: 0, active: true, start_date: '2026-01-01', end_date: null,
  created_at: iso(at(1, 1)), updated_by: null, updated_at: iso(at(1, 1)), ...over,
});
const doseRow = (scheduled_for: string, over: Partial<DoseRow> = {}): DoseRow => ({
  id: `d-${scheduled_for}`, schedule_id: 's1', patient_id: 'p', scheduled_for, status: 'given', recorded_at: null,
  recorded_by: 'r', recorded_late: false, skip_reason: null, skip_note: null, ...over,
});
let seq = 0;
const hr = (when: Date, value = 72, severity: ReadingRow['severity'] = 'ok'): ReadingRow => ({
  id: `hr${seq++}`, patient_id: 'p', control_id: `k${when.getTime()}`, kind: 'hr', value, value2: null, context: null,
  severity, taken_at: iso(when), taken_by: 'r', note: null, family_notified: false,
});

describe('the zone itself', () => {
  test('Europe/Madrid changes offset on 29 March and 25 October 2026', () => {
    expect(at(3, 28, 12).getTimezoneOffset()).toBe(-60);
    expect(at(3, 30, 12).getTimezoneOffset()).toBe(-120);
    expect(at(10, 24, 12).getTimezoneOffset()).toBe(-120);
    expect(at(10, 26, 12).getTimezoneOffset()).toBe(-60);
    expect(at(3, 30).getTime() - at(3, 29).getTime()).toBe(23 * HOUR);
    expect(at(10, 26).getTime() - at(10, 25).getTime()).toBe(25 * HOUR);
  });
});

describe('clock on transition days', () => {
  test('days and weeks stay on local midnight across the change', () => {
    expect(addDays(at(3, 28), 1)).toEqual(at(3, 29));
    expect(addDays(at(3, 29), 1)).toEqual(at(3, 30));
    expect(addDays(at(10, 25), 1)).toEqual(at(10, 26));
    expect(addDays(at(10, 19), 7).getHours()).toBe(0);
    expect(startOfDay(at(10, 25, 23, 30))).toEqual(at(10, 25));
    expect(localDate(at(10, 25, 23, 30))).toBe('2026-10-25');
    expect(startOfWeek(at(10, 25, 23, 30))).toEqual(at(10, 19));
    expect(startOfWeek(at(10, 26, 0, 30))).toEqual(at(10, 26));
    expect(startOfWeek(at(3, 29, 12))).toEqual(at(3, 23));
    expect(weekRange(startOfWeek(at(10, 25, 12)))).toBe('del 19 al 25 de octubre');
  });
  test('relativeDay counts a 23-hour or 25-hour day as one day', () => {
    expect(relativeDay(at(3, 29, 12), at(3, 30, 9))).toBe('ayer');
    expect(relativeDay(at(10, 25, 12), at(10, 26, 0, 10))).toBe('ayer');
    expect(relativeDay(at(10, 20, 9), at(10, 26, 9))).toBe('el martes');
    expect(relativeDay(at(10, 19, 9), at(10, 26, 9))).toBe('el 19 de octubre');
  });
  test('elapsed minutes are real minutes: the 22:00–06:00 night lasts 7 h in spring, 9 h in autumn', () => {
    expect(minutesBetween(at(3, 28, 22), at(3, 29, 6))).toBe(420);
    expect(minutesBetween(at(10, 24, 22), at(10, 25, 6))).toBe(540);
  });
});

describe('shifts on transition nights', () => {
  test('the shift still starts at 22:00 the evening before', () => {
    expect(shiftStart(carmen, at(3, 29, 5))).toEqual(at(3, 28, 22));
    expect(shiftStart(carmen, at(10, 25, 5))).toEqual(at(10, 24, 22));
    // During the repeated hour (02:30 winter time) Carmen is still on shift.
    expect(onShift([carmen, rosa], hhmm(new Date('2026-10-25T01:30:00Z')))!.id).toBe('c');
  });
  test('a 22:00–06:00 shift ends at 06:00 on the spring-forward morning', () => {
    expect(shiftEnd(carmen, at(3, 29, 3, 30))).toEqual(at(3, 29, 6));
  });
  test('a 22:00–06:00 shift ends at 06:00 on the fall-back morning', () => {
    expect(shiftEnd(carmen, at(10, 25, 4))).toEqual(at(10, 25, 6));
  });
  test('shifts that do not span the change are unaffected', () => {
    expect(shiftEnd(rosa, at(3, 29, 12))).toEqual(at(3, 29, 22));
    expect(shiftEnd(carmen, at(10, 25, 23))).toEqual(at(10, 26, 6));
  });
});

describe('doses on transition days', () => {
  test('a normal day of doses on both transition days, at the right instants', () => {
    const s = sched({ times: ['08:00:00', '14:00:00', '20:00:00'] });
    const spring = dosesForDay([s], [], at(3, 29), at(3, 29, 7));
    expect(spring.map((d) => d.time)).toEqual(['08:00', '14:00', '20:00']);
    expect(iso(spring[0].at)).toBe('2026-03-29T06:00:00.000Z'); // summer time, UTC+2
    const autumn = dosesForDay([s], [], at(10, 25), at(10, 25, 7));
    expect(autumn.map((d) => d.time)).toEqual(['08:00', '14:00', '20:00']);
    expect(iso(autumn[0].at)).toBe('2026-10-25T07:00:00.000Z'); // winter time, UTC+1
  });
  // These two rely on ECMA-262's rule for local times that don't exist / happen twice
  // (later for a gap, earlier for an overlap); Jest checks it on V8, the app runs Hermes.
  test('a dose in the skipped hour is expected once; one in the repeated hour is not doubled', () => {
    const gap = dosesForDay([sched({ times: ['02:30:00'] })], [], at(3, 29), at(3, 29, 12));
    expect(gap.map((d) => `${d.time} ${iso(d.at)}`)).toEqual(['03:30 2026-03-29T01:30:00.000Z']);
    const twice = dosesForDay([sched({ times: ['02:30:00'] })], [], at(10, 25), at(10, 25, 12));
    expect(twice.map((d) => `${d.time} ${iso(d.at)}`)).toEqual(['02:30 2026-10-25T00:30:00.000Z']);
  });
  test('recorded rows match their slots on both transition days', () => {
    expect(dosesForDay([sched()], [doseRow('2026-03-29T06:00:00+00:00')], at(3, 29), at(3, 29, 12)).map((d) => `${d.time} ${d.status}`)).toEqual(['08:00 given']);
    expect(dosesForDay([sched()], [doseRow('2026-10-25T07:00:00+00:00')], at(10, 25), at(10, 25, 12)).map((d) => `${d.time} ${d.status}`)).toEqual(['08:00 given']);
  });
  test('"sin registrar" comes 60 real minutes after the dose, through the repeated hour', () => {
    const s = sched({ times: ['01:30:00'] }); // 01:30 summer time = 23:30 UTC on the 24th
    const status = (now: string) => dosesForDay([s], [], at(10, 25), new Date(now))[0].status;
    expect(status('2026-10-25T00:29:00Z')).toBe('pending');
    expect(status('2026-10-25T00:30:00Z')).toBe('unrecorded');
  });
  test('a week of doses across either change is seven local days', () => {
    for (const monday of [at(3, 23), at(10, 19)]) {
      const days = dosesByDay([sched()], [], monday, 7, at(12, 1));
      expect(new Set(days.map((d) => localDate(d.day))).size).toBe(7);
      expect(days.every((d) => d.day.getHours() === 0 && d.doses.length === 1 && d.doses[0].time === '08:00')).toBe(true);
    }
  });
});

describe('nextUp on transition nights', () => {
  test('a night shift spans two local days even when one of them has 23 or 25 hours', () => {
    const s = [sched({ times: ['06:00:00'] })];
    expect(dosesSpan(s, [], at(10, 25, 22), at(10, 26, 8), at(10, 26, 1)).map((d) => localDate(d.at))).toEqual(['2026-10-25', '2026-10-26']);
    expect(dosesSpan(s, [], at(3, 29, 22), at(3, 30, 8), at(3, 30, 1)).map((d) => localDate(d.at))).toEqual(['2026-03-29', '2026-03-30']);
  });
  // "Para {next}" lists the doses in the two hours after my shift ends (06:00–08:00).
  const para = (now: Date, times: string[]) => {
    const s = [sched({ id: 'x', name: 'X', dose: '1', times })];
    const start = shiftStart(carmen, now);
    const end = shiftEnd(carmen, now);
    // As relevo.tsx does: doses through two hours after my shift ends.
    const doses = dosesSpan(s, [], start, new Date((end ?? now).getTime() + 2 * HOUR), now);
    return handoffBrief({ now, start, end, fever: null, doses, readings: [], events: [] }).para.filter((l) => l.startsWith('Dar'));
  };
  test('fall-back night: the next nurse gets 07:30, not a 05:30 dose that is still in my shift', () => {
    expect(para(at(10, 25, 4), ['05:30:00', '07:30:00'])).toEqual(['Dar X 1 a las 07:30.']);
  });
  test('spring-forward night: the next nurse gets the 06:30 dose, not 08:30', () => {
    expect(para(at(3, 29, 4), ['06:30:00', '08:30:00'])).toEqual(['Dar X 1 a las 06:30.']);
  });
});

describe('estado across a change', () => {
  test('the medication week strip has seven days whichever change it contains', () => {
    for (const now of [at(3, 29, 23), at(10, 25, 23)]) {
      const w = weekMeds([sched()], [], now);
      expect(w.days.map((d) => d.letter)).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D']);
      expect(w.days.map((d) => d.n)).toEqual(now.getMonth() === 2 ? [23, 24, 25, 26, 27, 28, 29] : [19, 20, 21, 22, 23, 24, 25]);
      expect(w.days.map((d) => d.state)).toEqual(Array(7).fill('unrec'));
      expect(w.total).toBe(7);
    }
  });
  test('trends plot one point per local day for 28 days through the October change', () => {
    const readings = Array.from({ length: 28 }, (_, i) => hr(new Date(2026, 9, 5 + i, 8)));
    const t = trends(readings, plan, 'Elena', at(11, 1, 12)).find((x) => x.kind === 'hr')!;
    expect(t.points).toEqual(Array(28).fill(72));
  });
  test('the last hour of the 25-hour Sunday is still this week; Monday 00:00 is the next', () => {
    const late = hr(at(10, 25, 23, 30), 110, 'warn');
    expect(trends([late], plan, 'Elena', at(10, 25, 23, 45)).find((x) => x.kind === 'hr')!.week.days).toBe(1);
    expect(trends([late], plan, 'Elena', at(10, 26, 1)).find((x) => x.kind === 'hr')!.week.days).toBe(0);
  });
});
