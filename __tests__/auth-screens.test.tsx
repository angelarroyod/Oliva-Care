import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ToastProvider } from '@/components/Toast';
import Login from '../app/(auth)/login';

const mockSignIn = jest.fn();
const mockReset = jest.fn();
const mockReplace = jest.fn();
jest.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ signIn: mockSignIn, signUp: jest.fn(), signOut: jest.fn(), loading: false, session: null }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }) }));
jest.mock('@/features/auth/appleAuth', () => ({ AppleButton: () => null }));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { resetPasswordForEmail: (e: string) => mockReset(e) } } }));

const renderLogin = () => render(<ToastProvider><Login /></ToastProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.mockResolvedValue({ error: null });
  mockReset.mockResolvedValue({ error: null });
});

test('validates before calling signIn, with written, announced errors', () => {
  renderLogin();
  fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
  expect(screen.getByText('Escribe tu correo completo, por ejemplo nombre@correo.com')).toBeTruthy();
  expect(screen.getByText('Escribe tu contraseña.')).toBeTruthy();
  expect(screen.getAllByRole('alert')).toHaveLength(2);
  expect(mockSignIn).not.toHaveBeenCalled();
  // Editing a field clears only that field's error.
  fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'ana@');
  expect(screen.queryByText('Escribe tu correo completo, por ejemplo nombre@correo.com')).toBeNull();
  expect(screen.getByText('Escribe tu contraseña.')).toBeTruthy();
});

test('signs in with the trimmed email and goes home', async () => {
  renderLogin();
  fireEvent.changeText(screen.getByLabelText('Correo electrónico'), ' ana@correo.com ');
  fireEvent.changeText(screen.getByLabelText('Contraseña'), 'secret123');
  fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
  await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('ana@correo.com', 'secret123'));
  expect(mockReplace).toHaveBeenCalledWith('/');
});

test('shows the server error as an alert', async () => {
  mockSignIn.mockResolvedValue({ error: 'Invalid login credentials' });
  renderLogin();
  fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'ana@correo.com');
  fireEvent.changeText(screen.getByLabelText('Contraseña'), 'x');
  fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
  expect(await screen.findByText('Invalid login credentials')).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
});

test('Mostrar / Ocultar toggles the password visibility', () => {
  renderLogin();
  const input = screen.getByLabelText('Contraseña');
  expect(input.props.secureTextEntry).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Mostrar' }));
  expect(screen.getByLabelText('Contraseña').props.secureTextEntry).toBe(false);
  const toggle = screen.getByRole('button', { name: 'Ocultar' });
  expect(toggle.props.accessibilityState.selected).toBe(true);
});

test('forgot password: asks for the email first, then sends the link', async () => {
  renderLogin();
  fireEvent.press(screen.getByText('¿Olvidaste tu contraseña?'));
  expect(await screen.findByText('Escribe tu correo y te enviaremos un enlace.')).toBeTruthy();
  expect(mockReset).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'ana@correo.com');
  fireEvent.press(screen.getByText('¿Olvidaste tu contraseña?'));
  expect(await screen.findByText('Te enviamos un enlace a ana@correo.com.')).toBeTruthy();
  expect(mockReset).toHaveBeenCalledWith('ana@correo.com');
});

test('Crear cuenta link swaps to signup', () => {
  renderLogin();
  fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/signup');
});
