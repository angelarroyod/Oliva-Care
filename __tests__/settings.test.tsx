import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { TextScaleProvider } from '@/features/settings/textScale';
import Settings from '../app/(app)/settings/index';

const mockSignOut = jest.fn();
const mockInvoke = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockPatient: { full_name: string } | null = { full_name: 'Marta López' };

jest.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ signOut: mockSignOut, session: { user: { email: 'ana@correo.com' } } }),
}));
jest.mock('@/features/care/hooks', () => ({
  useCare: () => ({ patient: mockPatient, short: mockPatient ? mockPatient.full_name.split(' ')[0] : 'el paciente' }),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (n: string) => mockInvoke(n) } } }));
jest.mock('@/lib/prefs', () => ({ readPref: () => Promise.resolve(null), writePref: () => Promise.resolve() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush, back: mockBack }) }));

const renderSettings = () => render(<TextScaleProvider><Settings /></TextScaleProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mockPatient = { full_name: 'Marta López' };
  mockSignOut.mockResolvedValue(undefined);
  mockInvoke.mockResolvedValue({ error: null });
});

test('header, account email and back to profile', () => {
  renderSettings();
  expect(screen.getByRole('header', { name: 'Configuración' })).toBeTruthy();
  expect(screen.getByText('ana@correo.com')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Volver al perfil' }));
  expect(mockBack).toHaveBeenCalled();
});

test('text size goes 100 → 200 in steps of 10, with the ends disabled', () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  renderSettings();
  const smaller = () => screen.getByRole('button', { name: 'Texto más pequeño' });
  const bigger = () => screen.getByRole('button', { name: 'Texto más grande' });
  expect(screen.getByText('100 %')).toBeTruthy();
  expect(smaller().props.accessibilityState.disabled).toBe(true);
  fireEvent.press(bigger());
  expect(screen.getByText('110 %')).toBeTruthy();
  expect(announce).toHaveBeenLastCalledWith('110 %');
  for (let i = 0; i < 12; i++) fireEvent.press(bigger());
  expect(screen.getByText('200 %')).toBeTruthy();
  expect(bigger().props.accessibilityState.disabled).toBe(true);
  fireEvent.press(smaller());
  expect(screen.getByText('190 %')).toBeTruthy();
  expect(announce).toHaveBeenLastCalledWith('190 %');
  announce.mockRestore();
});

test('privacy row opens /legal; Cerrar sesión signs out to welcome', async () => {
  renderSettings();
  fireEvent.press(screen.getByText('Privacidad y aviso médico'));
  expect(mockPush).toHaveBeenCalledWith('/legal');
  fireEvent.press(screen.getByText('Cerrar sesión'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/welcome'));
  expect(mockSignOut).toHaveBeenCalled();
});

test('delete account: confirmation sheet, then delete + sign out', async () => {
  renderSettings();
  fireEvent.press(screen.getByText('Eliminar mi cuenta'));
  expect(screen.getByText('¿Eliminar tu cuenta?')).toBeTruthy();
  expect(screen.getByText('Se borrarán tu cuenta y tus mensajes.')).toBeTruthy();
  expect(screen.getByText('No se puede deshacer.')).toBeTruthy();
  expect(screen.getByText('El cuidado de Marta seguirá para el resto del equipo.')).toBeTruthy();
  fireEvent.press(screen.getByText('Sí, eliminar mi cuenta'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/welcome'));
  expect(mockInvoke).toHaveBeenCalledWith('delete-account');
  expect(mockSignOut).toHaveBeenCalled();
});

test('delete account failure is written out and keeps the session', async () => {
  mockInvoke.mockResolvedValue({ error: new Error('boom') });
  mockPatient = null;
  renderSettings();
  fireEvent.press(screen.getByText('Eliminar mi cuenta'));
  expect(screen.getByText('El cuidado del paciente seguirá para el resto del equipo.')).toBeTruthy();
  fireEvent.press(screen.getByText('Sí, eliminar mi cuenta'));
  expect(await screen.findByText('No se pudo eliminar la cuenta.')).toBeTruthy();
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});
