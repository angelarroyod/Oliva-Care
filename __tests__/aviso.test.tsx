import { OFFLINE_ERROR } from '@/lib/errors';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import Aviso from '../app/(app)/nurse/aviso/[id]';
import { ToastProvider } from '@/components/Toast';
import type { ScheduleRow } from '@/features/care/types';
import type { Nurse } from '@/features/care/shifts';

// Thursday 15 October 2026, 23:40 local.
const mockAt = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);

const mockNurses: Nurse[] = [
  { id: 'c', name: 'Carmen Morales', short: 'Carmen', start: '22:00', end: '06:00' },
  { id: 'r', name: 'Rosa García', short: 'Rosa', start: '06:00', end: '22:00' },
];
const sched = (over: Partial<ScheduleRow>): ScheduleRow => ({
  id: 'lev', patient_id: 'p1', name: 'Levotiroxina', dose: '50 mcg', purpose: 'Tiroides', times: ['06:00:00'],
  reminder_mode: 'before', reminder_minutes: 15, active: true, start_date: '2026-10-01', end_date: null,
  created_at: mockAt(1, 0).toISOString(), updated_by: null, updated_at: mockAt(1, 0).toISOString(), ...over,
});
let mockSchedules: ScheduleRow[] = [];
let mockNurseList: Nurse[] = mockNurses;

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'lev' }),
}));
jest.mock('@/features/care/hooks', () => ({
  useCare: () => ({
    pid: 'p1', role: 'nurse', meId: 'c', myName: 'Carmen Morales', meNurse: null, patient: null,
    short: 'Elena', team: [], nurses: mockNurseList, names: () => '', now: mockAt(15, 23, 40),
  }),
  useSchedules: () => mockSchedules,
}));

const mockUpdate = jest.fn();
const mockEq = jest.fn((..._a: unknown[]) => Promise.resolve({ error: null as null | { message: string } }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ update: mockUpdate }) } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockImplementation(() => ({ eq: mockEq }));
  mockEq.mockImplementation(() => Promise.resolve({ error: null }));
  mockSchedules = [sched({})];
  mockNurseList = mockNurses;
});

const show = () => render(<ToastProvider><Aviso /></ToastProvider>);
const CROSS = 'El aviso de las 05:45 le llega a Carmen, pero la dosis de las 06:00 cae ya en el turno de Rosa. Si no da tiempo a darla, Carmen la deja en el relevo.';

test('shows who gets the reminder and warns when it crosses a shift', () => {
  show();
  expect(screen.getByText('Aviso de Levotiroxina')).toBeTruthy();
  expect(screen.getByText('50 mcg · cada día a las 06:00')).toBeTruthy();
  expect(screen.getByLabelText('Volver a medicación')).toBeTruthy();
  expect(screen.getByText('Sonará a las 05:45, 15 min antes de cada dosis.')).toBeTruthy();
  expect(screen.getByText('05:45')).toBeTruthy();
  expect(screen.getByText('Carmen Morales')).toBeTruthy();
  expect(screen.getByText('Turno de noche · 22:00 a 06:00')).toBeTruthy();
  expect(screen.getByText('Le llega a quien esté de turno cuando suena. Si cambian los turnos, se ajusta solo.')).toBeTruthy();
  expect(screen.getByText(CROSS)).toBeTruthy();
  expect(screen.getByText('A los 30 minutos, se avisa otra vez a quien esté de turno.')).toBeTruthy();
  expect(screen.getByText('«Sin registrar»')).toBeTruthy();
});

test('switching to exact updates the recipient and Guardar aviso saves it', async () => {
  show();
  fireEvent.press(screen.getByText('A la hora exacta'));
  expect(screen.getByText('Rosa García')).toBeTruthy();
  expect(screen.getByText('Turno de día · 06:00 a 22:00')).toBeTruthy();
  expect(screen.queryByText(CROSS)).toBeNull();

  fireEvent.press(screen.getByText('Guardar aviso'));
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ reminder_mode: 'exact', reminder_minutes: 0, updated_by: 'c' }));
  expect(mockEq).toHaveBeenCalledWith('id', 'lev');
  expect(screen.getByText('Aviso guardado. Sonará a las 06:00 y le llegará a Rosa.')).toBeTruthy();
});

test('several times: the toast says it goes to whoever is on shift', async () => {
  mockSchedules = [sched({ times: ['08:00:00', '20:00:00'] })];
  show();
  fireEvent.press(screen.getByText('30 min'));
  fireEvent.press(screen.getByText('Guardar aviso'));
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ reminder_mode: 'before', reminder_minutes: 30 }));
  expect(screen.getByText('Aviso guardado. Sonará a las 07:30 y 19:30, a quien esté de turno.')).toBeTruthy();
});

test('without nurses the row says whoever is on shift', () => {
  mockNurseList = [];
  show();
  expect(screen.getByText('Quien esté de turno')).toBeTruthy();
});

test('Dejar de dar stamps the suspension after confirming', async () => {
  show();
  fireEvent.press(screen.getByText('Dejar de dar este medicamento'));
  expect(screen.getByText('¿Dejar de dar Levotiroxina?')).toBeTruthy();
  expect(screen.getByText('Las tomas que quedan hoy dejarán de aparecer.')).toBeTruthy();
  expect(screen.getByText('Lo ya anotado se queda en el historial.')).toBeTruthy();
  fireEvent.press(screen.getByText('Sí, dejar de darlo'));
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ active: false, suspended_at: expect.any(String), updated_by: 'c' }));
  expect(screen.getByText('Levotiroxina: ya no se dará.')).toBeTruthy();
});

test('failed saves show the error inline and stay on the screen', async () => {
  mockEq.mockImplementation(() => Promise.resolve({ error: { message: 'Network request failed' } }));
  show();
  fireEvent.press(screen.getByText('Guardar aviso'));
  expect(await screen.findByText(OFFLINE_ERROR)).toBeTruthy();

  fireEvent.press(screen.getByText('Dejar de dar este medicamento'));
  expect(screen.queryByText(OFFLINE_ERROR)).toBeNull(); // the sheet opens clean
  fireEvent.press(screen.getByText('Sí, dejar de darlo'));
  expect(await screen.findByText(OFFLINE_ERROR)).toBeTruthy();
  expect(screen.getByText('¿Dejar de dar Levotiroxina?')).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
  expect(screen.queryByText(/^Aviso guardado/)).toBeNull();
});
