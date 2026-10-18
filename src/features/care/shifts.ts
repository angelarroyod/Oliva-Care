import type { MemberRow, ReminderMode } from './types';
import { addDays, atTime, firstName, fromMin, shortTime, startOfDay, toMin } from './clock';

// Who is on shift. Each nurse membership has shift_start / shift_end; overnight
// shifts wrap (22:00–06:00). The start minute is in-shift, the end minute isn't.
export type Nurse = { id: string; name: string; short: string; start: string | null; end: string | null };

export const nursesFrom = (team: MemberRow[]): Nurse[] =>
  team
    .filter((m) => m.role === 'nurse')
    .map((m) => {
      const name = m.profiles?.full_name?.trim() || 'Enfermera';
      return {
        id: m.profile_id,
        name,
        short: firstName(name),
        start: m.shift_start ? shortTime(m.shift_start) : null,
        end: m.shift_end ? shortTime(m.shift_end) : null,
      };
    });

const hasWindow = (n: Nurse): n is Nurse & { start: string; end: string } => !!n.start && !!n.end;

// start inclusive, end exclusive, wraps midnight; start === end means 24 h.
export function inWindow(min: number, start: string, end: string) {
  const s = toMin(start);
  const e = toMin(end);
  if (s === e) return true;
  return s < e ? min >= s && min < e : min >= s || min < e;
}

// Nurse on shift at 'HH:MM'. Fixed windows win; a nurse without one covers any gap.
export function onShift(nurses: Nurse[], t: string): Nurse | null {
  const m = toMin(t);
  return nurses.find((n) => hasWindow(n) && inWindow(m, n.start, n.end)) ?? nurses.find((n) => !hasWindow(n)) ?? null;
}

// 'noche' when the window crosses midnight or starts from 20:00; 'tarde' from 13:00; else 'día'.
export function shiftKind(n: Nurse): 'día' | 'tarde' | 'noche' | null {
  if (!hasWindow(n)) return null;
  const s = toMin(n.start);
  if (s > toMin(n.end) || s >= 20 * 60) return 'noche';
  return s >= 13 * 60 ? 'tarde' : 'día';
}

// "Turno de noche · 22:00 a 06:00" / "Sin turno fijo"
export const shiftLabel = (n: Nurse) => (hasWindow(n) ? `Turno de ${shiftKind(n)} · ${n.start} a ${n.end}` : 'Sin turno fijo');

// Most recent start of this nurse's shift at `now` (start of today when no fixed window).
export function shiftStart(n: Nurse | null, now: Date): Date {
  if (!n || !hasWindow(n)) return startOfDay(now);
  const today = atTime(now, n.start);
  return today.getTime() <= now.getTime() ? today : atTime(addDays(now, -1), n.start);
}

// End of the shift that started at `shiftStart(n, now)`.
export function shiftEnd(n: Nurse | null, now: Date): Date | null {
  if (!n || !hasWindow(n)) return null;
  const start = shiftStart(n, now);
  const len = (toMin(n.end) - toMin(n.start) + 1440) % 1440 || 1440;
  return new Date(start.getTime() + len * 60_000);
}

// Who takes over from `me`: the nurse whose shift starts when mine ends, else any other nurse.
export function nextNurse(nurses: Nurse[], meId: string): Nurse | null {
  const me = nurses.find((n) => n.id === meId);
  const others = nurses.filter((n) => n.id !== meId);
  return (me?.end ? others.find((n) => n.start === me.end) : undefined) ?? others[0] ?? null;
}

// Reminder fires at the dose time ('exact') or `minutes` before ('before', 5–120).
export const reminderTime = (doseTime: string, mode: ReminderMode, minutes: number) =>
  mode === 'exact' ? shortTime(doseTime) : fromMin(toMin(doseTime) - minutes);

export type ReminderRow = { time: string; dose: string; nurse: Nurse | null; owner: Nurse | null; cross: boolean };

// One row per dose time: when the reminder fires, who gets it (on shift then),
// and whether the dose itself falls in someone else's shift.
export function reminderRows(times: string[], mode: ReminderMode, minutes: number, nurses: Nurse[]): ReminderRow[] {
  return times.map((t) => {
    const dose = shortTime(t);
    const time = reminderTime(dose, mode, minutes);
    const nurse = onShift(nurses, time);
    const owner = onShift(nurses, dose);
    return { time, dose, nurse, owner, cross: !!nurse && !!owner && nurse.id !== owner.id };
  });
}
