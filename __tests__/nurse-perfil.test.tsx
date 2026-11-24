import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
import { ToastProvider } from '@/components/Toast';
import Perfil from '../app/(app)/nurse/(tabs)/perfil';
import type { Nurse } from '@/features/care/shifts';

const mockCarmen: Nurse = { id: 'c', name: 'Carmen Morales', short: 'Carmen', start: '22:00', end: '06:00' };
let mockMe: Nurse | null = mockCarmen;
jest.mock('@/features/care/hooks', () => ({
  useCare: () => ({ pid: 'p1', role: 'nurse', meId: 'c', myName: 'Carmen Morales', meNurse: mockMe, short: 'Elena', now: new Date(2026, 9, 15, 23, 40) }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, navigate: jest.fn(), back: jest.fn() }) }));

// invites query: from('invites').select().eq().eq().is().gt().order().limit().maybeSingle()
let mockInvite: { code: string } | null = null;
const mockInsert = jest.fn((_row: unknown) => Promise.resolve({ error: null }));
const mockRpc = jest.fn((_fn: string, _args: unknown) => Promise.resolve({ error: null }));
jest.mock('@/lib/supabase', () => {
  const query: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'gt', 'order', 'limit']) query[m] = () => query;
  query.maybeSingle = () => Promise.resolve({ data: mockInvite, error: null });
  return { supabase: { from: () => ({ ...query, insert: mockInsert }), rpc: (fn: string, args: unknown) => mockRpc(fn, args) } };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMe = mockCarmen;
  mockInvite = null;
});

const renderPerfil = () => render(<ToastProvider><Perfil /></ToastProvider>);

test('shows me, my shift and shares the current invite code letter by letter', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
  mockInvite = { code: 'VX7K2P' };
  renderPerfil();
  expect(screen.getByText('Perfil')).toBeTruthy();
  expect(screen.getByText('Carmen Morales')).toBeTruthy();
  expect(screen.getByText('Enfermera · turno de noche, 22:00 a 06:00')).toBeTruthy();
  expect(screen.getByText('Turno de noche · 22:00 a 06:00')).toBeTruthy();
  expect(screen.getByText('Comparte este código para que sigan el cuidado de Elena.')).toBeTruthy();

  expect(await screen.findByLabelText('Código V X 7 K 2 P')).toBeTruthy();
  fireEvent.press(screen.getByText('Compartir código'));
  expect(share).toHaveBeenCalledWith({ message: 'Únete al cuidado de Elena en Oliva. Código: VX7K2P' });

  fireEvent.press(screen.getByText('Configuración y tamaño de texto'));
  expect(mockPush).toHaveBeenCalledWith('/settings');
});

test('creates a code when there is no open invite', async () => {
  renderPerfil();
  fireEvent.press(await screen.findByText('Crear código'));
  await waitFor(() => expect(mockInsert).toHaveBeenCalled());
  const row = mockInsert.mock.calls[0][0] as { code: string };
  expect(row).toMatchObject({ patient_id: 'p1', role: 'family', invited_by: 'c' });
  expect(row.code).toMatch(/^[A-Z2-9]{6}$/);
  expect(await screen.findByText(row.code)).toBeTruthy();
});

test('changing the shift validates the times and calls set_my_shift', async () => {
  renderPerfil();
  await screen.findByText('Crear código'); // invite loaded
  fireEvent.press(screen.getByText('Cambiar turno'));
  expect(screen.getByLabelText('Empieza').props.value).toBe('22:00');
  expect(screen.getByLabelText('Termina').props.value).toBe('06:00');

  fireEvent.changeText(screen.getByLabelText('Empieza'), '25:00');
  fireEvent.press(screen.getByText('Guardar turno'));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByText('Escribe una hora, por ejemplo 22:00.')).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByLabelText('Empieza'), '21:00');
  fireEvent.press(screen.getByText('Guardar turno'));
  await waitFor(() => expect(screen.getByText('Turno guardado.')).toBeTruthy());
  expect(mockRpc).toHaveBeenCalledWith('set_my_shift', { p_patient: 'p1', p_start: '21:00', p_end: '06:00' });
});

test('removing the fixed shift sends nulls', async () => {
  renderPerfil();
  await screen.findByText('Crear código');
  fireEvent.press(screen.getByText('Cambiar turno'));
  fireEvent.press(screen.getByText('Quitar turno fijo'));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('set_my_shift', { p_patient: 'p1', p_start: null, p_end: null }));
});

test('a nurse without a fixed shift', async () => {
  mockMe = { ...mockCarmen, start: null, end: null };
  renderPerfil();
  await screen.findByText('Crear código');
  expect(screen.getByText('Enfermera · sin turno fijo')).toBeTruthy();
  fireEvent.press(screen.getByText('Cambiar turno'));
  expect(screen.queryByText('Quitar turno fijo')).toBeNull();
});
