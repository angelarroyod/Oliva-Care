import { useMemo, useState } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, PageHeader } from '@/components/Screen';
import { T, H2 } from '@/components/T';
import { Icon, type IconName } from '@/components/Icon';
import { Button } from '@/components/Button';
import { Card, RowLink } from '@/components/Card';
import { ErrorText, Field } from '@/components/Controls';
import { ProgressBar } from '@/components/Status';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { ReasonChip } from '@/components/ReasonChip';
import { useCare, useSince, useSchedules, useDoseRows } from '@/features/care/hooks';
import { isLoaded } from '@/features/care/useLiveList';
import { dosesForDay, isDue, summarize, summaryParts, reasonLabel, SKIP_REASONS, REMIND_AGAIN_MIN, type Dose } from '@/features/care/doses';
import { onShift, reminderTime, shiftStart } from '@/features/care/shifts';
import { MINUTE, addDays, firstName, fromMin, hhmm, lc, listY, localDate, longDate, minutesBetween, shortTime, toMin } from '@/features/care/clock';
import type { ScheduleRow, SkipReason } from '@/features/care/types';
import { supabase } from '@/lib/supabase';
import { lastQueued, mutate, saved, unqueue } from '@/lib/db';
import { failedTo } from '@/lib/errors';
import { colors, radius } from '@/theme';

type Look = {
  card: ViewStyle;
  circle: ViewStyle;
  icon?: IconName;
  iconInk: string;
  state: string;
  stateInk: string;
  line: string;
  lineInk: string;
  give?: { label: string; variant: 'primary' | 'secondary' };
};

const CARD = {
  pending: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.pri },
  unrec: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.field, borderStyle: 'dashed' },
  skipped: { backgroundColor: colors.warnSoft, borderWidth: 2, borderColor: colors.warn },
  given: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
} satisfies Record<string, ViewStyle>;

const CIRCLE = {
  pending: { backgroundColor: colors.surface, borderWidth: 2.5, borderColor: colors.pri, borderStyle: 'dashed' },
  unrec: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.field, borderStyle: 'dashed' },
  skipped: { backgroundColor: colors.warnSoft, borderWidth: 2, borderColor: colors.warn },
  given: { backgroundColor: colors.ok },
} satisfies Record<string, ViewStyle>;

const scheduledRow = (d: Dose) => d.at.toISOString();

export default function NurseMedicacion() {
  const router = useRouter();
  const toast = useToast();
  const { pid, meId, meNurse, short, nurses, names, now } = useCare();
  const since = useSince(1); // a night shift started yesterday
  const schedules = useSchedules(pid);
  const rows = useDoseRows(pid, since);
  const today = localDate(now);
  const todays = useMemo(() => dosesForDay(schedules, rows, now, now), [schedules, rows, now]);
  // Yesterday's late doses (e.g. 23:30 on a 22:00-06:00 shift) stay recordable after
  // midnight: still open, or recorded today, and in this shift or the last 12 h.
  const doses = useMemo(() => {
    const from = Math.min(shiftStart(meNurse, now).getTime(), now.getTime() - 12 * 60 * MINUTE);
    const carried = dosesForDay(schedules, rows, addDays(now, -1), now).filter(
      (d) =>
        d.at.getTime() >= from &&
        (d.status === 'pending' || d.status === 'unrecorded' || (!!d.row?.recorded_at && localDate(new Date(d.row.recorded_at)) === today)),
    );
    return [...carried, ...todays];
  }, [schedules, rows, now, meNurse, todays, today]);
  const sum = summarize(todays);
  const extra = summaryParts(sum).join(' · ');
  const active = schedules.filter((s) => s.active && !s.suspended_at && (!s.end_date || s.end_date >= today));

  const [busy, setBusy] = useState(false);
  const [omit, setOmit] = useState<Dose | null>(null);
  const [reason, setReason] = useState<SkipReason | null>(null);
  const [note, setNote] = useState('');
  const [omitErr, setOmitErr] = useState('');
  const [cardErr, setCardErr] = useState<{ key: string; text: string } | null>(null); // shown on the card that failed

  const schedOf = (d: Dose) => schedules.find((s) => s.id === d.scheduleId) as ScheduleRow;
  const who = (t: string) => onShift(nurses, t)?.short ?? 'quien esté de turno';

  // Recorded offline: the card already shows it, the line says it hasn't gone out.
  const look = (d: Dose): Look => {
    const l = stateLook(d);
    return d.row?.pending ? { ...l, line: `${l.line} Pendiente de enviar.` } : l;
  };

  const stateLook = (d: Dose): Look => {
    const r = d.row;
    if (d.status === 'pending') {
      const s = schedOf(d);
      const rt = reminderTime(d.time, s.reminder_mode, s.reminder_minutes);
      const fired = now.getTime() >= d.at.getTime() - (s.reminder_mode === 'exact' ? 0 : s.reminder_minutes) * MINUTE;
      const due = isDue(d, now);
      return {
        card: CARD.pending, circle: CIRCLE.pending, iconInk: colors.pri,
        state: due ? `Hace ${minutesBetween(d.at, now)} min` : `A las ${d.time}`,
        stateInk: due ? colors.warnInk : colors.ink2,
        line: fired ? `Aviso enviado a ${who(rt)} a las ${rt}.` : `Se avisará a ${who(rt)} a las ${rt}.`,
        lineInk: colors.ink2,
        give: { label: 'Marcar como dada', variant: 'primary' },
      };
    }
    if (d.status === 'unrecorded') {
      const t = fromMin(toMin(d.time) + REMIND_AGAIN_MIN);
      return {
        card: CARD.unrec, circle: CIRCLE.unrec, icon: 'clock', iconInk: colors.ink2,
        state: 'Sin registrar', stateInk: colors.ink2,
        line: `Nadie la registró. A las ${t} se avisó otra vez a ${who(t)}. Si sabes qué pasó, anótalo.`,
        lineInk: colors.ink2,
        give: { label: 'Sí, se dio', variant: 'secondary' },
      };
    }
    const at = hhmm(new Date(r?.recorded_at ?? d.at));
    if (d.status === 'skipped') {
      const extraNote = r?.skip_note?.trim().replace(/[.\s]+$/, '');
      const by = firstName(names(r?.recorded_by ?? null)) || 'el equipo';
      return {
        card: CARD.skipped, circle: CIRCLE.skipped, icon: 'ban', iconInk: colors.warnInk,
        state: 'No se dio', stateInk: colors.warnInk,
        line: `Motivo: ${lc(reasonLabel(r?.skip_reason))}${extraNote ? `. ${extraNote}` : ''}. Lo anotó ${by} a las ${at}.`,
        lineInk: colors.warnInk,
      };
    }
    return {
      card: CARD.given, circle: CIRCLE.given, icon: 'check', iconInk: colors.onPri,
      state: `Dada · ${at}`, stateInk: colors.ok,
      line: `Por ${names(r?.recorded_by ?? null) || 'el equipo'}${r?.recorded_late ? ', anotada más tarde' : ''}.`,
      lineInk: colors.ink2,
    };
  };

  // Back to "por registrar" (pending, or sin registrar once its hour has passed).
  const reset = (d: Dose) =>
    mutate(
      supabase
        .from('medication_doses')
        .update({ status: 'pending', recorded_at: null, recorded_by: null, recorded_late: false, skip_reason: null, skip_note: null })
        .eq('schedule_id', d.scheduleId)
        .eq('scheduled_for', scheduledRow(d))
        .eq('recorded_by', meId), // only my own record: never erase another nurse's
      'medication_doses',
    );
  const undoFailed = (err: string | null) => {
    if (err) toast.show(failedTo('No se pudo deshacer.', err));
  };

  // Someone else recorded it since this card / sheet was opened (realtime updated
  // the list). ponytail: two taps inside realtime latency can still overwrite —
  // a conditional record_dose RPC (update ... where status = 'pending') closes that.
  const takenBy = (d: Dose) => {
    const live = doses.find((x) => x.key === d.key);
    if (!live || live.status === 'pending' || live.status === 'unrecorded') return null;
    return `Ya la anotó ${names(live.row?.recorded_by ?? null) || 'otra persona'}.`;
  };

  // Upsert on (schedule_id, scheduled_for): a dose row may already exist (e.g. after an undo).
  const record = async (d: Dose, fields: Record<string, unknown>, msg: string) => {
    setBusy(true);
    const err = await mutate(
      supabase.from('medication_doses').upsert(
        {
          schedule_id: d.scheduleId,
          patient_id: pid,
          scheduled_for: scheduledRow(d),
          recorded_at: new Date().toISOString(),
          recorded_by: meId,
          recorded_late: d.status === 'unrecorded',
          ...fields,
        },
        { onConflict: 'schedule_id,scheduled_for' },
      ),
      'medication_doses',
    );
    setBusy(false);
    const queued = lastQueued();
    if (!err) toast.show(saved(msg), () => (unqueue(queued) ? undefined : reset(d).then(undoFailed)));
    return err;
  };

  const give = async (d: Dose) => {
    setCardErr(null);
    const taken = takenBy(d);
    if (taken) return setCardErr({ key: d.key, text: taken });
    const msg = d.status === 'unrecorded' ? `${d.name} de las ${d.time} anotada como dada.` : `${d.name} dada a las ${hhmm(new Date())}.`;
    const err = await record(d, { status: 'given', skip_reason: null, skip_note: null }, msg);
    if (err) setCardErr({ key: d.key, text: err });
  };

  // Corregir: a lasting way to fix my own record after the toast has gone. The
  // dose goes back to "por registrar" with its buttons; Deshacer puts the old
  // record back exactly as it was.
  const correct = async (d: Dose) => {
    const prev = d.row;
    if (!prev) return;
    setCardErr(null);
    setBusy(true);
    const err = await reset(d);
    setBusy(false);
    if (err) return setCardErr({ key: d.key, text: err });
    const queued = lastQueued();
    toast.show(saved(`${d.name} de las ${d.time}: registro anulado. Ya puedes anotarla de nuevo.`), async () => {
      if (unqueue(queued)) return;
      const { status, recorded_at, recorded_by, recorded_late, skip_reason, skip_note } = prev;
      undoFailed(
        await mutate(
          supabase.from('medication_doses').upsert(
            { schedule_id: d.scheduleId, patient_id: pid, scheduled_for: scheduledRow(d), status, recorded_at, recorded_by, recorded_late, skip_reason, skip_note },
            { onConflict: 'schedule_id,scheduled_for' },
          ),
          'medication_doses',
        ),
      );
    });
  };

  const openOmit = (d: Dose) => {
    setOmit(d);
    setReason(null);
    setNote('');
    setOmitErr('');
  };

  const saveOmit = async () => {
    if (!omit) return;
    if (!reason) return setOmitErr('Elige un motivo.');
    if (reason === 'other' && !note.trim()) return setOmitErr('Escribe el motivo en la nota.');
    const taken = takenBy(omit);
    if (taken) return setOmitErr(taken);
    const err = await record(
      omit,
      { status: 'skipped', skip_reason: reason, skip_note: note.trim() || null },
      `${omit.name}: anotado que no se dio (${lc(reasonLabel(reason))}).`,
    );
    if (err) setOmitErr(err);
    else setOmit(null);
  };

  const others = nurses.filter((n) => n.id !== meId).map((n) => n.short);
  const groups: [string, Dose[]][] = [
    ['Ahora', doses.filter((d) => isDue(d, now))],
    ['Más tarde', doses.filter((d) => d.status === 'pending' && !isDue(d, now))],
    ['Sin registrar', doses.filter((d) => d.status === 'unrecorded')],
    ['Registradas hoy', doses.filter((d) => d.status === 'given' || d.status === 'skipped')],
  ];

  return (
    <Screen>
      <PageHeader title="Medicación" sub={`${short} · ${longDate(now)}`} onBack={() => router.back()} backLabel="Volver al inicio" size={30} />

      {todays.length ? (
        <Card gap={10}>
          <T size={17} bold>{`${sum.given} de ${sum.total} dosis dadas hoy`}</T>
          <ProgressBar value={sum.given} max={sum.total} label={`${sum.given} de ${sum.total} dosis dadas hoy`} />
          {extra ? <T size={15} color={colors.ink2}>{extra}</T> : null}
        </Card>
      ) : null}

      {groups
        .filter(([, list]) => list.length)
        .map(([title, list]) => (
          <View key={title} style={s.section}>
            <H2>{title}</H2>
            {list.map((d) => (
              <DoseCard
                key={d.key}
                d={d}
                what={`${d.name} de las ${d.time}${localDate(d.at) === today ? '' : ' de ayer'}`}
                look={look(d)}
                busy={busy}
                err={cardErr?.key === d.key ? cardErr.text : null}
                onGive={() => give(d)}
                onSkip={() => openOmit(d)}
                onCorrect={d.row?.recorded_by === meId && (d.status === 'given' || d.status === 'skipped') ? () => correct(d) : undefined}
              />
            ))}
          </View>
        ))}

      {isLoaded(schedules) && !doses.length && !active.length ? (
        <View style={s.empty}>
          <T size={16} color={colors.ink2} lh={1.4}>Aún no hay medicación. Añade la primera con «Añadir medicamento».</T>
        </View>
      ) : null}

      {active.length ? (
        <View style={[s.section, { paddingTop: 6 }]}>
          <H2>Avisos</H2>
          <T size={15} color={colors.ink2} lh={1.4}>Le llegan a quien esté de turno cuando suenan.</T>
          {active.map((sc) => (
            <RowLink
              key={sc.id}
              icon="bell"
              title={[sc.name, sc.dose].filter(Boolean).join(' ')}
              sub={`${listY(sc.times.map(shortTime))} · ${sc.reminder_mode === 'exact' || !sc.reminder_minutes ? 'a la hora exacta' : `${sc.reminder_minutes} min antes`}`}
              onPress={() => router.push(`/nurse/aviso/${sc.id}`)}
            />
          ))}
        </View>
      ) : null}

      <Button label="Añadir medicamento" variant="secondary" icon="plus" onPress={() => router.push('/nurse/pauta-nueva')} />

      <Sheet
        visible={!!omit}
        title="¿Por qué no se dio?"
        sub={omit ? `${[omit.name, omit.dose].filter(Boolean).join(' ')} · ${omit.time}` : undefined}
        onClose={() => setOmit(null)}
      >
        <View accessibilityRole="radiogroup" accessibilityLabel="¿Por qué no se dio?" style={s.reasons}>
          {SKIP_REASONS.map((r) => (
            <ReasonChip
              key={r.id}
              label={r.label}
              selected={reason === r.id}
              onSelect={() => {
                setReason(r.id);
                setOmitErr('');
              }}
            />
          ))}
        </View>
        <Field
          label="Nota"
          optional={reason === 'other' ? '(obligatoria)' : true}
          value={note}
          onChangeText={(v) => {
            setNote(v);
            setOmitErr('');
          }}
          multiline
        />
        {omitErr ? (
          <ErrorText>{omitErr}</ErrorText>
        ) : null}
        <View style={s.info}>
          <Icon name="eye" size={18} color={colors.ink2} />
          <T size={15} color={colors.ink2} lh={1.4} style={{ flex: 1 }}>
            {`${others.length ? listY(others) : 'El equipo'} y la familia lo verán en el historial, con el motivo.`}
          </T>
        </View>
        <Button label="Guardar: no se dio" onPress={saveOmit} disabled={busy} />
      </Sheet>
    </Screen>
  );
}

// `what` names the dose in the button labels, so a screen reader knows which one it records.
function DoseCard({ d, what, look, busy, err, onGive, onSkip, onCorrect }: {
  d: Dose; what: string; look: Look; busy: boolean; err: string | null; onGive: () => void; onSkip: () => void; onCorrect?: () => void;
}) {
  return (
    <View style={[s.card, look.card]}>
      <View style={s.top}>
        <View style={[s.circle, look.circle]}>
          {look.icon ? <Icon name={look.icon} size={18} color={look.iconInk} strokeWidth={2.6} /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T size={17} bold>
            {d.name}
            {d.dose ? <T size={17} color={colors.ink2}>{` ${d.dose}`}</T> : null}
          </T>
          {d.purpose ? <T size={15} color={colors.ink2}>{d.purpose}</T> : null}
        </View>
        <View style={s.right}>
          <T size={17} bold style={s.num}>{d.time}</T>
          <T size={14} bold color={look.stateInk}>{look.state}</T>
        </View>
      </View>
      <T size={15} lh={1.4} color={look.lineInk}>{look.line}</T>
      {look.give ? (
        <View style={s.buttons}>
          <Button
            label={look.give.label}
            accessibilityLabel={`${look.give.label}: ${what}`}
            variant={look.give.variant}
            height={52}
            onPress={onGive}
            disabled={busy}
            style={s.flex}
          />
          <Button
            label="No se dio"
            accessibilityLabel={`No se dio: ${what}`}
            variant="outline"
            height={52}
            onPress={onSkip}
            disabled={busy}
            style={s.flex}
          />
        </View>
      ) : null}
      {onCorrect ? (
        <Button
          label="Corregir"
          accessibilityLabel={`Corregir: ${what}`}
          variant="neutral"
          height={48}
          onPress={onCorrect}
          disabled={busy}
          style={s.correct}
        />
      ) : null}
      {err ? <ErrorText>{err}</ErrorText> : null}
    </View>
  );
}

const s = StyleSheet.create({
  section: { gap: 10 },
  card: { borderRadius: radius.card, borderCurve: 'continuous', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  circle: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  right: { alignItems: 'flex-end', gap: 2 },
  num: { fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', gap: 8 },
  correct: { alignSelf: 'flex-start', paddingHorizontal: 18 },
  flex: { flex: 1, paddingHorizontal: 12 },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.field, borderRadius: radius.card, borderCurve: 'continuous', padding: 16 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});
