import { useMemo, useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, type TextInputProps } from 'react-native';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { Screen, PageHeader } from '@/components/Screen';
import { T, H2 } from '@/components/T';
import { Icon, type IconName } from '@/components/Icon';
import { Button } from '@/components/Button';
import { Chip, ErrorText, Field, SwitchRow, useAnnounce } from '@/components/Controls';
import { Notice } from '@/components/Status';
import { useToast } from '@/components/Toast';
import { useCare, useVitalPlans } from '@/features/care/hooks';
import { GLUCOSE_CTX, ORDER, VITALS, fmt, isFever, planFromRows } from '@/features/care/vitals';
import {
  EMPTY_VALUES, clearKind, collect, defaultGlucoseCtx, fieldMessage, formKinds, isFilled, metaText, outBanner, planIntro,
  type FieldState, type FormValues,
} from '@/features/care/vitalsForm';
import { hhmm, lc, num } from '@/features/care/clock';
import type { GlucoseCtx, VitalKind } from '@/features/care/types';
import { useTextScale } from '@/features/settings/textScale';
import { supabase } from '@/lib/supabase';
import { lastQueued, mutate, saved, unqueue } from '@/lib/db';
import { failedTo } from '@/lib/errors';
import { colors, font, radius } from '@/theme';

// Message line look per state (prototype MS table).
const LOOK: Record<FieldState, { ink: string; bold: boolean; icon?: IconName; border: string }> = {
  empty: { ink: colors.ink2, bold: false, border: colors.line },
  partial: { ink: colors.ink2, bold: true, border: colors.line },
  ok: { ink: colors.ok, bold: true, icon: 'check', border: colors.line },
  warn: { ink: colors.warnInk, bold: true, icon: 'warn', border: colors.warn },
  alert: { ink: colors.danger, bold: true, icon: 'alert', border: colors.danger },
  invalid: { ink: colors.danger, bold: true, icon: 'alert', border: colors.danger },
};

type Draft = { values: FormValues; extra: VitalKind[]; ctx: GlucoseCtx | null; notify: boolean | null; note: string };
const EMPTY_DRAFT: Draft = { values: EMPTY_VALUES, extra: [], ctx: null, notify: null, note: '' };

const SAVE_FAILED = 'No se pudo guardar el control. Tus datos siguen aquí: no se ha perdido nada.';

export default function NurseSignos() {
  const router = useRouter();
  const toast = useToast();
  const { pid, meId, patient, short, now } = useCare();
  const planRows = useVitalPlans(pid);
  const plan = useMemo(() => planFromRows(planRows), [planRows]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [err, setErr] = useState('');
  const [failed, setFailed] = useState(false);
  useAnnounce(failed ? SAVE_FAILED : null);
  const [busy, setBusy] = useState(false);
  const { values, extra, note } = draft;

  // The nurse can change it; until then it follows the clock.
  const ctx = draft.ctx ?? defaultGlucoseCtx(now);
  const { routine, added } = formKinds(plan, extra);
  const kinds = [...routine, ...added];
  const msgs = Object.fromEntries(kinds.map((k) => [k, fieldMessage(plan, k, values, ctx, short)])) as Record<VitalKind, ReturnType<typeof fieldMessage>>;
  const states = kinds.map((k) => msgs[k].state);
  const banner = outBanner(states, short);
  const outN = states.filter((st) => st === 'warn' || st === 'alert').length;
  const notifyOn = draft.notify ?? outN > 0;
  const filledN = kinds.filter((k) => isFilled(k, values)).length;
  const temp = kinds.includes('temp') ? num(values.temp) : null;
  const addable = ORDER.filter((k) => !kinds.includes(k));

  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErr('');
  };
  const setValue = (key: keyof FormValues, v: string | number | null) => edit({ values: { ...values, [key]: v } });

  const save = async () => {
    if (!pid || busy) return;
    const { rows, error } = collect(plan, kinds, values, ctx);
    if (error) {
      setErr(error);
      return;
    }
    setBusy(true);
    const controlId = randomUUID();
    const takenAt = new Date().toISOString();
    const saveErr = await mutate(
      supabase.from('vital_readings').insert(
        rows.map((r) => ({
          id: randomUUID(), // so a queued reading is replaced by the real row once sent, not doubled
          patient_id: pid, control_id: controlId, ...r, taken_at: takenAt, taken_by: meId || null,
          note: note.trim() || null, family_notified: notifyOn,
        })),
      ),
      'vital_readings',
    );
    setBusy(false);
    if (saveErr) {
      setFailed(true); // the form keeps its data
      return;
    }
    const prev = draft;
    const queued = lastQueued();
    setFailed(false);
    setDraft(EMPTY_DRAFT);
    router.navigate('/nurse/inicio');
    toast.show(saved(notifyOn ? 'Control guardado. La familia ha sido avisada.' : 'Control guardado.'), async () => {
      if (!unqueue(queued)) {
        const undoErr = await mutate(supabase.from('vital_readings').delete().eq('control_id', controlId), 'vital_readings');
        if (undoErr) {
          toast.show(failedTo('No se pudo deshacer.', undoErr));
          return;
        }
      }
      setDraft(prev);
      router.navigate('/nurse/signos');
    });
  };

  const field = (k: VitalKind, isAdded: boolean) => (
    <VitalField
      key={k}
      k={k}
      meta={metaText(plan, k, isAdded)}
      msg={msgs[k]}
      values={values}
      ctx={ctx}
      onValue={setValue}
      onCtx={(c) => edit({ ctx: c })}
      onRemove={isAdded ? () => edit({ extra: extra.filter((x) => x !== k), values: clearKind(values, k) }) : undefined}
    />
  );

  return (
    <Screen bottomInset={false}>
      <PageHeader title="Signos vitales" sub={`${patient?.full_name ?? short} · control de las ${hhmm(now)}`} />
      <Notice tone="info" icon="clipboard">
        <T size={16} lh={1.4}>
          {planIntro(plan, short)}{' '}
          <T size={16} bold color={colors.pri} style={s.link} accessibilityRole="link" onPress={() => router.push('/plan')}>
            Ver plan
          </T>
        </T>
      </Notice>
      {temp != null && isFever(temp) ? (
        <Notice tone="alert" alert>{`Fiebre: ${fmt('temp', temp)} °C. Después de guardar, avisa al médico.`}</Notice>
      ) : null}
      {banner ? <Notice tone={banner.tone} alert>{banner.text}</Notice> : null}

      <H2 style={s.head}>Según su plan</H2>
      {routine.map((k) => field(k, false))}
      {added.length ? <H2 style={s.head}>Añadidos a este control</H2> : null}
      {added.map((k) => field(k, true))}

      {addable.length ? (
        <View style={{ gap: 10 }}>
          <H2 style={s.head}>Añadir otro signo</H2>
          <T size={15} color={colors.ink2} style={{ marginTop: -4 }}>Para algo que no está en su plan o que hoy no toca.</T>
          <View style={s.wrap}>
            {addable.map((k) => (
              <Button
                key={k}
                label={VITALS[k].name}
                icon="plus"
                variant="secondary"
                height={48}
                accessibilityLabel={`Añadir ${lc(VITALS[k].name)}`}
                onPress={() => edit({ extra: [...extra, k] })}
                style={s.addChip}
              />
            ))}
          </View>
        </View>
      ) : null}

      <SwitchRow
        title="Avisar a la familia"
        sub={outN > 0 ? 'Recomendado: hay valores fuera de lo normal.' : 'Recibirán un aviso con este control.'}
        value={notifyOn}
        onChange={(v) => edit({ notify: v })}
      />
      <Field label="Nota" optional multiline value={note} onChangeText={(t) => edit({ note: t })} />

      {err ? (
        <ErrorText>{err}</ErrorText>
      ) : null}
      {failed ? (
        <View style={s.failBox} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <T size={16} bold color={colors.danger}>{SAVE_FAILED}</T>
          <Button label="Reintentar" variant="dangerOutline" height={48} onPress={save} disabled={busy} />
        </View>
      ) : null}
      <Button
        label={notifyOn ? 'Guardar y avisar a la familia' : filledN === 1 ? 'Guardar 1 signo' : `Guardar ${filledN} signos`}
        onPress={save}
        disabled={busy}
      />
    </Screen>
  );
}

function VitalField({
  k, meta, msg, values, ctx, onValue, onCtx, onRemove,
}: {
  k: VitalKind;
  meta: string;
  msg: ReturnType<typeof fieldMessage>;
  values: FormValues;
  ctx: GlucoseCtx;
  onValue: (key: keyof FormValues, v: string | number | null) => void;
  onCtx: (c: GlucoseCtx) => void;
  onRemove?: () => void;
}) {
  const v = VITALS[k];
  const look = LOOK[msg.state];
  return (
    <View style={[s.card, { borderColor: look.border }]}>
      <View style={s.top}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <T size={17} bold>{v.name}</T>
          <T size={14} color={colors.ink2} lh={1.35}>{meta}</T>
        </View>
        {onRemove ? (
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Quitar ${lc(v.name)} de este control`}
            style={({ pressed }) => [s.remove, pressed && { opacity: 0.85 }]}
          >
            <T size={14} bold>Quitar</T>
          </Pressable>
        ) : null}
      </View>

      {k === 'bp' ? (
        <View style={s.bpRow}>
          <View style={s.bpPart}>
            <T size={15} bold color={colors.ink2}>Máxima</T>
            <NumInput label={`${v.name}: máxima`} value={values.sys} onChangeText={(t) => onValue('sys', t)} keyboardType="number-pad" />
          </View>
          <T size={26} bold color={colors.ink2} style={{ paddingBottom: 10 }} importantForAccessibility="no" accessibilityElementsHidden>/</T>
          <View style={s.bpPart}>
            <T size={15} bold color={colors.ink2}>Mínima</T>
            <NumInput label={`${v.name}: mínima`} value={values.dia} onChangeText={(t) => onValue('dia', t)} keyboardType="number-pad" />
          </View>
          <T size={15} bold color={colors.ink2} style={{ paddingBottom: 16 }}>mmHg</T>
        </View>
      ) : k === 'pain' ? (
        <>
          <View accessibilityRole="radiogroup" accessibilityLabel={v.name} style={{ gap: 6 }}>
            {[[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10]].map((row) => (
              <View key={row[0]} style={s.painRow}>
                {row.map((n) => {
                  const sel = values.pain === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => onValue('pain', n)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: sel }}
                      accessibilityLabel={`${n} de 10`}
                      style={[s.painBtn, sel ? s.painSel : null]}
                    >
                      <T size={18} bold color={sel ? colors.onPri : colors.ink}>{n}</T>
                    </Pressable>
                  );
                })}
                {row.length < 6 ? <View style={{ flex: 1 }} /> : null}
              </View>
            ))}
          </View>
          <View style={s.legend}>
            <T size={14} color={colors.ink2}>0 = sin dolor</T>
            <T size={14} color={colors.ink2}>10 = el peor dolor</T>
          </View>
        </>
      ) : (
        <>
          <View style={s.numRow}>
            <NumInput label={v.name} value={values[k]} onChangeText={(t) => onValue(k, t)} style={{ width: 150 }} />
            <T size={16} bold color={colors.ink2}>{v.unit}</T>
          </View>
          {k === 'glucose' ? (
            <View accessibilityRole="radiogroup" accessibilityLabel="Momento de la medición" style={s.ctxGrid}>
              {GLUCOSE_CTX.map((c) => (
                <Chip key={c.id} label={c.label} selected={ctx === c.id} onPress={() => onCtx(c.id)} style={s.ctxChip} />
              ))}
            </View>
          ) : null}
        </>
      )}

      <View style={s.msg} accessibilityLiveRegion="polite">
        {look.icon ? <Icon name={look.icon} size={18} color={look.ink} strokeWidth={2.6} /> : null}
        <T size={15} lh={1.35} bold={look.bold} color={look.ink} style={{ flex: 1 }}>{msg.msg}</T>
      </View>
    </View>
  );
}

// Big numeric input (26 bold), scaled with the in-app text size and with the
// same focus ring as Field.
function NumInput({ label, style, ...rest }: TextInputProps & { label: string }) {
  const { pct } = useTextScale();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      accessibilityLabel={label}
      keyboardType="decimal-pad"
      {...rest}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[s.input, { fontSize: (26 * pct) / 100 }, focused && s.focused, style]}
    />
  );
}

const s = StyleSheet.create({
  link: { textDecorationLine: 'underline' },
  head: { marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addChip: { alignSelf: 'flex-start', paddingLeft: 12, paddingRight: 16 },
  card: { backgroundColor: colors.surface, borderWidth: 2, borderRadius: radius.card, borderCurve: 'continuous', paddingVertical: 14, paddingHorizontal: 16, gap: 10 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  // Prototype in-card pill: 44 tall, 1.5px border, 14 bold (smaller than Button).
  remove: {
    alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 14, justifyContent: 'center',
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.field, backgroundColor: colors.surface,
  },
  numRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bpRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  bpPart: { flex: 1, minWidth: 0, gap: 6 },
  input: {
    minHeight: 54, borderWidth: 1.5, borderColor: colors.field, borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 14,
    backgroundColor: colors.surface, color: colors.ink, fontFamily: font.bold,
  },
  focused: { borderColor: colors.focus, borderWidth: 2.5 },
  ctxGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ctxChip: { flexBasis: '45%', flexGrow: 1, paddingHorizontal: 10 },
  painRow: { flexDirection: 'row', gap: 6 },
  painBtn: {
    flex: 1, minHeight: 48, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1.5, borderColor: colors.field,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  painSel: { backgroundColor: colors.pri, borderWidth: 2, borderColor: colors.pri },
  legend: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  msg: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  failBox: {
    backgroundColor: colors.dangerSoft, borderWidth: 2, borderColor: colors.danger, borderRadius: radius.card, borderCurve: 'continuous',
    paddingVertical: 14, paddingHorizontal: 16, gap: 10,
  },
});
