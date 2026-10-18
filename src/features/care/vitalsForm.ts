import type { GlucoseCtx, Severity, VitalKind } from './types';
import { cap, lc, listY, num } from './clock';
import {
  BP_DIA_ALERT, ORDER, VITALS, alertFor, checkValue, glucoseRangeIndex, part, rangeText, rangesFor, routineKinds,
  severity, sourceText, type FieldCheck, type Plan,
} from './vitals';

// Signos form: field messages, banners and the save payload (prototype mkField / doSave).

export type FormValues = { sys: string; dia: string; pain: number | null } & Record<Exclude<VitalKind, 'bp' | 'pain'>, string>;
export const EMPTY_VALUES: FormValues = { sys: '', dia: '', hr: '', glucose: '', spo2: '', rr: '', temp: '', weight: '', pain: null };

export const clearKind = (v: FormValues, k: VitalKind): FormValues =>
  k === 'bp' ? { ...v, sys: '', dia: '' } : k === 'pain' ? { ...v, pain: null } : { ...v, [k]: '' };

export const isFilled = (k: VitalKind, v: FormValues) =>
  k === 'bp' ? v.sys.trim() !== '' || v.dia.trim() !== '' : k === 'pain' ? v.pain != null : v[k].trim() !== '';

// Default glucose moment from the clock; the nurse can change it.
export const defaultGlucoseCtx = (now: Date): GlucoseCtx => {
  const h = now.getHours();
  return h < 11 ? 'fasting' : h < 16 ? 'pre_meal' : h < 21 ? 'post_meal' : 'bedtime';
};

// "Según su plan" (routine) and "Añadidos a este control" (added on the fly).
export const formKinds = (plan: Plan, extra: VitalKind[]) => {
  const routine = routineKinds(plan);
  return { routine, added: ORDER.filter((k) => extra.includes(k) && !routine.includes(k)) };
};

export const metaText = (plan: Plan, k: VitalKind, added: boolean) => {
  const p = plan[k];
  if (!added && p) return `${p.frequency} · ${sourceText(p.sources)}`;
  return p ? `En su plan: ${lc(p.frequency)}. Hoy no toca.` : 'No está en su plan.';
};

export const planIntro = (plan: Plan, short: string) => {
  const routine = routineKinds(plan);
  const n = routine.length;
  const byConditions = routine.some((k) => plan[k]!.sources.length > 0);
  const what = byConditions ? 'por sus condiciones' : n === 1 ? 'básico' : 'básicos';
  return `Este control sigue el plan de ${short}: ${n} ${n === 1 ? 'signo' : 'signos'} ${what}.`;
};

export type FieldState = 'empty' | 'partial' | 'ok' | 'warn' | 'alert' | 'invalid';
export type FieldMsg = { state: FieldState; msg: string };
type Res = FieldCheck | { s: 'partial'; miss: string };
const RK: Record<FieldCheck['s'], number> = { empty: 0, ok: 1, warn: 2, alert: 3, invalid: 4 };

// Message line under a field (prototype MS table). "para {short}" only when the vital is in the plan.
export function fieldMessage(plan: Plan, k: VitalKind, v: FormValues, ctx: GlucoseCtx, short: string): FieldMsg {
  const r = rangesFor(plan, k);
  const a = alertFor(plan, k);
  let res: Res;
  let txt: string;
  let pre = '';
  if (k === 'bp') {
    const r1 = checkValue(num(v.sys), v.sys, r[0], a);
    const r2 = checkValue(num(v.dia), v.dia, r[1], BP_DIA_ALERT);
    const worst = RK[r2.s] > RK[r1.s] ? r2 : r1;
    const bad = worst.s === 'warn' || worst.s === 'alert';
    pre = bad ? (worst === r2 ? 'Mínima: ' : 'Máxima: ') : '';
    txt = bad ? part(k, worst === r2 ? r[1] : r[0]) : rangeText(k, r);
    res = worst.s === 'ok' && (r1.s === 'empty') !== (r2.s === 'empty')
      ? { s: 'partial', miss: r1.s === 'empty' ? 'la máxima' : 'la mínima' }
      : worst;
  } else if (k === 'pain') {
    res = v.pain == null ? { s: 'empty' } : checkValue(v.pain, String(v.pain), r[0], a);
    txt = rangeText(k, r);
  } else if (k === 'glucose') {
    const gi = glucoseRangeIndex(ctx);
    txt = `${part(k, r[gi])} mg/dL ${gi ? 'al acostarse o después de comer' : 'antes de comer'}`;
    res = checkValue(num(v.glucose), v.glucose, r[gi], a);
  } else {
    res = checkValue(num(v[k]), v[k], r[0], a);
    txt = rangeText(k, r);
  }
  // No range yet (weight): there is no "normal" to compare with.
  if (!r.length && (res.s === 'empty' || res.s === 'ok')) return { state: 'empty', msg: `${cap(rangeText(k, r))}.` };
  const forP = plan[k] ? ` para ${short}` : '';
  const dir = 'dir' in res && res.dir === 'low' ? 'debajo' : 'encima';
  switch (res.s) {
    case 'empty': return { state: 'empty', msg: `Normal${forP}: ${txt}` };
    case 'partial': return { state: 'partial', msg: `Falta ${res.miss}.` };
    case 'ok': return { state: 'ok', msg: `Dentro de lo normal${forP}` };
    case 'invalid': return { state: 'invalid', msg: 'Escribe solo números, por ejemplo 72' };
    case 'warn': {
      const body = `por ${dir} de lo normal${forP} (${txt})`;
      return { state: 'warn', msg: pre ? pre + body : cap(body) };
    }
    default: {
      const body = `muy por ${dir} de lo normal. Avisa al médico (normal: ${txt})`;
      return { state: 'alert', msg: pre ? pre + body : cap(body) };
    }
  }
}

// Top banner for out-of-range values (role=alert).
export function outBanner(states: FieldState[], short: string): { tone: 'alert' | 'warn'; text: string } | null {
  const alertN = states.filter((s) => s === 'alert').length;
  const outN = alertN + states.filter((s) => s === 'warn').length;
  if (alertN) return { tone: 'alert', text: `Hay un valor muy fuera de lo normal para ${short}. Después de guardar, avisa al médico.` };
  if (outN === 1) return { tone: 'warn', text: `Hay 1 valor fuera de lo normal para ${short}. Revísalo antes de guardar.` };
  if (outN) return { tone: 'warn', text: `Hay ${outN} valores fuera de lo normal para ${short}. Revísalos antes de guardar.` };
  return null;
}

export type ReadingDraft = { kind: VitalKind; value: number; value2: number | null; context: GlucoseCtx | null; severity: Severity };

// One reading per filled value; empty fields are not recorded.
export function collect(plan: Plan, kinds: VitalKind[], v: FormValues, ctx: GlucoseCtx) {
  const rows: ReadingDraft[] = [];
  const bad: string[] = [];
  for (const k of kinds) {
    if (!isFilled(k, v)) continue;
    if (k === 'bp') {
      const sys = num(v.sys);
      const dia = num(v.dia);
      if (sys == null || dia == null) bad.push(lc(VITALS.bp.short));
      else rows.push({ kind: 'bp', value: sys, value2: dia, context: null, severity: severity(plan, 'bp', sys, dia) });
    } else if (k === 'pain') {
      rows.push({ kind: 'pain', value: v.pain!, value2: null, context: null, severity: severity(plan, 'pain', v.pain!) });
    } else {
      const n = num(v[k]);
      const c = k === 'glucose' ? ctx : null;
      if (n == null) bad.push(lc(VITALS[k].short));
      else rows.push({ kind: k, value: n, value2: null, context: c, severity: severity(plan, k, n, null, c) });
    }
  }
  const error = bad.length ? `Revisa: ${listY(bad)}.` : rows.length ? '' : 'Anota al menos un signo para guardar.';
  return { rows, error };
}
