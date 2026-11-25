import { useMemo, useRef, useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, type TextInputProps } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, PageHeader } from '@/components/Screen';
import { T, H2 } from '@/components/T';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CheckRow, ErrorText } from '@/components/Controls';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { useCare, useConditions, useVitalPlans } from '@/features/care/hooks';
import {
  CONDITIONS, CONDITION_ORDER, ORDER, SUGGESTIONS, VITALS, conditionChanges, fmt, partLabels, planFromRows, rangeText, rangesFor,
  toPlanRow, type Plan, type PlanEntry,
} from '@/features/care/vitals';
import { hhmm, lc, listY, num, relativeDay } from '@/features/care/clock';
import type { ConditionKind, ConditionRow, VitalKind, VitalPlanRow } from '@/features/care/types';
import { useTextScale } from '@/features/settings/textScale';
import { supabase } from '@/lib/supabase';
import { mutate, saved } from '@/lib/db';
import { failedTo } from '@/lib/errors';
import { colors, font, radius } from '@/theme';

type SheetState = null | { t: 'cond' } | { t: 'sugg'; c: ConditionKind; sel: VitalKind[] };
type Edit = { k: VitalKind; r: string[][]; err: string };

// "Último cambio: {name}, ayer a las 18:20 (rango de glucosa)." Newest of
// plan rows and conditions; ties go to the condition (it upserts plan rows too).
function lastChange(rows: VitalPlanRow[], conds: ConditionRow[], names: (id: string | null) => string, now: Date) {
  let best: { at: number; by: string | null; what: string } | null = null;
  for (const r of rows) {
    const at = Date.parse(r.updated_at);
    if (!best || at > best.at) best = { at, by: r.updated_by, what: `rango de ${lc(VITALS[r.kind].name)}` };
  }
  for (const c of conds) {
    const at = Date.parse(c.added_at);
    if (!best || at >= best.at) best = { at, by: c.added_by, what: `añadió ${CONDITIONS[c.condition].name}` };
  }
  const who = best?.by ? names(best.by) : '';
  if (!best || !who) return '';
  const d = new Date(best.at);
  return `Último cambio: ${who}, ${relativeDay(d, now)} a las ${hhmm(d)} (${best.what}).`;
}

// Restores a plan entry as it was, audit fields included (undo).
const restoreRow = (pid: string, e: PlanEntry) => ({ ...toPlanRow(pid, e, e.updatedBy), updated_at: e.updatedAt ?? new Date().toISOString() });

export default function PlanScreen() {
  const router = useRouter();
  const toast = useToast();
  const { pid, role, meId, short, names, now } = useCare();
  const planRows = useVitalPlans(pid);
  const condRows = useConditions(pid);
  const plan = useMemo(() => planFromRows(planRows), [planRows]);
  const conds = condRows.map((c) => c.condition);
  const canEdit = role === 'nurse';
  const [edit, setEdit] = useState<Edit | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [condErr, setCondErr] = useState<string | null>(null); // shown in the open sheet
  const [busy, setBusy] = useState(false);
  // One Modal whose content switches (iOS can't present a second Modal while the
  // first is dismissing). Keeps the last content while it fades out.
  const lastSheet = useRef<Exclude<SheetState, null>>({ t: 'cond' });
  if (sheet) lastSheet.current = sheet;
  const sh = lastSheet.current;
  const audit = lastChange(planRows, condRows, names, now);

  const startEdit = (k: VitalKind) => {
    const r = rangesFor(plan, k);
    // One row per range part; a vital with no range yet (weight) gets an empty row.
    setEdit({ k, r: partLabels(k).map((_, i) => (r[i] ? r[i].map((n) => fmt(k, n)) : ['', ''])), err: '' });
  };

  const saveRange = async () => {
    if (!edit || !pid || busy) return;
    const r = edit.r.map((x) => x.map(num));
    if (r.some((x) => x[0] == null || x[1] == null)) return setEdit({ ...edit, err: 'Escribe solo números.' });
    if (r.some((x) => x[0]! >= x[1]!)) return setEdit({ ...edit, err: 'El mínimo tiene que ser menor que el máximo.' });
    const k = edit.k;
    setBusy(true);
    const err = await mutate(
      supabase.from('vital_plans').upsert(toPlanRow(pid, { ...plan[k]!, ranges: r as number[][] }, meId || null), { onConflict: 'patient_id,kind' }),
      'vital_plans',
    );
    setBusy(false);
    if (err) return setEdit({ ...edit, err });
    setEdit(null);
    toast.show(saved(`Rango de ${lc(VITALS[k].short)} guardado. El formulario de signos ya lo usa.`));
  };

  const addCondition = async (c: ConditionKind, sel: VitalKind[]) => {
    if (!pid || busy) return;
    const prev: Plan = plan;
    const { upserts, added } = conditionChanges(plan, c, sel);
    const rows = upserts.map((e) => toPlanRow(pid, e, meId || null));
    setBusy(true);
    // added_at after the plan rows' updated_at so the audit line reads "añadió …".
    let err = await mutate(
      // Upsert that ignores a duplicate: a retry after a lost response finds it there and carries on.
      supabase.from('patient_conditions').upsert(
        { patient_id: pid, condition: c, added_by: meId || null, added_at: new Date().toISOString() },
        { onConflict: 'patient_id,condition', ignoreDuplicates: true },
      ),
      'patient_conditions', 'vital_plans',
    );
    if (!err && rows.length) {
      err = await mutate(supabase.from('vital_plans').upsert(rows, { onConflict: 'patient_id,kind' }), 'patient_conditions', 'vital_plans');
      // Don't leave a condition without its plan rows.
      if (err) await mutate(supabase.from('patient_conditions').delete().eq('patient_id', pid).eq('condition', c), 'patient_conditions', 'vital_plans');
    }
    setBusy(false);
    if (err) return setCondErr(err);
    setSheet(null);
    const name = CONDITIONS[c].name;
    const asked = added.filter((sg) => sg.inRoutine).map((sg) => lc(VITALS[sg.kind].name));
    const tail = asked.length ? ` El formulario de signos ya pide ${listY(asked)}.` : added.length ? ' Nuevos signos en su plan.' : '';
    toast.show(saved(`${name} añadida.${tail}`), async () => {
      const restored = upserts.filter((e) => prev[e.kind]).map((e) => restoreRow(pid, prev[e.kind]!));
      const inserted = upserts.filter((e) => !prev[e.kind]).map((e) => e.kind);
      let undoErr = await mutate(
        supabase.from('patient_conditions').delete().eq('patient_id', pid).eq('condition', c),
        'patient_conditions', 'vital_plans',
      );
      if (!undoErr && restored.length) {
        undoErr = await mutate(supabase.from('vital_plans').upsert(restored, { onConflict: 'patient_id,kind' }), 'patient_conditions', 'vital_plans');
      }
      if (!undoErr && inserted.length) {
        undoErr = await mutate(supabase.from('vital_plans').delete().eq('patient_id', pid).in('kind', inserted), 'patient_conditions', 'vital_plans');
      }
      if (undoErr) toast.show(failedTo('No se pudo deshacer.', undoErr));
    });
  };

  return (
    <Screen>
      <PageHeader title="Plan de cuidados" sub={`${short} · qué se mide y en qué rango`} size={30} onBack={() => router.back()} />

      <Card gap={12}>
        <H2 size={17}>Condiciones</H2>
        {conds.length ? (
          <View style={s.wrap} accessibilityRole="list">
            {conds.map((c) => (
              <View key={c} style={s.cond}>
                <T size={15} bold>{CONDITIONS[c].name}</T>
              </View>
            ))}
          </View>
        ) : (
          <T size={15} color={colors.ink2}>Sin condiciones anotadas.</T>
        )}
        {canEdit ? <Button label="Añadir condición" icon="plus" variant="secondary" height={52} size={17} onPress={() => { setCondErr(null); setSheet({ t: 'cond' }); }} /> : null}
      </Card>

      <View style={{ gap: 10 }}>
        <H2>Qué se mide</H2>
        {ORDER.filter((k) => plan[k]).map((k) => {
          const p = plan[k]!;
          const editing = edit?.k === k;
          return (
            <View key={k} style={[s.card, editing && s.cardEditing]}>
              <View style={s.top}>
                <T size={17} bold style={{ flex: 1 }}>{VITALS[k].name}</T>
                {canEdit && !editing ? (
                  <Pressable
                    onPress={() => startEdit(k)}
                    accessibilityRole="button"
                    accessibilityLabel={`Cambiar rango de ${lc(VITALS[k].name)}`}
                    style={({ pressed }) => [s.small, pressed && { opacity: 0.85 }]}
                  >
                    <T size={14} bold color={colors.pri}>Cambiar rango</T>
                  </Pressable>
                ) : null}
              </View>
              <View style={s.freq}>
                <Icon name="clock" size={17} color={colors.ink2} strokeWidth={2.2} />
                <T size={15} style={{ flex: 1 }}>{p.frequency}</T>
              </View>
              <T size={15} color={colors.ink2}>{`Normal para ${short}: ${rangeText(k, rangesFor(plan, k))}`}</T>
              <View style={s.tags}>
                {(p.sources.length ? p.sources.map((c) => `Por ${CONDITIONS[c].por}`) : ['Básico para todos']).map((t) => (
                  <View key={t} style={s.tag}>
                    <T size={13} bold color={colors.ink2}>{t}</T>
                  </View>
                ))}
              </View>
              {editing && edit ? (
                <RangeEditor
                  k={k}
                  edit={edit}
                  onChange={(r) => setEdit({ ...edit, r, err: '' })}
                  onSave={saveRange}
                  onCancel={() => setEdit(null)}
                  busy={busy}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={s.perm}>
        <Icon name="user" size={18} color={colors.ink2} strokeWidth={2.2} />
        <T size={15} color={colors.ink2} style={{ flex: 1 }}>
          {canEdit
            ? `Cualquier enfermera de ${short} puede cambiar el plan. La familia lo ve, pero no puede editarlo.`
            : `Solo las enfermeras de ${short} pueden cambiar el plan. Tú lo ves siempre actualizado.`}
        </T>
      </View>
      {audit ? <T size={14} color={colors.ink2} style={s.audit}>{audit}</T> : null}

      {canEdit ? (
        <Sheet
          visible={!!sheet}
          title={sh.t === 'sugg' ? CONDITIONS[sh.c].name : 'Añadir una condición'}
          sub={sh.t === 'sugg' ? `Sugerencias para el plan de ${short}. Quita las que no necesite.` : 'Te sugeriremos qué signos medir y en qué rango.'}
          onClose={() => { setCondErr(null); setSheet(null); }}
        >
          {sh.t === 'sugg' ? (
            <Suggestions
              plan={plan}
              c={sh.c}
              sel={sh.sel}
              busy={busy}
              err={condErr}
              onToggle={(k) => setSheet({ ...sh, sel: sh.sel.includes(k) ? sh.sel.filter((x) => x !== k) : [...sh.sel, k] })}
              onAccept={() => addCondition(sh.c, sh.sel)}
              onOnly={() => addCondition(sh.c, [])}
            />
          ) : (
            <View style={{ gap: 8 }}>
              {CONDITION_ORDER.map((c) => {
                const has = conds.includes(c);
                return (
                  <Pressable
                    key={c}
                    disabled={has}
                    onPress={() => setSheet({ t: 'sugg', c, sel: SUGGESTIONS[c].filter((sg) => !plan[sg.kind]).map((sg) => sg.kind) })}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: has }}
                    style={[s.condRow, has ? s.condHas : null]}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <T size={17} bold>{CONDITIONS[c].name}</T>
                      <T size={14} color={colors.ink2} lh={1.35}>
                        {has ? 'Ya está en su plan' : `Sugiere: ${listY(SUGGESTIONS[c].map((sg) => lc(VITALS[sg.kind].short)))}`}
                      </T>
                    </View>
                    <Icon name={has ? 'check' : 'chevronRight'} size={20} color={has ? colors.ok : colors.ink2} strokeWidth={2.4} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </Sheet>
      ) : null}
    </Screen>
  );
}

function RangeEditor({
  k, edit, onChange, onSave, onCancel, busy,
}: {
  k: VitalKind;
  edit: Edit;
  onChange: (r: string[][]) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const labels = partLabels(k);
  const unit = k === 'pain' ? 'de 10' : VITALS[k].unit;
  const set = (i: number, j: number, v: string) => onChange(edit.r.map((x, xi) => (xi === i ? x.map((y, yi) => (yi === j ? v : y)) : x)));
  return (
    <View style={s.editor}>
      {edit.r.map((x, i) => (
        <View key={labels[i]} style={{ gap: 6 }}>
          <T size={15} bold>{labels[i]}</T>
          <View style={s.rangeRow}>
            <RangeInput accessibilityLabel={`${labels[i]}: mínimo`} value={x[0]} onChangeText={(v) => set(i, 0, v)} />
            <T size={16} color={colors.ink2}>a</T>
            <RangeInput accessibilityLabel={`${labels[i]}: máximo`} value={x[1]} onChangeText={(v) => set(i, 1, v)} />
            <T size={15} bold color={colors.ink2}>{unit}</T>
          </View>
        </View>
      ))}
      {edit.err ? (
        <ErrorText>{edit.err}</ErrorText>
      ) : null}
      <View style={s.btnRow}>
        <Button label="Guardar rango" height={52} onPress={onSave} disabled={busy} style={{ flex: 1 }} />
        <Button label="Cancelar" variant="neutral" height={52} onPress={onCancel} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

// 96px range input (20 bold) with the same focus ring as Field.
function RangeInput(props: TextInputProps) {
  const { pct } = useTextScale();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      keyboardType="decimal-pad"
      {...props}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[s.input, { fontSize: (20 * pct) / 100 }, focused && s.focused]}
    />
  );
}

function Suggestions({
  plan, c, sel, busy, err, onToggle, onAccept, onOnly,
}: {
  plan: Plan;
  c: ConditionKind;
  sel: VitalKind[];
  busy: boolean;
  err: string | null;
  onToggle: (k: VitalKind) => void;
  onAccept: () => void;
  onOnly: () => void;
}) {
  const n = sel.length;
  return (
    <>
      <T size={16} bold>Te sugerimos medir:</T>
      <View style={{ gap: 8 }}>
        {SUGGESTIONS[c].map((sg) => {
          const cur = plan[sg.kind];
          const on = !!cur || sel.includes(sg.kind);
          return (
            <CheckRow
              key={sg.kind}
              checked={on}
              disabled={!!cur}
              onPress={() => onToggle(sg.kind)}
              style={[s.sugg, cur ? s.suggIn : on ? s.suggOn : null]}
            >
              <View style={{ gap: 3 }}>
                <T size={17} bold>{VITALS[sg.kind].name}</T>
                <T size={15} bold lh={1.35}>{cur ? `Ya se mide: ${lc(cur.frequency)}` : sg.frequency}</T>
                <T size={15} lh={1.35}>
                  {cur ? `Rango actual: ${rangeText(sg.kind, rangesFor(plan, sg.kind))}` : `Normal: ${rangeText(sg.kind, sg.ranges)}`}
                </T>
                <T size={15} lh={1.35} color={colors.ink2}>{sg.why}</T>
              </View>
            </CheckRow>
          );
        })}
      </View>
      <View style={s.disclaimer}>
        <T size={15} color={colors.ink2}>
          Son sugerencias habituales, no una indicación médica. Confirma los rangos con su médico; podrás cambiarlos cuando quieras.
        </T>
      </View>
      {err ? <ErrorText>{err}</ErrorText> : null}
      <Button
        label={n ? `Añadir con ${n} ${n === 1 ? 'signo nuevo' : 'signos nuevos'}` : `Añadir ${CONDITIONS[c].name}`}
        onPress={onAccept}
        disabled={busy}
      />
      <Button label="Solo añadir la condición" variant="secondary" onPress={onOnly} disabled={busy} />
    </>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cond: { borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.priSoft },
  card: {
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.card, borderCurve: 'continuous',
    paddingVertical: 14, paddingHorizontal: 16, gap: 8,
  },
  cardEditing: { borderWidth: 2, borderColor: colors.pri },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  // Prototype in-card pill: 44 tall, 1.5px border, 14 bold (smaller than Button).
  small: {
    alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 14, justifyContent: 'center',
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.pri, backgroundColor: colors.surface,
  },
  freq: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { borderRadius: 8, borderCurve: 'continuous', paddingVertical: 4, paddingHorizontal: 9, borderWidth: 1.5, borderColor: colors.line },
  editor: { gap: 12, paddingTop: 10, borderTopWidth: 1.5, borderTopColor: colors.line },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    width: 96, minHeight: 52, borderWidth: 1.5, borderColor: colors.field, borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 12,
    backgroundColor: colors.surface, color: colors.ink, fontFamily: font.bold,
  },
  focused: { borderColor: colors.focus, borderWidth: 2.5 },
  btnRow: { flexDirection: 'row', gap: 8 },
  perm: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  audit: { marginTop: -6, marginLeft: 28 },
  condRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1.5, borderColor: colors.field, backgroundColor: colors.surface,
  },
  condHas: { borderColor: colors.line, backgroundColor: colors.bg },
  sugg: { borderRadius: radius.card, borderCurve: 'continuous', borderColor: colors.field },
  suggIn: { borderColor: colors.line, backgroundColor: colors.bg },
  suggOn: { borderWidth: 2, borderColor: colors.pri, backgroundColor: colors.priSoft },
  disclaimer: { paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.field, borderRadius: radius.input, borderCurve: 'continuous' },
});
