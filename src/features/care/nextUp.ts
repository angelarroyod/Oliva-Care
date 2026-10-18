import type { EventRow, HandoffRow, ReadingRow, ScheduleRow, DoseRow } from './types';
import { dosesByDay, isDue, reasonLabel, type Dose } from './doses';
import { FEVER_C, VITALS, fmt, isFever, routineKinds, valueText, type Plan } from './vitals';
import { cap, hhmm, lc, listY, relativeDay, sameDay, startOfDay } from './clock';
import { shiftKind, type Nurse } from './shifts';
import { eventsForDay, isNoteEvent, type Fever, type Names, type TimelineEvent } from './timeline';

// Pure builders for the nurse's Inicio hero ("Lo siguiente") and the Relevo
// screen (resumen, a vigilar, "Para {next}", "Lo que va de turno").
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Doses of every local day touching [from, to], chronological.
export function dosesSpan(schedules: ScheduleRow[], rows: DoseRow[], from: Date, to: Date, now: Date): Dose[] {
  const days = Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY) + 1;
  return dosesByDay(schedules, rows, from, Math.max(1, days), now).flatMap((d) => d.doses);
}

// My handoff for the shift that started at `start`, if any.
export const myHandoff = (handoffs: HandoffRow[], meId: string, start: Date) =>
  handoffs.find((h) => h.nurse_id === meId && new Date(h.ended_at ?? h.started_at ?? 0).getTime() >= start.getTime()) ?? null;

// "Fiebre de 38,2 °C a las 23:40"
export const feverText = (f: NonNullable<Fever>) => `Fiebre de ${fmt('temp', f.temp)} °C a las ${hhmm(f.at)}`;

// "al médico" / "al Dr. Méndez" / "a la Dra. Ruiz" / "a Javier Méndez"
export function doctorRef(name: string | null | undefined) {
  const n = name?.trim();
  if (!n) return 'al médico';
  if (/^dra\.?\s/i.test(n)) return `a la ${n}`;
  if (/^dr\.?\s/i.test(n)) return `al ${n}`;
  return `a ${n}`;
}

// "Control de la noche" / "de la tarde" / "del día"
const controlOf = (kind: ReturnType<typeof shiftKind>) => (kind === 'noche' || kind === 'tarde' ? `de la ${kind}` : 'del día');

// Warning notes ("A vigilar") since the shift started, oldest first. Doctor
// calls are warnings too but belong to the fever line, not here.
export const watchNotes = (events: EventRow[], start: Date) =>
  events
    .filter((e) => isNoteEvent(e) && e.type !== 'doctor_call' && e.severity === 'warning' && new Date(e.occurred_at).getTime() >= start.getTime())
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

// ---------------------------------------------------------------- hero
export type HeroKind = 'fever' | 'dose' | 'vitals' | 'handoff' | 'done';
export type Hero = { kind: HeroKind; eyebrow: string; title: string; sub: string; cta: string };

export function heroNext(input: {
  now: Date;
  me: Nurse | null;
  meId: string;
  myFirst: string;
  next: Nurse | null;
  start: Date; // my shift start
  fever: Fever;
  doses: Dose[]; // the days around my shift (dosesSpan)
  readings: ReadingRow[];
  events: EventRow[];
  handoffs: HandoffRow[];
  plan: Plan;
  doctor: string | null;
}): Hero {
  const { now, me, start, fever } = input;
  const eyebrow = 'LO SIGUIENTE';

  if (fever && !fever.called) {
    const to = doctorRef(input.doctor);
    const notes = watchNotes(input.events, start);
    const note = notes[notes.length - 1];
    return {
      kind: 'fever',
      eyebrow: 'AVISA AL MÉDICO',
      title: feverText(fever),
      sub: note
        ? `Llama ${to} y cuéntale también la nota de las ${hhmm(new Date(note.occurred_at))}.`
        : `Llama ${to} para avisarle de la fiebre.`,
      cta: `Llamar ${to}`,
    };
  }

  const due = input.doses.find((d) => isDue(d, now));
  if (due) {
    const mins = Math.max(0, Math.round((now.getTime() - due.at.getTime()) / 60_000));
    return {
      kind: 'dose',
      eyebrow,
      title: `Dar ${due.name} ${due.dose}`.trim(),
      sub: `Tocaba a las ${due.time}, hace ${mins} min. Si no se puede dar, anota por qué.`,
      cta: 'Ir a medicación',
    };
  }

  const routine = routineKinds(input.plan);
  const controlled = input.readings.some((r) => new Date(r.taken_at).getTime() >= start.getTime());
  if (!controlled && routine.length) {
    const n = routine.length;
    return {
      kind: 'vitals',
      eyebrow,
      title: `Control ${controlOf(me ? shiftKind(me) : null)}: ${n} ${n === 1 ? 'signo' : 'signos'}`,
      sub: `${cap(listY(routine.map((k) => lc(VITALS[k].short))))}, según su plan.`,
      cta: 'Registrar signos',
    };
  }

  if (!myHandoff(input.handoffs, input.meId, start)) {
    return {
      kind: 'handoff',
      eyebrow,
      title: `Entregar el turno${input.next ? ` a ${input.next.short}` : ''}${me?.end ? ` a las ${me.end}` : ''}`,
      sub: 'El resumen se va preparando con lo que anotas.',
      cta: 'Preparar relevo',
    };
  }

  return {
    kind: 'done',
    eyebrow,
    title: 'Todo al día',
    sub: input.myFirst ? `Turno entregado. Buen descanso, ${input.myFirst}.` : 'Turno entregado. Buen descanso.',
    cta: 'Ver relevo',
  };
}

// ---------------------------------------------------------------- relevo
export type WatchItem = { text: string; short: string };

export function handoffBrief(input: {
  now: Date;
  start: Date; // my shift start
  end: Date | null; // my shift end (null = no fixed shift)
  fever: Fever;
  doses: Dose[]; // dosesSpan(startOfDay(start) … end + 2 h)
  readings: ReadingRow[];
  events: EventRow[];
}) {
  const { now, start, fever } = input;
  const t0 = start.getTime();

  const watch: WatchItem[] = [];
  if (fever) watch.push({ text: `${feverText(fever)}.`, short: 'fiebre' });
  for (const e of watchNotes(input.events, start)) {
    const time = hhmm(new Date(e.occurred_at));
    watch.push({ text: `A las ${time}: ${e.body?.trim() || e.title?.trim() || 'A vigilar'}`, short: `nota de las ${time}` });
  }
  for (const r of input.readings) {
    if (r.severity === 'ok' || new Date(r.taken_at).getTime() < t0) continue;
    if (fever && r.kind === 'temp' && isFever(Number(r.value))) continue; // already the fever line
    const v = valueText(r.kind, Number(r.value), r.value2 == null ? null : Number(r.value2), r.context);
    const time = hhmm(new Date(r.taken_at));
    watch.push({
      text: `${v.label} ${v.value} a las ${time}: ${r.severity === 'alert' ? 'muy fuera de lo normal' : 'fuera de lo normal'}.`,
      short: `${lc(v.label)} de las ${time}`,
    });
  }

  const n = watch.length;
  const things = `${n} ${n === 1 ? 'cosa' : 'cosas'} a vigilar`;
  const summary = fever
    ? `Turno con fiebre. Hay ${things}.`
    : n ? `Turno tranquilo por ahora. Hay ${things}.` : 'Turno tranquilo por ahora. Nada a vigilar.';
  const watchLine = n ? `${cap(things)}: ${listY(watch.map((w) => w.short))}` : 'Nada a vigilar';

  const ref = input.end ?? now;
  const upTo = ref.getTime() + 2 * HOUR;
  // A night shift spans two days: name the day when it is not today, so
  // yesterday's 06:00 never reads like today's 06:00.
  const when = (d: Dose) => `de las ${d.time}${sameDay(d.at, now) ? '' : ` de ${relativeDay(d.at, now)}`.replace(' de el ', ' del ')}`;
  const para = [
    ...(fever ? [fever.called ? 'El médico ya está avisado por la fiebre.' : `Avisar al médico por la fiebre de ${fmt('temp', fever.temp)} °C.`] : []),
    ...input.doses.filter((d) => isDue(d, now)).map((d) => `${d.name} ${d.dose} de las ${d.time}: aún sin dar.`),
    ...input.doses
      .filter((d) => d.status === 'skipped' && d.at.getTime() >= t0)
      .map((d) => `${d.name} ${when(d)}: no se dio (${lc(reasonLabel(d.row?.skip_reason))}).`),
    ...input.doses.filter((d) => d.status === 'unrecorded').map((d) => `${d.name} ${when(d)}: sigue sin registrar. Confirmar si se dio.`),
    // Upcoming = not yet due; a due dose is already listed as "aún sin dar".
    ...input.doses
      .filter((d) => d.status === 'pending' && !isDue(d, now) && d.at.getTime() >= ref.getTime() && d.at.getTime() < upTo)
      .map((d) => `Dar ${d.name} ${d.dose} a las ${d.time}.`),
    fever ? 'Tomar la temperatura cada 2 horas.' : `Avisar al médico si aparece fiebre (más de ${fmt('temp', FEVER_C)} °C).`,
  ];

  // What the family and the next nurse read in Historial.
  const record = [summary, ...watch.map((w) => w.text)].join(' ');
  return { summary, watch, watchLine, para, record };
}

// "Lo que va de turno": everything since my shift started, oldest first. My own
// handoff is the result of this screen, not part of the shift.
export type LogItem = { id: string; title: string; time: string; body: string; warn: boolean };
const OUT_OF_RANGE: Record<string, string> = { warn: ' Fuera de lo normal.', alert: ' Muy fuera de lo normal.' };

export function shiftLog(input: {
  now: Date;
  start: Date;
  meId: string;
  doses: Dose[];
  readings: ReadingRow[];
  events: EventRow[];
  handoffs: HandoffRow[];
  names: Names;
  nurses: Nurse[];
}): LogItem[] {
  const { now, start } = input;
  const handoffs = input.handoffs.filter((h) => h.nurse_id !== input.meId);
  const out: TimelineEvent[] = [];
  for (let day = startOfDay(start); day.getTime() <= now.getTime(); day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    out.push(
      ...eventsForDay({
        day, now, readings: input.readings, events: input.events, handoffs, names: input.names, nurses: input.nurses,
        doses: input.doses.filter((d) => sameDay(d.at, day)),
      }),
    );
  }
  return out
    .filter((e) => e.at.getTime() >= start.getTime() && e.at.getTime() <= now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((e) => ({
      id: e.id,
      title: e.title,
      time: e.time,
      warn: ['warn', 'alert', 'skipped', 'unrecorded'].includes(e.status),
      body:
        // The warn dot is never the only cue: out-of-range controls and
        // custom-titled warning notes carry the word too.
        e.kind === 'vitals'
          ? `${e.values.map((v) => `${v.label} ${v.value}`).join(', ')}.${OUT_OF_RANGE[e.status] ?? ''}${e.detail ? ` ${e.detail}` : ''}`
          : e.kind === 'med'
            ? e.status === 'given' ? `Dada${e.who ? ` por ${e.who}` : ''}.`
              : e.status === 'skipped' ? `No se dio: ${lc(e.reason)}.`
                : e.status === 'pending' ? 'Aún sin dar.' : 'Sin registrar.'
            : e.status === 'warn' && e.title !== 'A vigilar' ? `A vigilar.${e.detail ? ` ${e.detail}` : ''}` : e.detail,
    }));
}
