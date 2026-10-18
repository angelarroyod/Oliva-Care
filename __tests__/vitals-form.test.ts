import { planFromRows } from '@/features/care/vitals';
import {
  EMPTY_VALUES, collect, defaultGlucoseCtx, fieldMessage, formKinds, metaText, outBanner, planIntro, type FormValues,
} from '@/features/care/vitalsForm';
import type { VitalPlanRow } from '@/features/care/types';

const row = (kind: VitalPlanRow['kind'], frequency: string, ranges: number[][], src: VitalPlanRow['source_conditions'], inRoutine = true): VitalPlanRow => ({
  patient_id: 'p1', kind, frequency, in_routine: inRoutine, ranges, alert_low: null, alert_high: null,
  source_conditions: src, updated_by: null, updated_at: '2026-10-14T16:20:00Z',
});
const plan = planFromRows([
  row('bp', 'Mañana y noche', [[90, 140], [60, 90]], ['hypertension']),
  row('hr', 'Mañana y noche', [[60, 100]], ['hypertension', 'hypothyroidism']),
  row('glucose', 'En ayunas y antes de cenar', [[90, 150], [100, 180]], ['diabetes']),
  row('pain', 'Cada turno', [[0, 3]], ['reduced_mobility']),
  row('temp', 'Cada mañana', [[36, 37.5]], [], false),
  row('weight', 'Cada lunes', [], ['hypothyroidism'], false),
]);
const vals = (p: Partial<FormValues>): FormValues => ({ ...EMPTY_VALUES, ...p });
const msg = (k: Parameters<typeof fieldMessage>[1], p: Partial<FormValues>, ctx = 'bedtime' as const) => fieldMessage(plan, k, vals(p), ctx, 'Elena');

test('form follows the plan routine; extras keep ORDER', () => {
  expect(formKinds(plan, ['spo2', 'temp', 'bp'])).toEqual({ routine: ['bp', 'hr', 'glucose', 'pain'], added: ['spo2', 'temp'] });
  expect(metaText(plan, 'hr', false)).toBe('Mañana y noche · por hipertensión y hipotiroidismo');
  expect(metaText(plan, 'temp', true)).toBe('En su plan: cada mañana. Hoy no toca.');
  expect(metaText(plan, 'spo2', true)).toBe('No está en su plan.');
  expect(planIntro(plan, 'Elena')).toBe('Este control sigue el plan de Elena: 4 signos por sus condiciones.');
  expect(planIntro(planFromRows([]), 'Elena')).toBe('Este control sigue el plan de Elena: 4 signos básicos.');
});

test('field messages follow the prototype table', () => {
  expect(msg('bp', {})).toEqual({ state: 'empty', msg: 'Normal para Elena: máxima 90 a 140, mínima 60 a 90' });
  expect(msg('bp', { sys: '138' })).toEqual({ state: 'partial', msg: 'Falta la mínima.' });
  expect(msg('bp', { sys: '138', dia: '84' })).toEqual({ state: 'ok', msg: 'Dentro de lo normal para Elena' });
  expect(msg('bp', { sys: '138', dia: '95' })).toEqual({ state: 'warn', msg: 'Mínima: por encima de lo normal para Elena (60 a 90)' });
  expect(msg('bp', { sys: '190', dia: '84' })).toEqual({ state: 'alert', msg: 'Máxima: muy por encima de lo normal. Avisa al médico (normal: 90 a 140)' });
  expect(msg('glucose', { glucose: '196' })).toEqual({
    state: 'warn', msg: 'Por encima de lo normal para Elena (100 a 180 mg/dL al acostarse o después de comer)',
  });
  expect(msg('glucose', { glucose: '170' }, 'pre_meal' as never).state).toBe('warn');
  expect(msg('hr', { hr: 'abc' })).toEqual({ state: 'invalid', msg: 'Escribe solo números, por ejemplo 72' });
  expect(msg('spo2', { spo2: '' })).toEqual({ state: 'empty', msg: 'Normal: 95 a 100 %' }); // not in the plan: no "para"
  expect(msg('pain', { pain: 7 }).msg).toBe('Muy por encima de lo normal. Avisa al médico (normal: 0 a 3 de 10)');
  expect(msg('temp', { temp: '35,8' }).msg).toBe('Por debajo de lo normal para Elena (36,0 a 37,5 °C)');
  expect(msg('weight', { weight: '64' })).toEqual({ state: 'empty', msg: 'Sin rango todavía.' });
});

test('banner counts warn and alert values', () => {
  expect(outBanner(['ok', 'empty'], 'Elena')).toBeNull();
  expect(outBanner(['warn'], 'Elena')?.text).toBe('Hay 1 valor fuera de lo normal para Elena. Revísalo antes de guardar.');
  expect(outBanner(['warn', 'warn'], 'Elena')?.text).toBe('Hay 2 valores fuera de lo normal para Elena. Revísalos antes de guardar.');
  expect(outBanner(['warn', 'alert'], 'Elena')).toEqual({
    tone: 'alert', text: 'Hay un valor muy fuera de lo normal para Elena. Después de guardar, avisa al médico.',
  });
});

test('collect builds one reading per value and validates', () => {
  const kinds = ['bp', 'hr', 'glucose', 'pain', 'temp'] as const;
  const { rows, error } = collect(plan, [...kinds], vals({ sys: '138', dia: '84', glucose: '262', pain: 2, temp: '38,2' }), 'pre_meal');
  expect(error).toBe('');
  expect(rows).toEqual([
    { kind: 'bp', value: 138, value2: 84, context: null, severity: 'ok' },
    { kind: 'glucose', value: 262, value2: null, context: 'pre_meal', severity: 'alert' },
    { kind: 'pain', value: 2, value2: null, context: null, severity: 'ok' },
    { kind: 'temp', value: 38.2, value2: null, context: null, severity: 'warn' },
  ]);
  expect(collect(plan, [...kinds], vals({ sys: '138', glucose: 'x' }), 'fasting').error).toBe('Revisa: presión y glucosa.');
  expect(collect(plan, [...kinds], EMPTY_VALUES, 'fasting').error).toBe('Anota al menos un signo para guardar.');
});

test('default glucose moment follows the clock', () => {
  expect(defaultGlucoseCtx(new Date(2026, 9, 15, 7, 40))).toBe('fasting');
  expect(defaultGlucoseCtx(new Date(2026, 9, 15, 13, 0))).toBe('pre_meal');
  expect(defaultGlucoseCtx(new Date(2026, 9, 15, 19, 45))).toBe('post_meal');
  expect(defaultGlucoseCtx(new Date(2026, 9, 15, 23, 40))).toBe('bedtime');
});
