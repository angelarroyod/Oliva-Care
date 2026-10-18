import type { DoseRow, DoseStatus, ScheduleRow, SkipReason } from './types';
import { MINUTE, addDays, atTime, localDate, sameDay, shortTime, startOfDay } from './clock';

// Doses are expanded client-side from medication_schedules; medication_doses
// only stores what someone recorded (given / skipped). Pending vs unrecorded
// comes from the clock, so no cron is needed for the UI to be right.
// ponytail: when push reminders land (pg_cron + Edge Function), the job can
// materialize pending/unrecorded rows; a stored 'unrecorded' row is honoured here.
export const REMIND_AGAIN_MIN = 30; // +30 min: remind the nurse on shift again
export const UNRECORDED_MIN = 60; // +60 min: the dose becomes "Sin registrar"
export const HISTORY_DAYS = 7;

export type Dose = {
  key: string; // `${scheduleId}|${epoch ms}`
  scheduleId: string;
  name: string;
  dose: string;
  purpose: string;
  time: string; // 'HH:MM'
  at: Date;
  status: DoseStatus;
  row: DoseRow | null;
};

export const SKIP_REASONS: { id: SkipReason; label: string }[] = [
  { id: 'asleep', label: 'Paciente dormido' },
  { id: 'refused', label: 'Lo rechazó' },
  { id: 'nausea_vomiting', label: 'Náuseas o vómitos' },
  { id: 'not_eaten', label: 'No comió' },
  { id: 'doctor_order', label: 'Indicación médica' },
  { id: 'out_of_stock', label: 'No había medicamento' },
  { id: 'other', label: 'Otro motivo' },
];
export const reasonLabel = (r: SkipReason | null | undefined) => SKIP_REASONS.find((x) => x.id === r)?.label ?? 'Sin motivo';

export const doseKey = (scheduleId: string, at: Date) => `${scheduleId}|${at.getTime()}`;

// Expected at `at`: within [start_date, end_date], before any suspension, and,
// on its first day, not before it was created (no phantom "sin registrar").
export function expectedAt(s: ScheduleRow, at: Date) {
  const day = localDate(at);
  if (day < s.start_date || (s.end_date != null && day > s.end_date)) return false;
  if (s.suspended_at && at.getTime() >= new Date(s.suspended_at).getTime()) return false;
  return !s.created_at || at.getTime() >= new Date(s.created_at).getTime() - MINUTE;
}

function statusOf(row: DoseRow | null, at: Date, now: Date): DoseStatus {
  if (row && (row.status === 'given' || row.status === 'skipped' || row.status === 'unrecorded')) return row.status;
  return now.getTime() >= at.getTime() + UNRECORDED_MIN * MINUTE ? 'unrecorded' : 'pending';
}

const make = (s: ScheduleRow, at: Date, row: DoseRow | null, now: Date): Dose => ({
  key: doseKey(s.id, at),
  scheduleId: s.id,
  name: s.name,
  dose: s.dose,
  purpose: s.purpose ?? '',
  time: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`,
  at,
  status: statusOf(row, at, now),
  row,
});

// All doses of one local day, chronological. Recorded doses whose schedule no
// longer expands that day (suspended, changed times) still count.
export function dosesForDay(schedules: ScheduleRow[], rows: DoseRow[], day: Date, now: Date): Dose[] {
  const byKey = new Map(rows.map((r) => [doseKey(r.schedule_id, new Date(r.scheduled_for)), r]));
  const seen = new Set<string>();
  const out: Dose[] = [];
  for (const s of schedules) {
    for (const t of s.times) {
      const at = atTime(day, shortTime(t));
      if (!expectedAt(s, at)) continue;
      const key = doseKey(s.id, at);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(make(s, at, byKey.get(key) ?? null, now));
    }
  }
  for (const r of rows) {
    const at = new Date(r.scheduled_for);
    const key = doseKey(r.schedule_id, at);
    if (seen.has(key) || !sameDay(at, day) || (r.status !== 'given' && r.status !== 'skipped')) continue;
    const s = schedules.find((x) => x.id === r.schedule_id);
    if (!s) continue;
    seen.add(key);
    out.push(make(s, at, r, now));
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime() || a.name.localeCompare(b.name));
}

// Days [from, from + days), each with its doses.
export function dosesByDay(schedules: ScheduleRow[], rows: DoseRow[], from: Date, days: number, now: Date) {
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(startOfDay(from), i);
    return { day, doses: dosesForDay(schedules, rows, day, now) };
  });
}

// Pending and already due (the "Ahora" group); later pending ones are upcoming.
export const isDue = (d: Dose, now: Date) => d.status === 'pending' && d.at.getTime() <= now.getTime();

export type DoseSummary = { given: number; skipped: number; unrecorded: number; pending: number; total: number };
export function summarize(doses: Dose[]): DoseSummary {
  const c = (s: DoseStatus) => doses.filter((d) => d.status === s).length;
  return { given: c('given'), skipped: c('skipped'), unrecorded: c('unrecorded'), pending: c('pending'), total: doses.length };
}

// "1 no se dio · 1 sin registrar · 1 pendiente" (only the non-zero parts).
export function summaryParts(s: Pick<DoseSummary, 'skipped' | 'unrecorded' | 'pending'>): string[] {
  return [
    s.skipped ? (s.skipped === 1 ? '1 no se dio' : `${s.skipped} no se dieron`) : '',
    s.unrecorded ? `${s.unrecorded} sin registrar` : '',
    s.pending ? (s.pending === 1 ? '1 pendiente' : `${s.pending} pendientes`) : '',
  ].filter(Boolean);
}

// "08:00, 14 y 22:00" style input → ['08:00','14:00','22:00']. Tokens H:MM / HH:MM / H,
// separated by commas, spaces or "y". null when empty, invalid or more than 12.
export function parseTimes(text: string): string[] | null {
  const tokens = text
    .toLowerCase()
    .split(/[\s,;]+|\by\b/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tokens.length) return null;
  const out = new Set<string>();
  for (const t of tokens) {
    const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(t);
    if (!m) return null;
    const h = Number(m[1]);
    const mi = m[2] == null ? 0 : Number(m[2]);
    if (h > 23 || mi > 59) return null;
    out.add(`${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`);
  }
  if (out.size > 12) return null;
  return [...out].sort();
}
