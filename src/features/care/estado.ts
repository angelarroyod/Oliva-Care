import { colors } from '@/theme';
import type { IconName } from '@/components/Icon';
import type { DoseRow, EventRow, HandoffRow, PatientRow, ReadingRow, ScheduleRow, Severity, VitalKind } from './types';
import {
  MONTHS, WEEKDAYS, WEEKDAYS_SHORT, WEEKDAY_LETTERS, addDays, cap, hhmm, lc, localDate, relativeDay, sameDay, startOfWeek,
} from './clock';
import { ORDER, VITALS, alertFor, fmt, glucoseRangeIndex, isFever, part, rangesFor, valueText, type Plan } from './vitals';
import { dosesForDay, reasonLabel, summarize, type Dose } from './doses';
import type { Fever } from './timeline';
import { nextNurse, shiftKind, shiftStart, type Nurse } from './shifts';

// Read model for the family "Estado" dashboard: today (tiles, "Lo que debes
// saber", latest vitals) and this week (medication strip, trends, summary).
export type Line = { icon: IconName; ink: string; text: string };

const byTime = (a: { taken_at: string }, b: { taken_at: string }) => new Date(a.taken_at).getTime() - new Date(b.taken_at).getTime();
const stripDot = (s: string) => s.trim().replace(/[.\s]+$/, '');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
// "de Elena" / "del paciente" (useCare's fallback short name)
const de = (short: string) => (short === 'el paciente' ? 'del paciente' : `de ${short}`);

// ---------- hero ----------
export function hero(i: {
  patient: PatientRow | null;
  short: string;
  fever: Fever;
  nurse: Nurse | null; // on shift now
  nurses: Nurse[];
  handoffs: HandoffRow[];
  now: Date;
}) {
  const { short, fever, nurse: n } = i;
  const status = fever ? 'Necesita atención · en casa' : `${cap(i.patient?.status?.trim() || 'Estable')} · en casa`;
  const headline = fever ? `${cap(short)} tiene fiebre. Ya está recibiendo atención.` : `Todo tranquilo con ${short}.`;
  let caregiver: string;
  if (fever) {
    const act = fever.called ? 'ya avisó al médico.' : 'va a avisar al médico.';
    caregiver = n ? `${n.short} está con ${short} y ${act}` : `La enfermera ${act}`;
  } else if (!n) {
    caregiver = 'Ahora no hay ninguna enfermera de turno.';
  } else {
    const since = shiftStart(n, i.now).getTime();
    const done = i.handoffs.some((h) => h.nurse_id === n.id && !!h.ended_at && new Date(h.ended_at).getTime() >= since);
    const next = done ? nextNurse(i.nurses, n.id) : null;
    const kind = shiftKind(n);
    caregiver = next
      ? `${next.short} ya tiene el resumen del turno de ${n.short}.`
      : kind
        ? `${n.short}, su enfermera de ${kind}, está con ${short} desde las ${n.start}.`
        : `${n.short}, su enfermera, está con ${short}.`;
  }
  return { status, headline, caregiver };
}

// ---------- today ----------
// `doses` and `readings` are today's only.
export function todayTiles(doses: Dose[], readings: ReadingRow[]) {
  const s = summarize(doses);
  const med: Line[] = [];
  if (s.skipped) med.push({ icon: 'ban', ink: colors.warnInk, text: s.skipped === 1 ? '1 no se dio' : `${s.skipped} no se dieron` });
  if (s.unrecorded) med.push({ icon: 'clock', ink: colors.ink2, text: `${s.unrecorded} sin registrar` });
  if (s.pending) med.push({ icon: 'clock', ink: colors.pri, text: s.pending === 1 ? '1 pendiente' : `${s.pending} pendientes` });
  if (!med.length && s.total) med.push({ icon: 'check', ink: colors.ok, text: 'Todas dadas' });

  const controls = new Set(readings.map((r) => r.control_id)).size;
  const al = readings.filter((r) => r.severity === 'alert').length;
  const wn = readings.filter((r) => r.severity === 'warn').length;
  const vit: Line[] = [];
  if (al) vit.push({ icon: 'alert', ink: colors.danger, text: al === 1 ? '1 alerta' : `${al} alertas` });
  if (wn) vit.push({ icon: 'warn', ink: colors.warnInk, text: `${wn} fuera de rango` });
  if (!vit.length && controls) vit.push({ icon: 'check', ink: colors.ok, text: 'Todo normal' });

  return { med: { given: s.given, total: s.total, lines: med }, vitals: { controls, lines: vit } };
}

export type KnowTone = 'alert' | 'warn' | 'unrec' | 'ok';
export type Know = { tone: KnowTone; lead: string; text: string };
const RANK: Record<KnowTone, number> = { alert: 0, warn: 1, unrec: 2, ok: 3 };

// The part of the range a reading is judged against (glucose by context, bp
// by whichever of systolic / diastolic is out).
function rangePart(plan: Plan, r: ReadingRow): number[] | undefined {
  const rr = rangesFor(plan, r.kind);
  if (r.kind === 'glucose') return rr[glucoseRangeIndex(r.context)];
  if (r.kind === 'bp' && rr[0] && Number(r.value) >= rr[0][0] && Number(r.value) <= rr[0][1]) return rr[1];
  return rr[0];
}

// "Lo que debes saber": today's exceptions, alert → warn → unrecorded; "Todo en orden" when none.
export function knows(i: {
  fever: Fever;
  readings: ReadingRow[]; // today
  events: EventRow[];
  doses: Dose[]; // today
  plan: Plan;
  short: string;
  nurse: Nurse | null; // on shift now
  now: Date;
}): Know[] {
  const out: Know[] = [];
  const who = i.nurse?.short;
  if (i.fever) {
    const act = i.fever.called ? 'ya avisó al médico.' : 'va a avisar al médico.';
    out.push({
      tone: 'alert', lead: 'Importante:',
      text: `tiene fiebre (${fmt('temp', i.fever.temp)} °C a las ${hhmm(i.fever.at)}). ${who ?? 'La enfermera'} ${act}`,
    });
  }
  const sorted = [...i.readings].sort((a, b) => byTime(a, b) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  for (const r of sorted) {
    if (r.severity === 'ok') continue;
    if (i.fever && r.kind === 'temp' && isFever(Number(r.value))) continue;
    const t = valueText(r.kind, Number(r.value), r.value2 == null ? null : Number(r.value2), r.context);
    const rp = rangePart(i.plan, r);
    const note = i.readings.find((x) => x.control_id === r.control_id && x.note?.trim())?.note?.trim();
    const alert = r.severity === 'alert';
    out.push({
      tone: r.severity, lead: alert ? 'Importante:' : 'Para saber:',
      text: `${lc(t.label)} ${t.value} a las ${hhmm(new Date(r.taken_at))}, ${alert ? 'muy lejos de lo normal' : 'fuera de lo normal'} para ${i.short}${rp ? ` (${part(r.kind, rp)})` : ''}.${note ? ` ${note}` : ''}`,
    });
  }
  for (const e of i.events) {
    if (e.type !== 'note' || e.severity !== 'warning' || !sameDay(new Date(e.occurred_at), i.now)) continue;
    const body = stripDot(e.body || e.title || 'A vigilar');
    out.push({ tone: 'warn', lead: 'Para saber:', text: `${body} (anotado a las ${hhmm(new Date(e.occurred_at))}).` });
  }
  for (const d of i.doses) {
    if (d.status === 'skipped') {
      const note = stripDot(d.row?.skip_note ?? '');
      out.push({
        tone: 'warn', lead: 'Para saber:',
        text: `${d.name} de las ${d.time} no se dio. Motivo: ${lc(reasonLabel(d.row?.skip_reason))}${note ? `. ${note}` : ''}.`,
      });
    } else if (d.status === 'unrecorded') {
      out.push({
        tone: 'unrec', lead: 'Sin registrar:',
        text: `nadie anotó si se dio ${d.name} de las ${d.time}. Puedes preguntárselo a ${who ?? 'la enfermera'}.`,
      });
    }
  }
  if (!out.length) out.push({ tone: 'ok', lead: 'Todo en orden:', text: 'hoy no hay nada fuera de lo normal.' });
  return out.sort((a, b) => RANK[a.tone] - RANK[b.tone]);
}

export type VitalTile = { kind: VitalKind; label: string; value: string; unit: string; sev: Severity; time: string };

// Latest reading of each kind today, in ORDER.
export function latestVitals(readings: ReadingRow[]): VitalTile[] {
  const latest = new Map<VitalKind, ReadingRow>();
  for (const r of [...readings].sort(byTime)) latest.set(r.kind, r);
  return ORDER.filter((k) => latest.has(k)).map((k) => {
    const r = latest.get(k)!;
    const v = Number(r.value);
    return {
      kind: k,
      label: VITALS[k].short + (k === 'glucose' && r.context === 'fasting' ? ' en ayunas' : ''),
      value: k === 'bp' ? `${fmt(k, v)}/${r.value2 == null ? '–' : fmt(k, Number(r.value2))}` : fmt(k, v),
      unit: k === 'pain' ? 'de 10' : VITALS[k].unit,
      sev: r.severity,
      time: hhmm(new Date(r.taken_at)),
    };
  });
}

// ---------- this week: medication ----------
export type DayState = 'ok' | 'skipped' | 'unrec' | 'pending' | 'none' | 'future';
export type WeekDay = { day: Date; key: string; letter: string; n: number; today: boolean; state: DayState; aria: string };
export type Exception = { text: string; st: string; skipped: boolean };

export function weekMeds(schedules: ScheduleRow[], rows: DoseRow[], now: Date) {
  const today = localDate(now);
  let given = 0, skipped = 0, unrecorded = 0;
  const exceptions: Exception[] = [];
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(startOfWeek(now), i);
    const key = localDate(day);
    const full = `${WEEKDAYS[day.getDay()]} ${day.getDate()}`;
    const base = { day, key, letter: WEEKDAY_LETTERS[day.getDay()], n: day.getDate(), today: key === today };
    if (key > today) return { ...base, state: 'future' as const, aria: `${full}: aún no ha llegado` };
    const doses = dosesForDay(schedules, rows, day, now);
    const s = summarize(doses);
    given += s.given;
    skipped += s.skipped;
    unrecorded += s.unrecorded;
    for (const d of doses) {
      if (d.status !== 'skipped' && d.status !== 'unrecorded') continue;
      const sk = d.status === 'skipped';
      exceptions.push({
        text: `${cap(WEEKDAYS_SHORT[day.getDay()])} ${day.getDate()} · ${d.name} ${d.time}`,
        st: sk ? `no se dio: ${lc(reasonLabel(d.row?.skip_reason))}` : 'sin registrar',
        skipped: sk,
      });
    }
    const [state, w]: [DayState, string] = s.skipped
      ? ['skipped', s.skipped === 1 ? '1 dosis no se dio' : `${s.skipped} dosis no se dieron`]
      : s.unrecorded
        ? ['unrec', `${s.unrecorded} sin registrar`]
        : s.pending
          ? ['pending', 'en curso']
          : s.total
            ? ['ok', 'todas las dosis dadas']
            : ['none', 'sin dosis'];
    return { ...base, state, aria: `${full}${base.today ? ', hoy' : ''}: ${w}. Ver historial` };
  });
  // Pending doses of today don't count yet (prototype: given of given+skipped+unrecorded).
  const sub = [skipped ? (skipped === 1 ? '1 no se dio' : `${skipped} no se dieron`) : '', unrecorded ? `${unrecorded} sin registrar` : '']
    .filter(Boolean)
    .join(' · ');
  return { days, given, total: given + skipped + unrecorded, sub, exceptions };
}

// ---------- this week: trends ----------
export type TrendStatus = 'ok' | 'warn' | 'alert' | 'empty';
// Judged on every reading of the kind with its stored severity (bp: worse of
// systolic / diastolic; glucose: its own context range), not only the plotted value.
type WeekStats = { days: number; outDays: number; out: ReadingRow[]; alerts: ReadingRow[] };
export type Trend = {
  kind: VitalKind;
  title: string;
  status: TrendStatus;
  word: string;
  summary: string;
  compare: string;
  bandLabel: string;
  points: (number | null)[];
  band: [number, number];
  alertBand: [number, number];
  domain: [number, number];
  weeks: string[];
  emptyText: string;
  subject: string; // "La presión", for the week summary
  week: WeekStats; // this week
};

export const TREND_DAYS = 28;
export const EMPTY_TREND = 'Aún no hay suficientes lecturas. Con 3 días de registros verás aquí cómo va.';

const TRENDS: { kind: VitalKind; title: string; pick: 'max' | 'last'; subject: string; noun: string }[] = [
  { kind: 'bp', title: 'Presión (máxima)', pick: 'max', subject: 'La presión', noun: 'presión' },
  { kind: 'glucose', title: 'Glucosa antes de cenar', pick: 'last', subject: 'La glucosa', noun: 'glucosa' },
  { kind: 'pain', title: 'Dolor', pick: 'max', subject: 'El dolor', noun: 'dolor' },
  { kind: 'hr', title: 'Pulso', pick: 'last', subject: 'El pulso', noun: 'pulso' },
];

// One plotted value per day for 4 Monday-based weeks ending this Sunday. bp /
// pain: daily max; pulse: last; glucose: last before-meal reading, else the last
// fasting / no-context one. Bedtime and after-meal readings use the other range
// than the drawn band, so they're never plotted.
function dailyPoints(rows: ReadingRow[], kind: VitalKind, pick: 'max' | 'last', first: Date): (number | null)[] {
  const byDay = new Map<string, ReadingRow[]>();
  for (const r of rows) {
    const k = localDate(new Date(r.taken_at));
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  }
  return Array.from({ length: TREND_DAYS }, (_, i) => {
    let day = byDay.get(localDate(addDays(first, i))) ?? [];
    if (kind === 'glucose') {
      const pre = day.filter((r) => r.context === 'pre_meal');
      day = pre.length ? pre : day.filter((r) => glucoseRangeIndex(r.context) === 0);
    }
    if (!day.length) return null;
    const r = pick === 'max' ? day.reduce((a, b) => (Number(b.value) > Number(a.value) ? b : a)) : day[day.length - 1];
    return Number(r.value);
  });
}

const offBy = (v: number, r?: number[]) => (!r ? 0 : v > r[1] ? v - r[1] : v < r[0] ? v - r[0] : 0);
// Signed distance of a reading from its own range (+ above, − below); bp takes
// whichever of systolic / diastolic is further out.
function deviation(plan: Plan, r: ReadingRow): number {
  const rr = rangesFor(plan, r.kind);
  const v = Number(r.value);
  if (r.kind === 'glucose') return offBy(v, rr[glucoseRangeIndex(r.context)]);
  const d = offBy(v, rr[0]);
  if (r.kind !== 'bp' || r.value2 == null) return d;
  const d2 = offBy(Number(r.value2), rr[1]);
  return Math.abs(d2) > Math.abs(d) ? d2 : d;
}

const dayCount = (rows: ReadingRow[]) => new Set(rows.map((r) => localDate(new Date(r.taken_at)))).size;
function weekStats(rows: ReadingRow[], from: Date): WeekStats {
  const a = from.getTime();
  const b = addDays(from, 7).getTime();
  const wk = rows.filter((r) => {
    const t = new Date(r.taken_at).getTime();
    return t >= a && t < b;
  });
  const out = wk.filter((r) => r.severity !== 'ok');
  return { days: dayCount(wk), outDays: dayCount(out), out, alerts: wk.filter((r) => r.severity === 'alert') };
}

export function trends(readings: ReadingRow[], plan: Plan, short: string, now: Date): Trend[] {
  const monday = startOfWeek(now);
  const first = addDays(monday, -21);
  const weeks = [0, 7, 14].map((d) => {
    const m = addDays(first, d);
    return `${m.getDate()} ${MONTHS[m.getMonth()].slice(0, 3)}`;
  }).concat('Esta semana');
  const sorted = [...readings].sort(byTime);

  return TRENDS.map((t) => {
    const rows = sorted.filter((r) => r.kind === t.kind);
    const points = dailyPoints(rows, t.kind, t.pick, first);
    const band = rangesFor(plan, t.kind)[0] as [number, number];
    const alertBand = alertFor(plan, t.kind);
    const cur = weekStats(rows, monday);
    const prev = weekStats(rows, addDays(monday, -7));

    const vals = points.filter((v): v is number => v != null);
    const lo = Math.min(band[0], ...vals);
    const hi = Math.max(band[1], ...vals);
    const pad = Math.max(1, (hi - lo) * 0.15);
    const domain: [number, number] = t.kind === 'pain' ? [0, 10] : [Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)];
    const bandLabel = t.kind === 'pain'
      ? `Aceptable para ${short} (${part(t.kind, band)})`
      : `Rango ${de(short)} (${part(t.kind, band)})`;
    const base = { kind: t.kind, title: t.title, bandLabel, points, band, alertBand, domain, weeks, emptyText: EMPTY_TREND, subject: t.subject, week: cur };

    if (vals.length < 3) return { ...base, status: 'empty' as const, word: '', summary: '', compare: '' };

    const status: TrendStatus = cur.alerts.length ? 'alert' : cur.out.length ? 'warn' : 'ok';
    const high = cur.out.filter((r) => deviation(plan, r) > 0).length * 2 >= cur.out.length;
    const word = !cur.days
      ? ''
      : status === 'alert'
        ? plural(cur.alerts.length, 'alerta', 'alertas')
        : status === 'warn'
          ? `${plural(cur.outDays, 'día', 'días')} con ${high ? 'más' : 'menos'} ${t.noun}`
          : prev.out.length ? 'Más estable' : 'Estable';

    let summary: string;
    if (!cur.days) summary = 'Esta semana aún no hay lecturas.';
    else if (status === 'ok') summary = 'Esta semana, todas las lecturas dentro de su rango.';
    else {
      const dist = (r: ReadingRow) => Math.abs(deviation(plan, r));
      const worst = (status === 'alert' ? cur.alerts : cur.out).reduce((a, b) => (dist(b) > dist(a) ? b : a));
      const v = Number(worst.value);
      const val = t.kind === 'bp'
        ? valueText('bp', v, worst.value2 == null ? null : Number(worst.value2)).value
        : t.kind === 'pain' ? `${fmt(t.kind, v)} de 10` : fmt(t.kind, v);
      const at = new Date(worst.taken_at);
      summary = `${cap(relativeDay(at, now))} a las ${hhmm(at)} llegó a ${val}.${
        cur.outDays > 1 ? ` En total, ${cur.outDays} días fuera de su rango.` : ' El resto de días, dentro de su rango.'
      }`;
    }

    const compare = !prev.days
      ? 'La semana pasada no hubo lecturas.'
      : !prev.out.length
        ? cur.out.length ? 'La semana pasada, todas las lecturas dentro de su rango.' : 'Igual que la semana pasada.'
        : `La semana pasada hubo ${plural(prev.out.length, 'lectura', 'lecturas')} fuera de su rango.${cur.days && !cur.out.length ? ' Esta semana, ninguna.' : ''}`;

    return { ...base, status, word, summary, compare };
  });
}

// "La presión se mantuvo en su rango toda la semana. La glucosa tuvo una alerta el jueves. Medicación: 24 de 27 dosis dadas."
export function weekSummary(ts: Trend[], med: { given: number; total: number }, now: Date) {
  const parts = ts
    .filter((t) => t.week.days > 0)
    .map(({ subject, week: w }) => {
      if (w.alerts.length === 1) return `${subject} tuvo una alerta ${relativeDay(new Date(w.alerts[0].taken_at), now)}.`;
      if (w.alerts.length > 1) return `${subject} tuvo ${w.alerts.length} alertas esta semana.`;
      if (w.out.length) return `${subject} estuvo fuera de su rango ${w.out.length === 1 ? 'una vez' : `${w.out.length} veces`}.`;
      return `${subject} se mantuvo en su rango toda la semana.`;
    });
  if (med.total) parts.push(`Medicación: ${med.given} de ${med.total} dosis dadas.`);
  return parts.length ? parts.join(' ') : 'Aún no hay registros esta semana.';
}
