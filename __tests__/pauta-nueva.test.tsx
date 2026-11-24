import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import PautaNueva from '../app/(app)/nurse/pauta-nueva';
import { ToastProvider } from '@/components/Toast';

// Thursday 15 October 2026, 16:00 local.
const mockNow = new Date(2026, 9, 15, 16, 0);

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn(), navigate: jest.fn() }) }));
jest.mock('@/features/care/hooks', () => ({
  useCare: () => ({
    pid: 'p1', role: 'nurse', meId: 'c', myName: 'Carmen Morales', meNurse: null, patient: null,
    short: 'Elena', team: [], nurses: [], names: () => '', now: mockNow,
  }),
}));
const mockInsert = jest.fn((..._a: unknown[]) => Promise.resolve({ error: null as null | { message: string } }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ insert: mockInsert }) } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 's-new' }));

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.mockImplementation(() => Promise.resolve({ error: null }));
});

const show = () => render(<ToastProvider><PautaNueva /></ToastProvider>);

test('errors appear only after the first save attempt', () => {
  show();
  expect(screen.getByText('Añadir medicamento')).toBeTruthy();
  expect(screen.getByText('Se repetirá cada día a las horas que elijas.')).toBeTruthy();
  expect(screen.queryByText('Escribe el nombre del medicamento.')).toBeNull();

  fireEvent.press(screen.getByText('Guardar medicamento'));
  expect(screen.getByText('Escribe el nombre del medicamento.')).toBeTruthy();
  expect(screen.getByText('Escribe las horas así: 08:00, 20:00 (hasta 12).')).toBeTruthy();
  expect(screen.getAllByRole('alert')).toHaveLength(2);
  expect(mockInsert).not.toHaveBeenCalled();

  // live after that
  fireEvent.changeText(screen.getByLabelText('Medicamento'), 'Paracetamol');
  expect(screen.queryByText('Escribe el nombre del medicamento.')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Horas'), '8am');
  expect(screen.getByText('Escribe las horas así: 08:00, 20:00 (hasta 12).')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Durante (días)'), '400');
  expect(screen.getByText('Escribe un número de días entre 1 y 365.')).toBeTruthy();
});

test('presets fill the hours and saving inserts a dated plan', async () => {
  show();
  fireEvent.changeText(screen.getByLabelText('Medicamento'), ' Paracetamol ');
  fireEvent.changeText(screen.getByLabelText('Dosis'), '1 g');
  fireEvent.press(screen.getByText('Cada 8 h'));
  expect(screen.getByLabelText('Horas').props.value).toBe('06:00, 14:00, 22:00');
  expect(screen.getByText('Sonará a las 05:45, 13:45 y a las 21:45, 15 min antes de cada dosis.')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Durante (días)'), '5');
  fireEvent.press(screen.getByText('A la hora exacta'));

  fireEvent.press(screen.getByText('Guardar medicamento'));
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  expect(mockInsert).toHaveBeenCalledWith({
    id: 's-new', patient_id: 'p1', name: 'Paracetamol', dose: '1 g', purpose: null, times: ['06:00', '14:00', '22:00'],
    reminder_mode: 'exact', reminder_minutes: 0, start_date: '2026-10-15', end_date: '2026-10-19', created_by: 'c', updated_by: 'c',
  });
  expect(screen.getByText('Paracetamol añadido. Próxima dosis hoy a las 22:00.')).toBeTruthy();
});

test('continuous plan with free-typed hours; a failed insert stays on the form', async () => {
  mockInsert.mockImplementation(() => Promise.resolve({ error: { message: 'Sin conexión' } }));
  show();
  fireEvent.changeText(screen.getByLabelText('Medicamento'), 'Omeprazol');
  fireEvent.changeText(screen.getByLabelText('Para qué es'), 'Estómago');
  fireEvent.changeText(screen.getByLabelText('Horas'), '8 y 9:30');
  fireEvent.press(screen.getByText('Guardar medicamento'));
  await waitFor(() => expect(mockInsert).toHaveBeenCalled());
  expect(mockInsert.mock.calls[0][0]).toEqual(
    expect.objectContaining({ purpose: 'Estómago', times: ['08:00', '09:30'], reminder_mode: 'before', reminder_minutes: 15, end_date: null }),
  );
  expect(await screen.findByText('No se pudo guardar. Vuelve a intentarlo.')).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Medicamento').props.value).toBe('Omeprazol');
});
