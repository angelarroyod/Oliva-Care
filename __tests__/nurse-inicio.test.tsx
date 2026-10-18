import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { ToastProvider } from '@/components/Toast';
import Inicio from '../app/(app)/nurse/(tabs)/inicio';
import type { DoseRow, HandoffRow, MemberRow, PatientRow, ReadingRow, ScheduleRow } from '@/features/care/types';
import type { Nurse } from '@/features/care/shifts';

// Thursday 15 October 2026, 23:40 local; Carmen is on the night shift.
const mockAt = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);
const iso = (d: Date) => d.toISOString();

const carmen: Nurse = { id: 'c', name: 'Carmen Morales', short: 'Carmen', start: '22:00', end: '06:00' };
const rosa: Nurse = { id: 'r', name: 'Rosa García', short: 'Rosa', start: '06:00', end: '22:00' };
const member = (profile_id: string, role: MemberRow['role'], full_name: string): MemberRow => ({
  id: `m-${profile_id}`, patient_id: 'p1', profile_id, role, relationship: null, shift: null, shift_start: null, shift_end: null,
  profiles: { full_name },
});
const mockTeam = [member('c', 'nurse', 'Carmen Morales'), member('r', 'nurse', 'Rosa García'), member('d', 'doctor', 'Dr. Méndez')];
const mockPatient: PatientRow = { id: 'p1', full_name: 'Elena Rivas', age: 78, room: 'Habitación principal', status: 'Estable', allergies: null };

const sched = (id: string, name: string, dose: string, times: string[]): ScheduleRow => ({
  id, patient_id: 'p1', name, dose, purpose: null, times: times.map((t) => `${t}:00`), reminder_mode: 'exact', reminder_minutes: 0,
  active: true, start_date: '2026-10-01', end_date: null, created_at: iso(mockAt(1, 0)), updated_by: null, updated_at: iso(mockAt(1, 0)),
});
const mockSchedules = [sched('met', 'Metformina', '850 mg', ['08:00', '14:00', '20:00']), sched('los', 'Losartán', '50 mg', ['23:30'])];
const given = (sid: string, at: Date): DoseRow => ({
  id: `${sid}${at.getTime()}`, schedule_id: sid, patient_id: 'p1', scheduled_for: iso(at), status: 'given',
  recorded_at: iso(at), recorded_by: 'r', recorded_late: false, skip_reason: null, skip_note: null,
});
const temp = (value: number, at: Date): ReadingRow => ({
  id: `t${at.getTime()}`, patient_id: 'p1', control_id: `k${at.getTime()}`, kind: 'temp', value, value2: null, context: null,
  severity: value > 37.5 ? 'warn' : 'ok', taken_at: iso(at), taken_by: 'c', note: null, family_notified: false,
});

// 08:00 and 20:00 given; 14:00 never recorded (sin registrar); 23:30 Losartán due 10 min ago.
let mockRows: DoseRow[] = [];
let mockReadings: ReadingRow[] = [];
let mockHandoffs: HandoffRow[] = [];
let mockMe: Nurse | null = carmen;

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, navigate: mockNavigate, back: jest.fn() }) }));

const mockInsert = jest.fn((_row: unknown) => Promise.resolve({ error: null }));
const mockFrom = jest.fn((_table: string) => ({ insert: mockInsert }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'e-new' }));

jest.mock('@/features/care/hooks', () => ({
  useCare: () => ({
    pid: 'p1', role: 'nurse', meId: 'c', myName: 'Carmen Morales', meNurse: mockMe, patient: mockPatient, short: 'Elena',
    team: mockTeam, nurses: [mockMe ?? { ...carmen, start: null, end: null }, rosa],
    names: (id?: string | null) => mockTeam.find((m) => m.profile_id === id)?.profiles?.full_name ?? '',
    now: mockAt(15, 23, 40),
  }),
  useSince: () => iso(mockAt(14, 0)),
  useSchedules: () => mockSchedules,
  useDoseRows: () => mockRows,
  useReadings: () => mockReadings,
  useEvents: () => [],
  useHandoffs: () => mockHandoffs,
  useConditions: () => [
    { patient_id: 'p1', condition: 'diabetes', added_by: null, added_at: iso(mockAt(1, 0)) },
    { patient_id: 'p1', condition: 'hypertension', added_by: null, added_at: iso(mockAt(1, 0)) },
  ],
  useVitalPlans: () => [],
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRows = [given('met', mockAt(15, 8)), given('met', mockAt(15, 20))];
  mockReadings = [];
  mockHandoffs = [];
  mockMe = carmen;
});

const renderInicio = () => render(<ToastProvider><Inicio /></ToastProvider>);

test('shows the shift, the due dose first, the unrecorded dose, the patient and this shift', () => {
  renderInicio();
  expect(screen.getByText('Buenas noches, Carmen')).toBeTruthy();
  expect(screen.getByText('Turno de noche · de 22:00 a 06:00')).toBeTruthy();

  expect(screen.getByText('LO SIGUIENTE')).toBeTruthy();
  expect(screen.getByText('Dar Losartán 50 mg')).toBeTruthy();
  expect(screen.getByText('Tocaba a las 23:30, hace 10 min. Si no se puede dar, anota por qué.')).toBeTruthy();
  fireEvent.press(screen.getByText('Ir a medicación'));
  expect(mockPush).toHaveBeenCalledWith('/nurse/medicacion');

  expect(screen.getByText('Metformina de las 14:00 quedó sin registrar.')).toBeTruthy();
  expect(screen.getByText('Revisar en Medicación')).toBeTruthy();

  expect(screen.getByText('Elena Rivas')).toBeTruthy();
  expect(screen.getByText('78 años · Habitación principal')).toBeTruthy();
  expect(screen.getByText('Estable')).toBeTruthy();
  expect(screen.getByText('Diabetes')).toBeTruthy();
  expect(screen.getByText('Hipertensión')).toBeTruthy();
  fireEvent.press(screen.getByText('Plan de cuidados'));
  expect(mockPush).toHaveBeenCalledWith('/plan');

  expect(screen.getByText('2 de 4 dosis dadas hoy · 1 sin registrar')).toBeTruthy();
  expect(screen.getByText('Según su plan: presión, pulso, oxígeno y temperatura')).toBeTruthy();
  expect(screen.getByText('Todo lo de hoy, hora a hora')).toBeTruthy();
  expect(screen.getByText('Entregar a las 06:00')).toBeTruthy();
  fireEvent.press(screen.getByText('Historial'));
  expect(mockNavigate).toHaveBeenCalledWith('/nurse/historial');

  fireEvent.press(screen.getByLabelText('Tu perfil, Carmen Morales'));
  expect(mockNavigate).toHaveBeenCalledWith('/nurse/perfil');
});

test('an open fever comes first: calling logs the doctor call and opens the dialer', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  mockReadings = [temp(38.2, mockAt(15, 23, 40))];
  renderInicio();
  expect(screen.getByText('AVISA AL MÉDICO')).toBeTruthy();
  expect(screen.getByText('Fiebre de 38,2 °C a las 23:40')).toBeTruthy();
  fireEvent.press(screen.getByText('Llamar al Dr. Méndez'));
  await waitFor(() => expect(openURL).toHaveBeenCalledWith('tel:'));
  expect(mockFrom).toHaveBeenCalledWith('care_events');
  expect(mockInsert).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'e-new', patient_id: 'p1', author_id: 'c', type: 'doctor_call', severity: 'warning', body: 'Fiebre de 38,2 °C a las 23:40.' }),
  );
  expect(screen.getByText('Llamando al Dr. Méndez… Queda anotado que avisaste al médico.')).toBeTruthy();
});

test('all done once the dose, a control and my handoff are in', () => {
  mockRows = [...mockRows, given('met', mockAt(15, 14)), given('los', mockAt(15, 23, 30))];
  mockReadings = [temp(36.6, mockAt(15, 23, 0))];
  mockHandoffs = [{ id: 'h', patient_id: 'p1', nurse_id: 'c', summary: '', recommendation: '', started_at: iso(mockAt(15, 22)), ended_at: iso(mockAt(15, 23, 35)) }];
  renderInicio();
  expect(screen.getByText('Todo al día')).toBeTruthy();
  expect(screen.getByText('Turno entregado. Buen descanso, Carmen.')).toBeTruthy();
  expect(screen.queryByText(/quedó sin registrar/)).toBeNull();
  expect(screen.getByText('Último control a las 23:00')).toBeTruthy();
  expect(screen.getByText('Entregado a Rosa')).toBeTruthy();
  fireEvent.press(screen.getByText('Ver relevo'));
  expect(mockNavigate).toHaveBeenCalledWith('/nurse/relevo');
});

test('a nurse without a fixed shift', () => {
  mockMe = null;
  renderInicio();
  expect(screen.getByText('Sin turno fijo')).toBeTruthy();
});
