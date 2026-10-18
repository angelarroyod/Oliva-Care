import type { EventRow, HandoffRow, ReadingRow, Severity } from './types';
import type { Dose } from './doses';
import { REMIND_AGAIN_MIN, reasonLabel, summaryParts } from './doses';
import { ORDER, isFever, valueText, worse } from './vitals';
import { MINUTE, fromMin, hhmm, sameDay, toMin } from './clock';
import { nextNurse, onShift, type Nurse } from './shifts';

// Read model for Historial, Relevo ("Lo que va de turno") and Estado: one list
// of events per day built from doses, vital readings, notes and handoffs.
export type EventKind = 'med' | 'vitals' | 'note' | 'handoff';
export type EventStatus = 'given' | 'skipped' | 'unrecorded' | 'pending' | 'ok' | 'warn' | 'alert' | 'info';
export type ValueChip = { label: string; value: string; status: Severity };

export type TimelineEvent = {
  id: string;
  kind: EventKind;
  status: EventStatus;
  at: Date;
  time: string; // 'HH:MM'
  title: string;
  who: string; // full name, '' when nobody
  detail: string;
  reason: string;
  values: ValueChip[];
};

export type Names = (profileId: string | null | undefined) => string;
export const namesFrom = (team: { profile_id: string; profiles: { full_name: string } | null }[]): Names => {
  const m = new Map(team.map((t) => [t.profile_id, t.profiles?.full_name?.trim() ?? '']));
  return (id) => (id ? m.get(id) || '' : '');
};

// Legacy care_events written by the old Signos/Medicación screens duplicate the
// migrated readings/doses, so only notes and doctor calls are shown.
export const isNoteEvent = (e: EventRow) => e.type !== 'vitals' && e.type !== 'medication';

export function doseEvent(d: Dose, names: Names, nurses: Nurse[], now: Date): TimelineEvent {
  const base = {
    id: `med:${d.key}`, kind: 'med' as const, at: d.at, time: d.time, title: `${d.name} ${d.dose}`.trim(),
    who: '', reason: '', detail: '', values: [] as ValueChip[],
  };
  if (d.status === 'given') {
    const at = d.row?.recorded_at ? new Date(d.row.recorded_at) : null;
    const detail = d.row?.recorded_late && at
      ? `Anotada más tarde, a las ${hhmm(at)}.`
      : at && hhmm(at) !== d.time ? `Dada a las ${hhmm(at)}.` : '';
    return { ...base, status: 'given', who: names(d.row?.recorded_by), detail };
  }
  if (d.status === 'skipped') {
    const note = d.row?.skip_note?.trim();
    return { ...base, status: 'skipped', who: names(d.row?.recorded_by), reason: `${reasonLabel(d.row?.skip_reason)}${note ? `. ${note}` : ''}` };
  }
  if (d.status === 'unrecorded') {
    const t = fromMin(toMin(d.time) + REMIND_AGAIN_MIN);
    const n = onShift(nurses, t);
    return { ...base, status: 'unrecorded', detail: `Nadie la registró. A las ${t} se avisó otra vez a ${n ? n.short : 'quien estaba de turno'}.` };
  }
  const n = onShift(nurses, d.time);
  const past = d.at.getTime() <= now.getTime();
  return { ...base, status: 'pending', detail: `${past ? 'Tocaba' : 'Toca'} a las ${d.time}.${n ? ` Le toca a ${n.short}.` : ''}` };
}

// One "control" = all readings saved together (same control_id).
export function readingEvents(readings: ReadingRow[], names: Names): TimelineEvent[] {
  const groups = new Map<string, ReadingRow[]>();
  for (const r of readings) groups.set(r.control_id, [...(groups.get(r.control_id) ?? []), r]);
  return [...groups.entries()].map(([id, rows]) => {
    const sorted = [...rows].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
    const at = new Date(Math.min(...rows.map((r) => new Date(r.taken_at).getTime())));
    let status: Severity = 'ok';
    const values = sorted.map((r) => {
      status = worse(status, r.severity);
      return { ...valueText(r.kind, Number(r.value), r.value2 == null ? null : Number(r.value2), r.context), status: r.severity };
    });
    const note = rows.find((r) => r.note?.trim())?.note?.trim() ?? '';
    const notified = rows.some((r) => r.family_notified);
    return {
      id: `vitals:${id}`, kind: 'vitals', status, at, time: hhmm(at), title: 'Signos vitales',
      who: names(rows[0].taken_by), reason: '', values,
      detail: [notified ? 'Se avisó a la familia.' : '', note].filter(Boolean).join(' '),
    };
  });
}

export function noteEvent(e: EventRow, names: Names): TimelineEvent {
  const at = new Date(e.occurred_at);
  const warn = e.severity === 'warning';
  return {
    id: `note:${e.id}`, kind: 'note', status: warn ? 'warn' : 'info', at, time: hhmm(at),
    title: e.title?.trim() || (warn ? 'A vigilar' : 'Nota'), who: names(e.author_id), detail: e.body?.trim() ?? '', reason: '', values: [],
  };
}

export function handoffEvent(h: HandoffRow, names: Names, nurses: Nurse[]): TimelineEvent {
  const at = new Date(h.ended_at ?? h.started_at ?? Date.now());
  const giver = nurses.find((n) => n.id === h.nurse_id);
  const to = h.nurse_id ? nextNurse(nurses, h.nurse_id) : null;
  const giverShort = giver?.short || names(h.nurse_id).split(' ')[0] || 'La enfermera';
  return {
    id: `handoff:${h.id}`, kind: 'handoff', status: 'info', at, time: hhmm(at),
    title: `${giverShort} entregó el turno${to ? ` a ${to.short}` : ''}`, who: names(h.nurse_id), detail: h.summary?.trim() ?? '', reason: '', values: [],
  };
}

// Every event of one local day, newest first.
export function eventsForDay(input: {
  day: Date;
  now: Date;
  doses: Dose[]; // already that day's (dosesForDay)
  readings: ReadingRow[];
  events: EventRow[];
  handoffs: HandoffRow[];
  names: Names;
  nurses: Nurse[];
}): TimelineEvent[] {
  const { day, now, names, nurses } = input;
  const onDay = (iso: string | null | undefined) => !!iso && sameDay(new Date(iso), day);
  return [
    ...input.doses.map((d) => doseEvent(d, names, nurses, now)),
    ...readingEvents(input.readings.filter((r) => onDay(r.taken_at)), names),
    ...input.events.filter((e) => isNoteEvent(e) && onDay(e.occurred_at)).map((e) => noteEvent(e, names)),
    ...input.handoffs.filter((h) => onDay(h.ended_at ?? h.started_at)).map((h) => handoffEvent(h, names, nurses)),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
}

// Day-strip dot: alert > warn (or skipped) > unrecorded > ok; 'empty' with no events.
export type DayStatus = 'alert' | 'warn' | 'unrec' | 'ok' | 'empty';
export function dayStatus(events: TimelineEvent[]): DayStatus {
  if (!events.length) return 'empty';
  if (events.some((e) => e.status === 'alert')) return 'alert';
  if (events.some((e) => e.status === 'warn' || e.status === 'skipped')) return 'warn';
  if (events.some((e) => e.status === 'unrecorded')) return 'unrec';
  return 'ok';
}
export const DAY_WORD: Record<DayStatus, string> = {
  alert: 'con alertas', warn: 'algo a revisar', unrec: 'algo sin registrar', ok: 'todo normal', empty: 'sin registros',
};

// Day summary lines (pill / pulse icons in Historial).
export function daySummary(events: TimelineEvent[]) {
  const meds = events.filter((e) => e.kind === 'med');
  const vits = events.filter((e) => e.kind === 'vitals');
  const count = (s: EventStatus) => meds.filter((e) => e.status === s).length;
  const parts = summaryParts({ skipped: count('skipped'), unrecorded: count('unrecorded'), pending: count('pending') });
  const vals = (s: Severity) => vits.reduce((n, e) => n + e.values.filter((v) => v.status === s).length, 0);
  const al = vals('alert');
  const wn = vals('warn');
  return {
    meds: `${count('given')} de ${meds.length} dosis dadas${parts.length ? ` · ${parts.join(' · ')}` : ''}`,
    vitals: `${vits.length} ${vits.length === 1 ? 'control' : 'controles'} de signos${al ? ` · ${al} ${al === 1 ? 'alerta' : 'alertas'}` : ''}${wn ? ` · ${wn} fuera de rango` : ''}`,
  };
}

export type HistoryFilter = 'all' | 'med' | 'vitals' | 'notes';
export const FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'med', label: 'Medicación' },
  { id: 'vitals', label: 'Signos' },
  { id: 'notes', label: 'Notas y relevos' },
];
export const filterEvents = (events: TimelineEvent[], f: HistoryFilter) =>
  f === 'all' ? events : events.filter((e) => (f === 'notes' ? e.kind === 'note' || e.kind === 'handoff' : e.kind === f));

// Fever path: the latest temperature reading (last 24 h) is above 37.5 °C.
// "called" once a doctor_call care_event exists after that reading.
export type Fever = { temp: number; at: Date; called: boolean } | null;
export function feverState(readings: ReadingRow[], events: EventRow[], now: Date): Fever {
  const since = now.getTime() - 24 * 60 * MINUTE;
  const temps = readings
    .filter((r) => r.kind === 'temp' && new Date(r.taken_at).getTime() >= since)
    .sort((a, b) => new Date(b.taken_at).getTime() - new Date(a.taken_at).getTime());
  const last = temps[0];
  if (!last || !isFever(Number(last.value))) return null;
  const at = new Date(last.taken_at);
  const called = events.some((e) => e.type === 'doctor_call' && new Date(e.occurred_at).getTime() >= at.getTime());
  return { temp: Number(last.value), at, called };
}
