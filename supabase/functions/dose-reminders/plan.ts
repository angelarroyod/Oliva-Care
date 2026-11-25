// Which dose reminders are due, who gets them and what they say. Pure: no
// imports, so the Edge Function (Deno) and Jest share this file. It mirrors the
// app's rules: src/features/care/doses.ts (expectedAt, +30 / +60 min) and
// src/features/care/shifts.ts (inWindow, reminderTime). Change both together.
//
// Time zones come in as a `Zone` (UTC offset at an instant) so the tests never
// depend on ICU; index.ts builds one from Intl, which Deno always has.

export const MINUTE = 60_000;
export const REMIND_AGAIN_MIN = 30; // doses.ts REMIND_AGAIN_MIN
export const UNRECORDED_MIN = 60; // doses.ts UNRECORDED_MIN
export const LOOKAHEAD_MIN = 120; // the largest "N min antes" (reminder_minutes check in 0003)

export type Zone = (instant: number) => number; // UTC offset in minutes east, at `instant`

export type Schedule = {
  id: string;
  patient_id: string;
  name: string;
  dose: string;
  times: string[]; // 'HH:MM:SS'
  reminder_mode: 'exact' | 'before';
  reminder_minutes: number;
  start_date: string; // 'YYYY-MM-DD', patient-local
  end_date: string | null; // inclusive
  suspended_at: string | null;
  created_at: string | null;
};

export type DoseState = {
  schedule_id: string;
  scheduled_for: string; // ISO instant
  status: 'pending' | 'given' | 'skipped' | 'unrecorded';
  reminded_at: string | null;
  re_reminded_at: string | null;
};

export type NurseShift = { profile_id: string; patient_id: string; shift_start: string | null; shift_end: string | null };

export type Kind = 'first' | 'again';
export type Due = {
  kind: Kind;
  schedule: Schedule;
  at: number; // dose instant (ms)
  fireAt: number; // when this reminder is meant to go out
  row: DoseState | null;
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// Wall-clock day and 'HH:MM' of an instant in a zone.
export function wallOf(instant: number, zone: Zone): { day: string; time: string } {
  const l = new Date(instant + zone(instant) * MINUTE);
  return {
    day: `${l.getUTCFullYear()}-${pad2(l.getUTCMonth() + 1)}-${pad2(l.getUTCDate())}`,
    time: `${pad2(l.getUTCHours())}:${pad2(l.getUTCMinutes())}`,
  };
}

// 'YYYY-MM-DD' + 'HH:MM' in a zone → instant. The second pass picks up a DST
// change between the guess and the answer.
// ponytail: a time inside the spring-forward gap (02:30 in Madrid on the last
// Sunday of March) lands an hour off from where the device puts it; no default
// dose time is in that hour.
export function wallToInstant(day: string, time: string, zone: Zone): number {
  const naive = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), Number(time.slice(0, 2)), Number(time.slice(3, 5)));
  const guess = naive - zone(naive) * MINUTE;
  return naive - zone(guess) * MINUTE;
}

const addDay = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// doses.ts expectedAt, with the day taken in the patient's zone.
function expected(s: Schedule, day: string, at: number) {
  if (day < s.start_date || (s.end_date != null && day > s.end_date)) return false;
  if (s.suspended_at && at >= Date.parse(s.suspended_at)) return false;
  return !s.created_at || at >= Date.parse(s.created_at) - MINUTE;
}

const leadMin = (s: Schedule) => (s.reminder_mode === 'exact' ? 0 : s.reminder_minutes);
const recorded = (r: DoseState | null) => !!r && r.status !== 'pending';
export const stateKey = (scheduleId: string, at: number) => `${scheduleId}|${at}`;

// Reminders to send at `now`. First reminder from its fire time until the
// second one is due; second from +30 min until +60 min ("Sin registrar"), when
// the app takes over. A recorded dose (given, skipped, unrecorded) gets nothing.
export function dueReminders(schedules: Schedule[], rows: DoseState[], now: number, zoneOf: (patientId: string) => Zone): Due[] {
  const byKey = new Map(rows.map((r) => [stateKey(r.schedule_id, Date.parse(r.scheduled_for)), r]));
  const out: Due[] = [];
  for (const s of schedules) {
    const zone = zoneOf(s.patient_id);
    const today = wallOf(now, zone).day;
    const seen = new Set<number>();
    for (const day of [addDay(today, -1), today, addDay(today, 1)]) {
      for (const t of s.times) {
        const at = wallToInstant(day, t.slice(0, 5), zone);
        if (seen.has(at) || !expected(s, day, at)) continue;
        seen.add(at);
        const row = byKey.get(stateKey(s.id, at)) ?? null;
        if (recorded(row)) continue;
        const first = at - leadMin(s) * MINUTE;
        const again = at + REMIND_AGAIN_MIN * MINUTE;
        const stop = at + UNRECORDED_MIN * MINUTE;
        if (now >= again && now < stop) {
          if (!row?.re_reminded_at) out.push({ kind: 'again', schedule: s, at, fireAt: again, row });
        } else if (now >= first && now < again) {
          if (!row?.reminded_at) out.push({ kind: 'first', schedule: s, at, fireAt: first, row });
        }
      }
    }
  }
  return out.sort((a, b) => a.at - b.at || a.schedule.name.localeCompare(b.schedule.name));
}

// shifts.ts inWindow: start inclusive, end exclusive, wraps midnight, start === end is 24 h.
function inWindow(min: number, start: string, end: string) {
  const s = toMin(start);
  const e = toMin(end);
  if (s === e) return true;
  return s < e ? min >= s && min < e : min >= s || min < e;
}

// Nurses to remind at 'HH:MM': those whose fixed shift covers it; else those
// without a fixed shift (they cover any gap, as in shifts.ts onShift); else
// every nurse of the patient, because a dose nobody hears about is worse than
// an extra notification.
// ponytail: the app names one nurse (the first match); with overlapping
// shifts every nurse on shift gets it.
export function recipients(nurses: NurseShift[], patientId: string, time: string): string[] {
  const mine = nurses.filter((n) => n.patient_id === patientId);
  const m = toMin(time);
  const fixed = mine.filter((n) => n.shift_start && n.shift_end && inWindow(m, n.shift_start.slice(0, 5), n.shift_end.slice(0, 5)));
  const pick = fixed.length ? fixed : mine.filter((n) => !n.shift_start || !n.shift_end);
  return [...new Set((pick.length ? pick : mine).map((n) => n.profile_id))];
}

const listY = (a: string[]) => (a.length < 2 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}`);

export type Reminder = { kind: Kind; patientId: string; at: number; time: string; doses: Due[]; to: string[]; title: string; body: string };

// One notification per patient, kind and dose time: three medicines at 08:00
// make one reminder that names all three.
export function groupReminders(due: Due[], nurses: NurseShift[], now: number, zoneOf: (patientId: string) => Zone): Reminder[] {
  const groups = new Map<string, Due[]>();
  for (const d of due) {
    const k = `${d.schedule.patient_id}|${d.kind}|${d.at}`;
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  return [...groups.values()].map((doses) => {
    const { kind, at, schedule } = doses[0];
    const zone = zoneOf(schedule.patient_id);
    const time = wallOf(at, zone).time;
    const fire = Math.max(...doses.map((d) => d.fireAt));
    return {
      kind,
      patientId: schedule.patient_id,
      at,
      time,
      doses,
      to: recipients(nurses, schedule.patient_id, wallOf(fire, zone).time), // on shift when it is meant to go out
      ...reminderText(kind, doses.map((d) => d.schedule), time, Math.round((at - now) / MINUTE)),
    };
  });
}

// Spanish copy. `inMin` > 0 when the reminder goes out before the dose time.
export function reminderText(kind: Kind, meds: Pick<Schedule, 'name' | 'dose'>[], time: string, inMin: number): { title: string; body: string } {
  const list = listY(meds.map((m) => (m.dose.trim() ? `${m.name} ${m.dose.trim()}` : m.name)));
  const many = meds.length > 1;
  if (kind === 'again') {
    return {
      title: `Sin anotar: medicación de las ${time}`,
      body: `${list}. Si ya ${many ? 'las diste, anótalas' : 'la diste, anótala'} en Medicación.`,
    };
  }
  return {
    title: inMin > 0 ? `Medicación a las ${time} (en ${inMin} min)` : `Medicación de las ${time}`,
    body: `${list}.`,
  };
}
