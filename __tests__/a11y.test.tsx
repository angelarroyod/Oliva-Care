import { render, screen, fireEvent } from '@testing-library/react-native';
import Estado from '../app/(app)/family/(tabs)/inicio';
import Mensajes from '../app/(app)/family/(tabs)/mensajes';
import Perfil from '../app/(app)/family/(tabs)/perfil';
import type { MemberRow, ReadingRow } from '@/features/care/types';

// Family screens: every control is labelled, status is written out, charts carry text.
const mockAt = (d: number, h: number, mi = 0) => new Date(2026, 9, d, h, mi);
const member = (id: string, role: MemberRow['role'], name: string): MemberRow => ({
  id: `m${id}`, patient_id: 'p1', profile_id: id, role, relationship: null, shift: null,
  shift_start: role === 'nurse' ? '22:00:00' : null, shift_end: role === 'nurse' ? '06:00:00' : null, profiles: { full_name: name },
});
const glucose = (d: number, value: number): ReadingRow => ({
  id: `g${d}`, patient_id: 'p1', control_id: `g${d}`, kind: 'glucose', value, value2: null, context: 'pre_meal',
  severity: value > 150 ? 'warn' : 'ok', taken_at: mockAt(d, 19).toISOString(), taken_by: 'c', note: null, family_notified: false,
});
const mockReadings = [glucose(12, 140), glucose(13, 160), glucose(15, 130)];

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), back: jest.fn() }) }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ insert: jest.fn() }) } }));
jest.mock('@/features/care/hooks', () => ({
  useCare: () => ({
    pid: 'p1', role: 'family', meId: 'l', myName: 'Lucía Rivas', meNurse: null, short: 'Elena',
    patient: { id: 'p1', full_name: 'Elena Rivas', age: 78, room: null, status: 'Estable', allergies: null },
    team: [member('c', 'nurse', 'Carmen Morales'), member('d', 'doctor', 'Dr. Méndez'), member('l', 'family', 'Lucía Rivas')],
    nurses: [{ id: 'c', name: 'Carmen Morales', short: 'Carmen', start: '22:00', end: '06:00' }],
    names: () => '', now: mockAt(15, 23, 40),
  }),
  useSince: () => mockAt(1, 0).toISOString(),
  useReadings: () => mockReadings,
  useSchedules: () => [],
  useDoseRows: () => [],
  useEvents: () => [],
  useHandoffs: () => [],
  useVitalPlans: () => [],
  useConditions: () => [],
  useMessages: () => [{ body: 'Hola', time: '23:00', fromSelf: false, senderId: 'c' }],
}));

test('Estado: profile button, tiles, week days, chart and toggle are labelled', () => {
  render(<Estado />);
  expect(screen.getByRole('button', { name: 'Perfil de Elena' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Medicación de hoy: 0 de 0 dosis dadas. Ver en el historial' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Signos de hoy: 1 control. Ver en el historial' })).toBeTruthy();
  expect(screen.getByRole('header', { name: '¿Cómo está Elena?' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Hoy' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Esta semana' })).toBeTruthy();

  // Week strip: today and past days are buttons with a written status; future days are disabled.
  expect(screen.getByLabelText('jueves 15, hoy: sin dosis. Ver historial')).toBeTruthy();
  const friday = screen.getByLabelText('viernes 16: aún no ha llegado');
  expect(friday.props.accessibilityState).toMatchObject({ disabled: true });

  // Status is a word next to the icon, never colour alone.
  expect(screen.getByText('Normal · 19:00')).toBeTruthy();

  expect(screen.getByLabelText('Glucosa antes de cenar: gráfica de 4 semanas. Esta semana, 3 días con lecturas, 1 fuera de su rango.')).toBeTruthy();

  const toggle = screen.getByRole('button', { name: 'Ver dolor y pulso' });
  expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
  fireEvent.press(toggle);
  expect(screen.getByRole('button', { name: 'Ver menos signos' }).props.accessibilityState).toMatchObject({ expanded: true });
});

test('Mensajes: list, bubbles, input and send button are labelled', () => {
  render(<Mensajes />);
  expect(screen.getByRole('header', { name: 'Carmen Morales' })).toBeTruthy();
  expect(screen.getByLabelText('Mensajes con Carmen Morales')).toBeTruthy();
  expect(screen.getByLabelText('Carmen dijo: Hola')).toBeTruthy();
  expect(screen.getByLabelText('Escribe un mensaje a Carmen Morales')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Gracias, Carmen' })).toBeTruthy();
});

test('Perfil: call buttons name the person; empty conditions are written out', () => {
  render(<Perfil />);
  expect(screen.getByRole('button', { name: 'Llamar a Carmen Morales' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Llamar a Dr. Méndez' })).toBeTruthy();
  expect(screen.queryByLabelText('Llamar a Lucía Rivas')).toBeNull();
  expect(screen.getByText('Sin condiciones anotadas.')).toBeTruthy();
  expect(screen.queryByText(/^Alergias:/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Emergencia: llamar al 112' })).toBeTruthy();
});
