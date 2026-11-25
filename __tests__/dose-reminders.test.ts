import {
  dueReminders, groupReminders, recipients, reminderText, wallOf, wallToInstant,
  type DoseState, type NurseShift, type Schedule, type Zone,
} from '../supabase/functions/dose-reminders/plan';

// Fixed-offset zones, so nothing here needs ICU. Madrid-ish: +60 in winter, and a
// fake DST switch at a known instant for the DST test.
const CET: Zone = () => 60;
const SWITCH = Date.UTC(2026, 2, 29, 1, 0); // 2026-03-29 01:00Z: 02:00 CET → 03:00 CEST
const MADRID: Zone = (t) => (t >= SWITCH ? 120 : 60);
const zoneOf = () => CET;

// 2026-11-25 local (CET): wall 'HH:MM' → instant.
const at = (time: string, day = '2026-11-25') => wallToInstant(day, time, CET);

const sched = (over: Partial<Schedule> = {}): Schedule => ({
  id: 's1', patient_id: 'p1', name: 'Enalapril', dose: '10 mg', times: ['08:00:00'],
  reminder_mode: 'before', reminder_minutes: 15, start_date: '2026-11-01', end_date: null,
  suspended_at: null, created_at: '2026-11-01T00:00:00Z', ...over,
});
const row = (over: Partial<DoseState> = {}): DoseState => ({
  schedule_id: 's1', scheduled_for: new Date(at('08:00')).toISOString(), status: 'pending',
  reminded_at: null, re_reminded_at: null, ...over,
});

describe('wall clock', () => {
  test('round trip in a fixed zone', () => {
    const t = at('08:00');
    expect(new Date(t).toISOString()).toBe('2026-11-25T07:00:00.000Z');
    expect(wallOf(t, CET)).toEqual({ day: '2026-11-25', time: '08:00' });
  });
  test('wall time after a DST change uses the new offset', () => {
    expect(new Date(wallToInstant('2026-03-29', '08:00', MADRID)).toISOString()).toBe('2026-03-29T06:00:00.000Z');
    expect(new Date(wallToInstant('2026-03-28', '08:00', MADRID)).toISOString()).toBe('2026-03-28T07:00:00.000Z');
  });
  test('a late-evening dose on the day before is still found', () => {
    const d = dueReminders([sched({ times: ['23:50:00'], reminder_minutes: 30 })], [], at('23:30', '2026-11-24'), zoneOf);
    expect(d).toHaveLength(1);
    expect(wallOf(d[0].at, CET)).toEqual({ day: '2026-11-24', time: '23:50' });
  });
});

describe('dueReminders', () => {
  test('first reminder from "N min antes" until +30 min', () => {
    const s = sched();
    expect(dueReminders([s], [], at('07:44'), zoneOf)).toEqual([]);
    const d = dueReminders([s], [], at('07:45'), zoneOf);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ kind: 'first', at: at('08:00'), fireAt: at('07:45'), row: null });
    expect(dueReminders([s], [], at('08:29'), zoneOf)[0].kind).toBe('first');
  });

  test('"a la hora exacta" fires at the dose time', () => {
    const s = sched({ reminder_mode: 'exact', reminder_minutes: 0 });
    expect(dueReminders([s], [], at('07:59'), zoneOf)).toEqual([]);
    expect(dueReminders([s], [], at('08:00'), zoneOf)[0].fireAt).toBe(at('08:00'));
  });

  test('second reminder from +30 until +60, then nothing (the app shows sin registrar)', () => {
    const s = sched();
    const reminded = row({ reminded_at: '2026-11-25T06:45:00Z' });
    expect(dueReminders([s], [reminded], at('08:29'), zoneOf)).toEqual([]);
    expect(dueReminders([s], [reminded], at('08:30'), zoneOf)[0]).toMatchObject({ kind: 'again', fireAt: at('08:30') });
    expect(dueReminders([s], [reminded], at('08:59'), zoneOf)).toHaveLength(1);
    expect(dueReminders([s], [reminded], at('09:00'), zoneOf)).toEqual([]);
  });

  test('each reminder goes out once', () => {
    const s = sched();
    expect(dueReminders([s], [row({ reminded_at: 'x' })], at('07:50'), zoneOf)).toEqual([]);
    expect(dueReminders([s], [row({ reminded_at: 'x', re_reminded_at: 'y' })], at('08:40'), zoneOf)).toEqual([]);
  });

  test('a first reminder the job missed is not sent after +30; the second one is', () => {
    const d = dueReminders([sched()], [], at('08:35'), zoneOf);
    expect(d.map((x) => x.kind)).toEqual(['again']);
  });

  test.each(['given', 'skipped', 'unrecorded'] as const)('a %s dose gets no reminder', (status) => {
    expect(dueReminders([sched()], [row({ status })], at('07:50'), zoneOf)).toEqual([]);
    expect(dueReminders([sched()], [row({ status, reminded_at: 'x' })], at('08:40'), zoneOf)).toEqual([]);
  });

  test('a stored pending row (after "Corregir") still gets reminders', () => {
    expect(dueReminders([sched()], [row()], at('07:50'), zoneOf)[0].row).toEqual(row());
  });

  test('outside the plan: before start, after end, after suspension, before creation', () => {
    const now = at('07:50');
    expect(dueReminders([sched({ start_date: '2026-11-26' })], [], now, zoneOf)).toEqual([]);
    expect(dueReminders([sched({ end_date: '2026-11-24' })], [], now, zoneOf)).toEqual([]);
    expect(dueReminders([sched({ end_date: '2026-11-25' })], [], now, zoneOf)).toHaveLength(1);
    expect(dueReminders([sched({ suspended_at: new Date(at('07:00')).toISOString() })], [], now, zoneOf)).toEqual([]);
    expect(dueReminders([sched({ created_at: new Date(at('08:05')).toISOString() })], [], now, zoneOf)).toEqual([]);
  });

  test('several times and schedules, sorted by dose time then name', () => {
    const d = dueReminders(
      [sched({ id: 'b', name: 'Metformina', times: ['08:00:00', '20:00:00'] }), sched({ id: 'a', name: 'Atorvastatina' })],
      [],
      at('07:50'),
      zoneOf,
    );
    expect(d.map((x) => x.schedule.name)).toEqual(['Atorvastatina', 'Metformina']);
  });
});

describe('recipients', () => {
  const nurses: NurseShift[] = [
    { profile_id: 'day', patient_id: 'p1', shift_start: '08:00:00', shift_end: '20:00:00' },
    { profile_id: 'night', patient_id: 'p1', shift_start: '20:00:00', shift_end: '08:00:00' },
    { profile_id: 'other-patient', patient_id: 'p2', shift_start: null, shift_end: null },
  ];
  test('the nurse whose shift covers the time; start inclusive, end exclusive, overnight wraps', () => {
    expect(recipients(nurses, 'p1', '07:45')).toEqual(['night']);
    expect(recipients(nurses, 'p1', '08:00')).toEqual(['day']);
    expect(recipients(nurses, 'p1', '02:00')).toEqual(['night']);
  });
  test('a nurse without a fixed shift covers the gaps', () => {
    const ns: NurseShift[] = [
      { profile_id: 'day', patient_id: 'p1', shift_start: '08:00:00', shift_end: '14:00:00' },
      { profile_id: 'any', patient_id: 'p1', shift_start: null, shift_end: null },
    ];
    expect(recipients(ns, 'p1', '09:00')).toEqual(['day']);
    expect(recipients(ns, 'p1', '15:00')).toEqual(['any']);
  });
  test('nobody on shift: every nurse of the patient', () => {
    const ns: NurseShift[] = [
      { profile_id: 'a', patient_id: 'p1', shift_start: '08:00:00', shift_end: '14:00:00' },
      { profile_id: 'b', patient_id: 'p1', shift_start: '14:00:00', shift_end: '20:00:00' },
    ];
    expect(recipients(ns, 'p1', '22:00')).toEqual(['a', 'b']);
    expect(recipients(ns, 'p3', '22:00')).toEqual([]);
  });
});

describe('groupReminders and text', () => {
  const nurses: NurseShift[] = [
    { profile_id: 'night', patient_id: 'p1', shift_start: '20:00:00', shift_end: '08:00:00' },
    { profile_id: 'day', patient_id: 'p1', shift_start: '08:00:00', shift_end: '20:00:00' },
  ];
  test('doses at the same time make one reminder; sent to who is on shift when it fires', () => {
    const now = at('07:45');
    const due = dueReminders([sched(), sched({ id: 's2', name: 'Metformina', dose: '850 mg' })], [], now, zoneOf);
    const [r] = groupReminders(due, nurses, now, zoneOf);
    expect(r).toMatchObject({ kind: 'first', time: '08:00', to: ['night'], title: 'Medicación a las 08:00 (en 15 min)', body: 'Enalapril 10 mg y Metformina 850 mg.' });
    expect(r.doses).toHaveLength(2);
  });
  test('the second reminder goes to whoever is on shift at +30', () => {
    const now = at('08:30');
    const [r] = groupReminders(dueReminders([sched()], [row({ reminded_at: 'x' })], now, zoneOf), nurses, now, zoneOf);
    expect(r).toMatchObject({ kind: 'again', to: ['day'], title: 'Sin anotar: medicación de las 08:00' });
    expect(r.body).toBe('Enalapril 10 mg. Si ya la diste, anótala en Medicación.');
  });
  test('copy', () => {
    expect(reminderText('first', [{ name: 'Paracetamol', dose: '' }], '14:00', 0)).toEqual({ title: 'Medicación de las 14:00', body: 'Paracetamol.' });
    expect(reminderText('again', [{ name: 'A', dose: '' }, { name: 'B', dose: '1' }], '14:00', -30).body).toBe('A y B 1. Si ya las diste, anótalas en Medicación.');
  });
});
