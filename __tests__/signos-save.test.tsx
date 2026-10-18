import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ToastProvider } from '@/components/Toast';
import Signos from '../app/(app)/nurse/(tabs)/signos';
import type { VitalPlanRow } from '@/features/care/types';

// Thursday 15 October 2026, 23:40 local → glucose moment defaults to "Al acostarse".
const mockNow = new Date(2026, 9, 15, 23, 40);
const row = (kind: VitalPlanRow['kind'], frequency: string, ranges: number[][], src: VitalPlanRow['source_conditions'], inRoutine = true): VitalPlanRow => ({
  patient_id: 'p1', kind, frequency, in_routine: inRoutine, ranges, alert_low: null, alert_high: null,
  source_conditions: src, updated_by: null, updated_at: new Date(2026, 9, 14, 18, 20).toISOString(),
});
const mockPlan = [
  row('bp', 'Mañana y noche', [[90, 140], [60, 90]], ['hypertension']),
  row('hr', 'Mañana y noche', [[60, 100]], ['hypertension', 'hypothyroidism']),
  row('glucose', 'En ayunas y antes de cenar', [[90, 150], [100, 180]], ['diabetes']),
  row('pain', 'Cada turno', [[0, 3]], ['reduced_mobility']),
  row('temp', 'Cada mañana', [[36, 37.5]], [], false),
];

const mockRouter = { push: jest.fn(), navigate: jest.fn(), back: jest.fn() };
const mockInsert = jest.fn();
const mockDeleteEq = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'ctl-1' }));
jest.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ insert: mockInsert, delete: () => ({ eq: mockDeleteEq }) }) },
}));
jest.mock('@/features/care/hooks', () => ({
  useCare: () => ({
    pid: 'p1', role: 'nurse', meId: 'n1', myName: 'Ana Gil', meNurse: null, short: 'Marta', team: [], nurses: [],
    patient: { id: 'p1', full_name: 'Marta Ruiz', age: 81, room: null, status: '', allergies: null },
    names: () => '', now: mockNow,
  }),
  useVitalPlans: () => mockPlan,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.mockResolvedValue({ error: null });
  mockDeleteEq.mockResolvedValue({ error: null });
});

const ui = () => render(<ToastProvider><Signos /></ToastProvider>);
const type = (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label), text);

test('form follows the plan: header, intro, sections and plan link', () => {
  ui();
  expect(screen.getByText('Marta Ruiz · control de las 23:40')).toBeTruthy();
  expect(screen.getByText(/Este control sigue el plan de Marta: 4 signos por sus condiciones\./)).toBeTruthy();
  expect(screen.getByText('Mañana y noche · por hipertensión y hipotiroidismo')).toBeTruthy();
  expect(screen.getByText('Normal para Marta: máxima 90 a 140, mínima 60 a 90')).toBeTruthy();
  expect(screen.queryByText('Añadidos a este control')).toBeNull();
  fireEvent.press(screen.getByText('Ver plan'));
  expect(mockRouter.push).toHaveBeenCalledWith('/plan');
  // pain scale + glucose moment (23:40 → al acostarse)
  expect(screen.getAllByRole('radio', { name: /de 10$/ })).toHaveLength(11);
  expect(screen.getByRole('radio', { name: 'Al acostarse' }).props.accessibilityState.checked).toBe(true);
});

test('nothing filled → written error, no write', () => {
  ui();
  fireEvent.press(screen.getByText('Guardar 0 signos'));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByText('Anota al menos un signo para guardar.')).toBeTruthy();
  expect(mockInsert).not.toHaveBeenCalled();
});

test('out-of-range values: field messages, banner and family switch on by default', () => {
  ui();
  type('Presión arterial: máxima', '190');
  type('Presión arterial: mínima', '84');
  expect(screen.getByText('Máxima: muy por encima de lo normal. Avisa al médico (normal: 90 a 140)')).toBeTruthy();
  expect(screen.getByText('Hay un valor muy fuera de lo normal para Marta. Después de guardar, avisa al médico.')).toBeTruthy();
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(true);
  expect(screen.getByText('Recomendado: hay valores fuera de lo normal.')).toBeTruthy();
  expect(screen.getByText('Guardar y avisar a la familia')).toBeTruthy();
  // the nurse's choice wins
  fireEvent.press(screen.getByRole('switch'));
  expect(screen.getByText('Guardar 1 signo')).toBeTruthy();

  type('Presión arterial: máxima', '138');
  fireEvent.press(screen.getByRole('radio', { name: 'Antes de comer' }));
  type('Glucosa', '170');
  expect(screen.getByText('Por encima de lo normal para Marta (90 a 150 mg/dL antes de comer)')).toBeTruthy();
  expect(screen.getByText('Hay 1 valor fuera de lo normal para Marta. Revísalo antes de guardar.')).toBeTruthy();
  type('Pulso', 'abc');
  expect(screen.getByText('Escribe solo números, por ejemplo 72')).toBeTruthy();
  fireEvent.press(screen.getByText('Guardar 3 signos'));
  expect(screen.getByText('Revisa: pulso.')).toBeTruthy();
  expect(mockInsert).not.toHaveBeenCalled();
});

test('adding a vital on the fly, fever banner, and removing it', () => {
  ui();
  fireEvent.press(screen.getByLabelText('Añadir temperatura'));
  expect(screen.getByText('Añadidos a este control')).toBeTruthy();
  expect(screen.getByText('En su plan: cada mañana. Hoy no toca.')).toBeTruthy();
  type('Temperatura', '38,2');
  expect(screen.getByText('Fiebre: 38,2 °C. Después de guardar, avisa al médico.')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Añadir oxígeno en sangre'));
  expect(screen.getByText('No está en su plan.')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Quitar temperatura de este control'));
  expect(screen.queryByText(/^Fiebre:/)).toBeNull();
  expect(screen.getByLabelText('Añadir temperatura')).toBeTruthy();
});

test('save writes one reading per value under one control, then undo restores', async () => {
  ui();
  type('Presión arterial: máxima', '138');
  type('Presión arterial: mínima', '84');
  type('Glucosa', '120');
  fireEvent.press(screen.getByRole('radio', { name: '2 de 10' }));
  type('Nota', '  Durmió bien.  ');
  fireEvent.press(screen.getByText('Guardar 3 signos'));

  await waitFor(() => expect(mockRouter.navigate).toHaveBeenCalledWith('/nurse/inicio'));
  const rows = mockInsert.mock.calls[0][0];
  expect(rows).toHaveLength(3);
  const base = { patient_id: 'p1', control_id: 'ctl-1', taken_by: 'n1', note: 'Durmió bien.', family_notified: false };
  expect(rows[0]).toMatchObject({ ...base, kind: 'bp', value: 138, value2: 84, context: null, severity: 'ok' });
  expect(rows[1]).toMatchObject({ ...base, kind: 'glucose', value: 120, value2: null, context: 'bedtime', severity: 'ok' });
  expect(rows[2]).toMatchObject({ ...base, kind: 'pain', value: 2, severity: 'ok' });
  expect(typeof rows[0].taken_at).toBe('string');
  expect(screen.getByText('Control guardado.')).toBeTruthy();
  expect(screen.getByText('Guardar 0 signos')).toBeTruthy(); // form reset

  fireEvent.press(screen.getByText('Deshacer'));
  await waitFor(() => expect(mockRouter.navigate).toHaveBeenCalledWith('/nurse/signos'));
  expect(mockDeleteEq).toHaveBeenCalledWith('control_id', 'ctl-1');
  expect(screen.getByText('Guardar 3 signos')).toBeTruthy();
  expect(screen.getByLabelText('Glucosa').props.value).toBe('120');
});

test('save failure keeps the data and retries', async () => {
  mockInsert.mockResolvedValueOnce({ error: { message: 'network' } });
  ui();
  type('Pulso', '72');
  fireEvent.press(screen.getByText('Guardar 1 signo'));
  expect(await screen.findByText('No se pudo guardar el control. Tus datos siguen aquí: no se ha perdido nada.')).toBeTruthy();
  expect(screen.getByLabelText('Pulso').props.value).toBe('72');
  expect(mockRouter.navigate).not.toHaveBeenCalled();

  fireEvent.press(screen.getByText('Reintentar'));
  await waitFor(() => expect(mockRouter.navigate).toHaveBeenCalledWith('/nurse/inicio'));
  expect(mockInsert).toHaveBeenCalledTimes(2);
});

test('notify on → family_notified and the family toast', async () => {
  ui();
  type('Pulso', '72');
  fireEvent.press(screen.getByRole('switch'));
  fireEvent.press(screen.getByText('Guardar y avisar a la familia'));
  expect(await screen.findByText('Control guardado. La familia ha sido avisada.')).toBeTruthy();
  expect(mockInsert.mock.calls[0][0][0]).toMatchObject({ kind: 'hr', value: 72, family_notified: true, note: null });
});
