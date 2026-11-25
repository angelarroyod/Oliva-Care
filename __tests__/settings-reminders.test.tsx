import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { TextScaleProvider } from '@/features/settings/textScale';
import Settings from '../app/(app)/settings/index';

let mockRole: 'nurse' | 'family' = 'nurse';
let mockState = 'off';
const mockEnable = jest.fn();
const mockDisable = jest.fn();

jest.mock('@/features/auth/useAuth', () => ({ useAuth: () => ({ signOut: jest.fn(), session: { user: { email: 'ana@correo.com' } } }) }));
jest.mock('@/features/care/hooks', () => ({ useCare: () => ({ patient: { full_name: 'Marta López' }, short: 'Marta', role: mockRole }) }));
jest.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
jest.mock('@/lib/prefs', () => ({ readPref: () => Promise.resolve(null), writePref: () => Promise.resolve() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/features/notifications/push', () => ({
  reminderState: () => Promise.resolve(mockState),
  enableReminders: () => mockEnable(),
  disableReminders: () => mockDisable(),
}));

const renderSettings = () => render(<TextScaleProvider><Settings /></TextScaleProvider>);
const toggle = () => screen.getByRole('switch', { name: 'Recordatorios de dosis' });

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'nurse';
  mockState = 'off';
  mockEnable.mockResolvedValue({ state: 'on', error: null });
  mockDisable.mockResolvedValue(null);
});

test('a nurse turns dose reminders on and off', async () => {
  renderSettings();
  expect((await screen.findByRole('switch', { name: 'Recordatorios de dosis' })).props.accessibilityState.checked).toBe(false);
  fireEvent.press(toggle());
  await waitFor(() => expect(toggle().props.accessibilityState.checked).toBe(true));
  fireEvent.press(toggle());
  await waitFor(() => expect(toggle().props.accessibilityState.checked).toBe(false));
  expect(mockEnable).toHaveBeenCalledTimes(1);
  expect(mockDisable).toHaveBeenCalledTimes(1);
});

test('permission off in the phone settings: says so and offers the settings', async () => {
  mockEnable.mockResolvedValue({ state: 'denied', error: null });
  renderSettings();
  fireEvent.press(await screen.findByRole('switch', { name: 'Recordatorios de dosis' }));
  expect(await screen.findByText('Los avisos de Oliva están desactivados en los ajustes del teléfono.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Abrir ajustes del teléfono' })).toBeTruthy();
});

test('a failed write is shown next to the switch', async () => {
  mockEnable.mockResolvedValue({ state: 'off', error: 'No se pudieron activar los recordatorios. Vuelve a intentarlo.' });
  renderSettings();
  fireEvent.press(await screen.findByRole('switch', { name: 'Recordatorios de dosis' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByText('No se pudieron activar los recordatorios. Vuelve a intentarlo.')).toBeTruthy();
});

test('web or Expo Go: explains where it works, no switch', async () => {
  mockState = 'unsupported';
  renderSettings();
  expect(await screen.findByText('Solo en la app instalada en el teléfono.')).toBeTruthy();
  expect(screen.queryByRole('switch')).toBeNull();
});

test('family never sees it', async () => {
  mockRole = 'family';
  renderSettings();
  await screen.findByText('ana@correo.com');
  expect(screen.queryByText('Recordatorios de dosis')).toBeNull();
});
