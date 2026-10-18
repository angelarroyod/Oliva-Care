import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import Onboarding from '../app/(auth)/onboarding';

const mockRpc = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockSignOut = jest.fn();
jest.mock('@/features/auth/useAuth', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ error: null });
  mockSignOut.mockResolvedValue(undefined);
});

const pick = (title: string) => fireEvent.press(screen.getByText(title));
const next = (label: string) => fireEvent.press(screen.getByRole('button', { name: label }));

test('role step: radio cards, written error, single Continuar', () => {
  render(<Onboarding />);
  expect(screen.getByText('Paso 2 de 3')).toBeTruthy();
  expect(screen.getByRole('header', { name: '¿Cómo vas a usar Tend?' })).toBeTruthy();
  const radios = screen.getAllByRole('radio');
  expect(radios).toHaveLength(2);
  next('Continuar');
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByText('Elige una de las dos opciones.')).toBeTruthy();
  pick('Soy familiar');
  expect(screen.getAllByRole('radio')[1].props.accessibilityState.checked).toBe(true);
  expect(screen.queryByText('Elige una de las dos opciones.')).toBeNull();
});

test('nurse: patient step creates the patient and starts the shift', async () => {
  render(<Onboarding />);
  pick('Soy enfermera o enfermero');
  next('Continuar');
  expect(screen.getByText('Paso 3 de 3')).toBeTruthy();
  expect(screen.getByText('¿A quién vas a cuidar?')).toBeTruthy();
  next('Empezar el turno');
  expect(screen.getByText('Escribe el nombre del paciente.')).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Nombre del paciente'), ' Elena Rivas ');
  expect(screen.queryByText('Escribe el nombre del paciente.')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Edad'), '7a8');
  expect(screen.getByLabelText('Edad').props.value).toBe('78');
  next('Empezar el turno');
  await waitFor(() =>
    expect(mockRpc).toHaveBeenCalledWith('create_patient_with_nurse', { p_name: 'Elena Rivas', p_age: 78, p_room: null }),
  );
  expect(mockReplace).toHaveBeenCalledWith('/(app)/nurse/inicio');
});

test('a new step moves screen-reader focus to its h1; back returns to the role step', () => {
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  render(<Onboarding />);
  expect(focus).not.toHaveBeenCalled();
  pick('Soy enfermera o enfermero');
  next('Continuar');
  expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
  fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
  expect(screen.getByText('Paso 2 de 3')).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
});

test('family: code step counts characters, validates length and redeems', async () => {
  render(<Onboarding />);
  pick('Soy familiar');
  next('Continuar');
  expect(screen.getByText('Únete con un código')).toBeTruthy();
  expect(screen.getByText('Perfil → Invitar a la familia')).toBeTruthy();
  const input = screen.getByLabelText('Código de invitación');
  fireEvent.changeText(input, 'vx7-k');
  expect(screen.getByLabelText('Código de invitación').props.value).toBe('VX7K');
  expect(screen.getByText('6 letras o números. Llevas 4.')).toBeTruthy();
  next('Unirme al cuidado');
  expect(screen.getByText('El código tiene 6 caracteres. Has escrito 4.')).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalled();
  fireEvent.changeText(input, 'vx7k2');
  expect(screen.queryByText('El código tiene 6 caracteres. Has escrito 4.')).toBeNull();
  expect(screen.getByText('6 letras o números. Llevas 5.')).toBeTruthy();
  fireEvent.changeText(input, ' vx7-k2p9');
  expect(screen.getByLabelText('Código de invitación').props.value).toBe('VX7K2P');
  next('Unirme al cuidado');
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('redeem_invite', { p_code: 'VX7K2P' }));
  expect(mockReplace).toHaveBeenCalledWith('/(app)/family/inicio');
});

test('family: a rejected code shows the server error', async () => {
  mockRpc.mockResolvedValue({ error: { message: 'invalid' } });
  render(<Onboarding />);
  pick('Soy familiar');
  next('Continuar');
  fireEvent.changeText(screen.getByLabelText('Código de invitación'), 'AAAAAA');
  next('Unirme al cuidado');
  expect(await screen.findByText('Código inválido o expirado')).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
});

test('role step back signs out to Welcome, so a member-less session is never stuck here', async () => {
  render(<Onboarding />);
  fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/welcome'));
  expect(mockSignOut).toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
});
