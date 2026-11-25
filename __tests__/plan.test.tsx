import { render, screen, fireEvent, waitFor, within } from '@testing-library/react-native';
import { ToastProvider } from '@/components/Toast';
import Plan from '../app/(app)/plan';
import type { ConditionRow, VitalPlanRow } from '@/features/care/types';

const mockNow = new Date(2026, 9, 15, 23, 40);
const iso = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const row = (kind: VitalPlanRow['kind'], frequency: string, ranges: number[][], src: VitalPlanRow['source_conditions'], at: string, by: string | null = null, inRoutine = true): VitalPlanRow => ({
  patient_id: 'p1', kind, frequency, in_routine: inRoutine, ranges, alert_low: null, alert_high: null,
  source_conditions: src, updated_by: by, updated_at: at,
});
const mockPlan: VitalPlanRow[] = [
  row('bp', 'Mañana y noche', [[90, 140], [60, 90]], ['hypertension'], iso(10, 9)),
  row('hr', 'Con la presión', [[60, 100]], ['hypertension'], iso(10, 9)),
  row('glucose', 'En ayunas y antes de cenar', [[90, 150], [100, 180]], ['diabetes'], iso(14, 18, 20), 'r'),
  row('pain', 'Cada turno', [[0, 3]], [], iso(1, 9)),
  row('weight', 'Cada lunes', [], ['hypothyroidism'], iso(10, 9), null, false),
];
const mockConds: ConditionRow[] = [
  { patient_id: 'p1', condition: 'diabetes', added_by: 'r', added_at: iso(10, 9) },
  { patient_id: 'p1', condition: 'hypertension', added_by: 'r', added_at: iso(10, 9) },
  { patient_id: 'p1', condition: 'hypothyroidism', added_by: 'r', added_at: iso(10, 9) },
];
const mockNames = (id: string | null) => ({ r: 'Rosa García', n1: 'Ana Gil' })[id ?? ''] ?? '';

type Call = { table: string; op: string; arg?: unknown; opts?: unknown; filters: unknown[][] };
const mockCalls: Call[] = [];
// "table.op" that the fake backend rejects (null = everything succeeds).
let mockFail: string | null = null;
const mockChain = (table: string, op: string, arg?: unknown, opts?: unknown) => {
  const call: Call = { table, op, arg, opts, filters: [] };
  mockCalls.push(call);
  const error = mockFail === `${table}.${op}` ? { message: 'sin conexión' } : null;
  const q = {
    eq: (c: string, v: unknown) => (call.filters.push(['eq', c, v]), q),
    in: (c: string, v: unknown) => (call.filters.push(['in', c, v]), q),
    then: (ok: (r: { error: unknown }) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ error }).then(ok, ko),
  };
  return q;
};
let mockRole: 'nurse' | 'family' = 'nurse';
const mockRouter = { push: jest.fn(), navigate: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => ({
      insert: (r: unknown) => mockChain(t, 'insert', r),
      upsert: (r: unknown, o: unknown) => mockChain(t, 'upsert', r, o),
      delete: () => mockChain(t, 'delete'),
    }),
  },
}));
jest.mock('@/features/care/hooks', () => ({
  useCare: () => ({
    pid: 'p1', role: mockRole, meId: 'n1', myName: 'Ana Gil', meNurse: null, short: 'Marta', team: [], nurses: [],
    patient: null, names: mockNames, now: mockNow,
  }),
  useVitalPlans: () => mockPlan,
  useConditions: () => mockConds,
}));

beforeEach(() => {
  mockCalls.length = 0;
  mockRole = 'nurse';
  mockFail = null;
  jest.clearAllMocks();
});
const ui = () => render(<ToastProvider><Plan /></ToastProvider>);

test('nurse sees conditions, what is measured, permissions and the audit line', () => {
  ui();
  expect(screen.getByText('Plan de cuidados')).toBeTruthy();
  expect(screen.getByText('Marta · qué se mide y en qué rango')).toBeTruthy();
  for (const c of ['Diabetes', 'Hipertensión', 'Hipotiroidismo']) expect(screen.getByText(c)).toBeTruthy();
  expect(screen.getByText('Normal para Marta: 90 a 150 antes de comer, 100 a 180 al acostarse')).toBeTruthy();
  expect(screen.getByText('Normal para Marta: sin rango todavía')).toBeTruthy();
  expect(screen.getAllByText('Por hipertensión')).toHaveLength(2);
  expect(screen.getByText('Básico para todos')).toBeTruthy();
  expect(screen.getByText('Cualquier enfermera de Marta puede cambiar el plan. La familia lo ve, pero no puede editarlo.')).toBeTruthy();
  expect(screen.getByText('Último cambio: Rosa García, ayer a las 18:20 (rango de glucosa).')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Volver'));
  expect(mockRouter.back).toHaveBeenCalled();
});

test('family reads the plan without edit controls', () => {
  mockRole = 'family';
  ui();
  expect(screen.queryByText('Añadir condición')).toBeNull();
  expect(screen.queryByText('Cambiar rango')).toBeNull();
  expect(screen.getByText('Solo las enfermeras de Marta pueden cambiar el plan. Tú lo ves siempre actualizado.')).toBeTruthy();
});

test('range editor validates and upserts the plan row', async () => {
  ui();
  fireEvent.press(screen.getByLabelText('Cambiar rango de glucosa'));
  const lo = screen.getByLabelText('Antes de comer o en ayunas: mínimo');
  expect(lo.props.value).toBe('90');
  expect(screen.getByLabelText('Al acostarse o después de comer: máximo').props.value).toBe('180');

  fireEvent.changeText(lo, 'x');
  fireEvent.press(screen.getByText('Guardar rango'));
  expect(screen.getByText('Escribe solo números.')).toBeTruthy();
  fireEvent.changeText(lo, '160');
  fireEvent.press(screen.getByText('Guardar rango'));
  expect(screen.getByText('El mínimo tiene que ser menor que el máximo.')).toBeTruthy();
  expect(mockCalls).toHaveLength(0);

  fireEvent.changeText(lo, '80');
  fireEvent.press(screen.getByText('Guardar rango'));
  expect(await screen.findByText('Rango de glucosa guardado. El formulario de signos ya lo usa.')).toBeTruthy();
  expect(mockCalls[0]).toMatchObject({
    table: 'vital_plans', op: 'upsert', opts: { onConflict: 'patient_id,kind' },
    arg: { patient_id: 'p1', kind: 'glucose', ranges: [[80, 150], [100, 180]], source_conditions: ['diabetes'], updated_by: 'n1' },
  });
  expect(screen.queryByText('Guardar rango')).toBeNull();
});

test('a vital with no range gets one empty row', () => {
  ui();
  fireEvent.press(screen.getByLabelText('Cambiar rango de peso'));
  expect(screen.getByText('Rango normal')).toBeTruthy();
  expect(screen.getByLabelText('Rango normal: mínimo').props.value).toBe('');
  fireEvent.press(screen.getByText('Cancelar'));
  expect(screen.queryByText('Rango normal')).toBeNull();
});

test('adding a condition with suggested vitals, then undo', async () => {
  ui();
  fireEvent.press(screen.getByText('Añadir condición'));
  expect(screen.getByText('Te sugeriremos qué signos medir y en qué rango.')).toBeTruthy();
  expect(screen.getAllByText('Ya está en su plan')).toHaveLength(3);
  expect(screen.getByText('Sugiere: oxígeno, respiración y temperatura')).toBeTruthy();
  fireEvent.press(screen.getByText('EPOC / asma'));

  expect(screen.getByText('Sugerencias para el plan de Marta. Quita las que no necesite.')).toBeTruthy();
  expect(screen.getByText('Son sugerencias habituales, no una indicación médica. Confirma los rangos con su médico; podrás cambiarlos cuando quieras.')).toBeTruthy();
  expect(screen.getByText('Añadir con 3 signos nuevos')).toBeTruthy();
  fireEvent.press(within(screen.getAllByRole('checkbox')[2]).getByText('Temperatura'));
  fireEvent.press(screen.getByText('Añadir con 2 signos nuevos'));

  expect(await screen.findByText('EPOC / asma añadida. El formulario de signos ya pide oxígeno en sangre y frecuencia respiratoria.')).toBeTruthy();
  expect(mockCalls[0]).toMatchObject({ table: 'patient_conditions', op: 'upsert', arg: { patient_id: 'p1', condition: 'copd_asthma', added_by: 'n1' } });
  const up = mockCalls[1].arg as VitalPlanRow[];
  expect(up.map((r) => [r.kind, r.ranges, r.alert_low, r.source_conditions])).toEqual([
    ['spo2', [[88, 100]], 85, ['copd_asthma']],
    ['rr', [[12, 20]], 8, ['copd_asthma']],
  ]);

  fireEvent.press(screen.getByText('Deshacer'));
  await waitFor(() => expect(mockCalls).toHaveLength(4));
  expect(mockCalls[2]).toMatchObject({ table: 'patient_conditions', op: 'delete', filters: [['eq', 'patient_id', 'p1'], ['eq', 'condition', 'copd_asthma']] });
  expect(mockCalls[3]).toMatchObject({ table: 'vital_plans', op: 'delete', filters: [['eq', 'patient_id', 'p1'], ['in', 'kind', ['spo2', 'rr']]] });
});

test('condition whose vitals are already measured: sources grow, undo restores the old rows', async () => {
  ui();
  fireEvent.press(screen.getByText('Añadir condición'));
  fireEvent.press(screen.getByText('Insuficiencia renal'));
  const boxes = screen.getAllByRole('checkbox');
  expect(boxes.every((b) => b.props.accessibilityState.disabled && b.props.accessibilityState.checked)).toBe(true);
  expect(screen.getByText('Ya se mide: mañana y noche')).toBeTruthy();
  expect(screen.getByText('Rango actual: máxima 90 a 140, mínima 60 a 90')).toBeTruthy();
  fireEvent.press(screen.getByText('Añadir Insuficiencia renal'));

  expect(await screen.findByText('Insuficiencia renal añadida.')).toBeTruthy();
  const up = mockCalls[1].arg as VitalPlanRow[];
  expect(up.map((r) => [r.kind, r.source_conditions])).toEqual([
    ['bp', ['hypertension', 'renal_failure']],
    ['weight', ['hypothyroidism', 'renal_failure']],
  ]);

  fireEvent.press(screen.getByText('Deshacer'));
  await waitFor(() => expect(mockCalls).toHaveLength(4));
  const restored = mockCalls[3].arg as VitalPlanRow[];
  expect(mockCalls[3]).toMatchObject({ table: 'vital_plans', op: 'upsert' });
  expect(restored.map((r) => [r.kind, r.source_conditions, r.updated_by, r.updated_at])).toEqual([
    ['bp', ['hypertension'], null, iso(10, 9)],
    ['weight', ['hypothyroidism'], null, iso(10, 9)],
  ]);
});

test('a failed range save keeps the editor open and says so', async () => {
  mockFail = 'vital_plans.upsert';
  ui();
  fireEvent.press(screen.getByLabelText('Cambiar rango de glucosa'));
  fireEvent.changeText(screen.getByLabelText('Antes de comer o en ayunas: mínimo'), '80');
  fireEvent.press(screen.getByText('Guardar rango'));
  expect(await screen.findByText('No se pudo guardar. Vuelve a intentarlo.')).toBeTruthy(); // inline, next to the buttons
  expect(screen.getByText('Guardar rango')).toBeTruthy();
  expect(screen.getByLabelText('Antes de comer o en ayunas: mínimo').props.value).toBe('80');
  expect(screen.queryByText(/guardado/)).toBeNull();
});

test('if the plan rows fail, the new condition is removed again', async () => {
  mockFail = 'vital_plans.upsert';
  ui();
  fireEvent.press(screen.getByText('Añadir condición'));
  fireEvent.press(screen.getByText('EPOC / asma'));
  fireEvent.press(screen.getByText('Añadir con 3 signos nuevos'));
  expect(await screen.findByText('No se pudo guardar. Vuelve a intentarlo.')).toBeTruthy(); // inline, next to the buttons
  expect(mockCalls.map((c) => `${c.table}.${c.op}`)).toEqual(['patient_conditions.upsert', 'vital_plans.upsert', 'patient_conditions.delete']);
  expect(mockCalls[2].filters).toEqual([['eq', 'patient_id', 'p1'], ['eq', 'condition', 'copd_asthma']]);
  expect(screen.queryByText(/añadida/)).toBeNull();
  // The sheet stays open so the nurse can try again.
  expect(screen.getByText('Te sugerimos medir:')).toBeTruthy();
});

test('a failed condition insert writes nothing else', async () => {
  mockFail = 'patient_conditions.upsert';
  ui();
  fireEvent.press(screen.getByText('Añadir condición'));
  fireEvent.press(screen.getByText('EPOC / asma'));
  fireEvent.press(screen.getByText('Solo añadir la condición'));
  expect(await screen.findByText('No se pudo guardar. Vuelve a intentarlo.')).toBeTruthy(); // inline, next to the buttons
  expect(mockCalls.map((c) => `${c.table}.${c.op}`)).toEqual(['patient_conditions.upsert']);
  expect(screen.queryByText(/añadida/)).toBeNull();
});

test('choosing a condition switches the one sheet to its suggestions', () => {
  ui();
  fireEvent.press(screen.getByText('Añadir condición'));
  expect(screen.getByText('Añadir una condición')).toBeTruthy();
  fireEvent.press(screen.getByText('EPOC / asma'));
  expect(screen.queryByText('Añadir una condición')).toBeNull();
  expect(screen.queryByText('Te sugeriremos qué signos medir y en qué rango.')).toBeNull();
  expect(screen.getAllByText('Volver')).toHaveLength(1);
});
