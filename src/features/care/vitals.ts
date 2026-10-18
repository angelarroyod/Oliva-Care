import type { ConditionKind, GlucoseCtx, Severity, VitalKind, VitalPlanRow } from './types';
import { listY } from './clock';

// Vital catalog, ranges, severity and condition suggestions (handoff "Business
// rules"). Ranges are typical values: a clinician must review them before release.
export const ORDER: VitalKind[] = ['bp', 'hr', 'glucose', 'spo2', 'rr', 'temp', 'weight', 'pain'];

type VitalDef = {
  name: string;
  short: string;
  unit: string;
  parts?: [string, string]; // two-part ranges (bp, glucose)
  def: number[][]; // default normal range(s); [] = patient-specific, no default
  alert: [number, number]; // outside → alert
};

export const VITALS: Record<VitalKind, VitalDef> = {
  bp: { name: 'Presión arterial', short: 'Presión', unit: 'mmHg', parts: ['Máxima', 'Mínima'], def: [[90, 140], [60, 90]], alert: [80, 180] },
  hr: { name: 'Pulso', short: 'Pulso', unit: 'lat/min', def: [[60, 100]], alert: [45, 130] },
  glucose: {
    name: 'Glucosa', short: 'Glucosa', unit: 'mg/dL',
    parts: ['Antes de comer o en ayunas', 'Al acostarse o después de comer'],
    def: [[90, 150], [100, 180]], alert: [70, 250],
  },
  spo2: { name: 'Oxígeno en sangre', short: 'Oxígeno', unit: '%', def: [[95, 100]], alert: [90, 100] },
  rr: { name: 'Frecuencia respiratoria', short: 'Respiración', unit: 'resp/min', def: [[12, 20]], alert: [8, 28] },
  temp: { name: 'Temperatura', short: 'Temperatura', unit: '°C', def: [[36, 37.5]], alert: [35, 38.5] },
  // ponytail: the handoff's 62–66 kg is demo data; weight has no sensible
  // default, so it's only judged once a nurse sets a range in the plan.
  weight: { name: 'Peso', short: 'Peso', unit: 'kg', def: [], alert: [0, 1000] },
  pain: { name: 'Dolor', short: 'Dolor', unit: 'de 10', def: [[0, 3]], alert: [0, 6] },
};

export const BP_DIA_ALERT: [number, number] = [40, 120];
export const FEVER_C = 37.5;
export const isFever = (tempC: number) => tempC > FEVER_C;

export const GLUCOSE_CTX: { id: GlucoseCtx; label: string }[] = [
  { id: 'fasting', label: 'En ayunas' },
  { id: 'pre_meal', label: 'Antes de comer' },
  { id: 'post_meal', label: 'Después de comer' },
  { id: 'bedtime', label: 'Al acostarse' },
];
// Range 1 for fasting / before a meal, range 2 for after a meal / bedtime.
export const glucoseRangeIndex = (ctx: GlucoseCtx | null | undefined) => (ctx === 'post_meal' || ctx === 'bedtime' ? 1 : 0);

// ---------- plan ----------
export type PlanEntry = {
  kind: VitalKind;
  frequency: string;
  inRoutine: boolean; // shown under "Según su plan"
  ranges: number[][];
  alert: [number, number];
  sources: ConditionKind[];
  updatedBy: string | null;
  updatedAt: string | null;
};
export type Plan = Partial<Record<VitalKind, PlanEntry>>;

// Every patient starts with these (seeded by 0003). Used as a fallback when a
// patient has no vital_plans rows yet.
export const BASIC_KINDS: VitalKind[] = ['bp', 'hr', 'temp', 'spo2'];
export const BASIC_FREQUENCY = 'Cada turno';

const entryFromRow = (r: VitalPlanRow): PlanEntry => ({
  kind: r.kind,
  frequency: r.frequency,
  inRoutine: r.in_routine,
  ranges: Array.isArray(r.ranges) ? r.ranges : [],
  alert: [r.alert_low ?? VITALS[r.kind].alert[0], r.alert_high ?? VITALS[r.kind].alert[1]],
  sources: r.source_conditions ?? [],
  updatedBy: r.updated_by,
  updatedAt: r.updated_at,
});

export function planFromRows(rows: VitalPlanRow[]): Plan {
  const plan: Plan = {};
  if (rows.length === 0) {
    for (const k of BASIC_KINDS) {
      plan[k] = { kind: k, frequency: BASIC_FREQUENCY, inRoutine: true, ranges: VITALS[k].def, alert: VITALS[k].alert, sources: [], updatedBy: null, updatedAt: null };
    }
    return plan;
  }
  for (const r of rows) plan[r.kind] = entryFromRow(r);
  return plan;
}

export const rangesFor = (plan: Plan, k: VitalKind) => {
  const r = plan[k]?.ranges;
  return r && r.length ? r : VITALS[k].def;
};
export const alertFor = (plan: Plan, k: VitalKind): [number, number] => plan[k]?.alert ?? VITALS[k].alert;
export const partLabels = (k: VitalKind): string[] => VITALS[k].parts ?? ['Rango normal'];
// Kinds in the plan's routine ("Según su plan"), in ORDER.
export const routineKinds = (plan: Plan) => ORDER.filter((k) => plan[k]?.inRoutine);

// ---------- severity ----------
const RANK: Record<Severity, number> = { ok: 0, warn: 1, alert: 2 };
export const worse = (a: Severity, b: Severity): Severity => (RANK[b] > RANK[a] ? b : a);

export const sevNum = (v: number, r: number[] | undefined, a: [number, number]): Severity =>
  v < a[0] || v > a[1] ? 'alert' : r && r.length === 2 && (v < r[0] || v > r[1]) ? 'warn' : 'ok';

// warn = outside the patient's normal range; alert = outside the alert band.
// BP takes the worse of systolic and diastolic (diastolic alert band 40–120).
export function severity(plan: Plan, kind: VitalKind, value: number, value2?: number | null, ctx?: GlucoseCtx | null): Severity {
  const r = rangesFor(plan, kind);
  const a = alertFor(plan, kind);
  if (kind === 'bp') return worse(sevNum(value, r[0], a), value2 == null ? 'ok' : sevNum(value2, r[1], BP_DIA_ALERT));
  if (kind === 'glucose') return sevNum(value, r[glucoseRangeIndex(ctx)], a);
  return sevNum(value, r[0], a);
}

// Per-field check for the vitals form.
export type FieldCheck = { s: 'empty' | 'invalid' | 'ok' | 'warn' | 'alert'; dir?: 'low' | 'high' };
export function checkValue(n: number | null, raw: string, r: number[] | undefined, a: [number, number]): FieldCheck {
  if (raw.trim() === '') return { s: 'empty' };
  if (n == null) return { s: 'invalid' };
  if (n < a[0] || n > a[1]) return { s: 'alert', dir: n < a[0] ? 'low' : 'high' };
  if (r && r.length === 2 && (n < r[0] || n > r[1])) return { s: 'warn', dir: n < r[0] ? 'low' : 'high' };
  return { s: 'ok' };
}

// ---------- copy ----------
// Spanish decimal comma; temperature always shows one decimal ("36,0").
export const fmt = (k: VitalKind, n: number) => (k === 'temp' ? n.toFixed(1) : String(Math.round(n * 10) / 10)).replace('.', ',');
export const part = (k: VitalKind, r: number[]) => `${fmt(k, r[0])} a ${fmt(k, r[1])}`;

// "máxima 90 a 140, mínima 60 a 90" / "90 a 150 antes de comer, 100 a 180 al acostarse" / "0 a 3 de 10" / "60 a 100 lat/min"
export function rangeText(k: VitalKind, ranges: number[][]): string {
  if (!ranges.length) return 'sin rango todavía';
  if (k === 'bp') return `máxima ${part(k, ranges[0])}, mínima ${part(k, ranges[1])}`;
  if (k === 'glucose') return `${part(k, ranges[0])} antes de comer, ${part(k, ranges[1])} al acostarse`;
  if (k === 'pain') return `${part(k, ranges[0])} de 10`;
  return `${part(k, ranges[0])} ${VITALS[k].unit}`;
}

// Value chip text: "Presión 138/86", "Glucosa en ayunas 128 mg/dL", "Temperatura 36,6 °C"…
export function valueText(k: VitalKind, value: number, value2?: number | null, ctx?: GlucoseCtx | null): { label: string; value: string } {
  switch (k) {
    case 'bp': return { label: 'Presión', value: `${fmt(k, value)}/${value2 == null ? '–' : fmt(k, value2)}` };
    case 'glucose': return { label: ctx === 'fasting' ? 'Glucosa en ayunas' : 'Glucosa', value: `${fmt(k, value)} mg/dL` };
    case 'temp': return { label: 'Temperatura', value: `${fmt(k, value)} °C` };
    case 'pain': return { label: 'Dolor', value: `${fmt(k, value)}/10` };
    case 'spo2': return { label: 'Oxígeno', value: `${fmt(k, value)} %` };
    case 'weight': return { label: 'Peso', value: `${fmt(k, value)} kg` };
    case 'rr': return { label: 'Respiración', value: `${fmt(k, value)}/min` };
    default: return { label: 'Pulso', value: fmt(k, value) };
  }
}

// ---------- conditions ----------
export const CONDITION_ORDER: ConditionKind[] = [
  'diabetes', 'hypertension', 'heart_failure', 'copd_asthma', 'hypothyroidism', 'renal_failure', 'dementia', 'reduced_mobility',
];
export const CONDITIONS: Record<ConditionKind, { name: string; por: string }> = {
  diabetes: { name: 'Diabetes', por: 'diabetes' },
  hypertension: { name: 'Hipertensión', por: 'hipertensión' },
  heart_failure: { name: 'Insuficiencia cardiaca', por: 'insuficiencia cardiaca' },
  copd_asthma: { name: 'EPOC / asma', por: 'EPOC / asma' },
  hypothyroidism: { name: 'Hipotiroidismo', por: 'hipotiroidismo' },
  renal_failure: { name: 'Insuficiencia renal', por: 'insuficiencia renal' },
  dementia: { name: 'Demencia / Alzheimer', por: 'demencia' },
  reduced_mobility: { name: 'Movilidad reducida', por: 'movilidad reducida' },
};

// "por hipertensión y hipotiroidismo" / "básico para todos"
export const sourceText = (sources: ConditionKind[]) =>
  sources.length ? `por ${listY(sources.map((c) => CONDITIONS[c].por))}` : 'básico para todos';

export type Suggestion = {
  kind: VitalKind;
  frequency: string;
  ranges: number[][];
  alert?: [number, number];
  inRoutine: boolean; // "cada turno", "mañana y noche", "con la presión", "en ayunas…" → true
  why: string;
};

const BP2 = [[90, 140], [60, 90]];
const TEMP = [[36, 37.5]];
const NO_RANGE: number[][] = []; // weight: patient-specific, set in the plan

export const SUGGESTIONS: Record<ConditionKind, Suggestion[]> = {
  diabetes: [
    { kind: 'glucose', frequency: 'En ayunas y antes de cenar', ranges: [[90, 150], [100, 180]], inRoutine: true, why: 'Para ver si la dieta y la medicación la mantienen estable.' },
  ],
  hypertension: [
    { kind: 'bp', frequency: 'Mañana y noche', ranges: BP2, inRoutine: true, why: 'La presión cambia a lo largo del día.' },
    { kind: 'hr', frequency: 'Con la presión', ranges: [[60, 100]], inRoutine: true, why: 'Algunos tratamientos bajan el pulso.' },
  ],
  heart_failure: [
    { kind: 'weight', frequency: 'Cada mañana, antes del desayuno', ranges: NO_RANGE, inRoutine: false, why: 'Subir 2 kg en 3 días puede ser retención de líquidos.' },
    { kind: 'bp', frequency: 'Mañana y noche', ranges: BP2, inRoutine: true, why: 'Para vigilar el corazón y el tratamiento.' },
    { kind: 'spo2', frequency: 'Cada mañana', ranges: [[95, 100]], inRoutine: false, why: 'Si baja, puede faltarle el aire.' },
  ],
  copd_asthma: [
    { kind: 'spo2', frequency: 'Cada turno', ranges: [[88, 100]], alert: [85, 100], inRoutine: true, why: 'En EPOC suele bastar con 88 % o más. Confírmalo con su médico.' },
    { kind: 'rr', frequency: 'Cada turno', ranges: [[12, 20]], inRoutine: true, why: 'Respirar más rápido avisa antes de una crisis.' },
    { kind: 'temp', frequency: 'Cada mañana', ranges: TEMP, inRoutine: false, why: 'La fiebre puede indicar una infección respiratoria.' },
  ],
  hypothyroidism: [
    { kind: 'hr', frequency: 'Cada mañana', ranges: [[60, 100]], inRoutine: true, why: 'Un pulso lento puede indicar que hay que ajustar la dosis.' },
    { kind: 'weight', frequency: 'Cada lunes', ranges: NO_RANGE, inRoutine: false, why: 'Para notar cambios de peso sin motivo.' },
  ],
  renal_failure: [
    { kind: 'bp', frequency: 'Mañana y noche', ranges: BP2, inRoutine: true, why: 'La presión alta daña más el riñón.' },
    { kind: 'weight', frequency: 'Cada mañana', ranges: NO_RANGE, inRoutine: false, why: 'Ganar peso rápido puede ser retención de líquidos.' },
  ],
  dementia: [
    { kind: 'pain', frequency: 'Cada turno, fijándote en sus gestos', ranges: [[0, 3]], inRoutine: true, why: 'Puede no saber decir que algo le duele.' },
    { kind: 'temp', frequency: 'Cada mañana', ranges: TEMP, inRoutine: false, why: 'Una infección puede aumentar la confusión.' },
  ],
  reduced_mobility: [
    { kind: 'pain', frequency: 'Cada turno', ranges: [[0, 3]], inRoutine: true, why: 'Para notar dolor al moverla o por pasar mucho rato en la misma postura.' },
    { kind: 'weight', frequency: 'Cada mes', ranges: NO_RANGE, inRoutine: false, why: 'Para saber si come lo suficiente.' },
  ],
};

// Plan entries to upsert when adding a condition: vitals already in the plan
// gain the condition as a source; selected new ones come from the suggestion.
export function conditionChanges(plan: Plan, condition: ConditionKind, selected: VitalKind[]) {
  const upserts: PlanEntry[] = [];
  const added: Suggestion[] = [];
  for (const s of SUGGESTIONS[condition]) {
    const cur = plan[s.kind];
    if (cur) {
      if (!cur.sources.includes(condition)) upserts.push({ ...cur, sources: [...cur.sources, condition] });
    } else if (selected.includes(s.kind)) {
      added.push(s);
      upserts.push({
        kind: s.kind, frequency: s.frequency, inRoutine: s.inRoutine, ranges: s.ranges,
        alert: s.alert ?? VITALS[s.kind].alert, sources: [condition], updatedBy: null, updatedAt: null,
      });
    }
  }
  return { upserts, added };
}

// PlanEntry → vital_plans row for an upsert on (patient_id, kind).
export const toPlanRow = (patientId: string, e: PlanEntry, userId: string | null) => ({
  patient_id: patientId,
  kind: e.kind,
  frequency: e.frequency,
  in_routine: e.inRoutine,
  ranges: e.ranges,
  alert_low: e.alert[0],
  alert_high: e.alert[1],
  source_conditions: e.sources,
  updated_by: userId,
  updated_at: new Date().toISOString(),
});
