import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import Signup from '../app/(auth)/signup';

const mockSignUp = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ signUp: mockSignUp, signIn: jest.fn(), signOut: jest.fn(), loading: false, session: null }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockSignUp.mockResolvedValue({ error: null });
});

const fill = (name: string, email: string, pwd: string) => {
  fireEvent.changeText(screen.getByLabelText('Tu nombre'), name);
  fireEvent.changeText(screen.getByLabelText('Correo electrónico'), email);
  fireEvent.changeText(screen.getByLabelText('Contraseña'), pwd);
};

test('shows the step, title, hint and consent copy', () => {
  render(<Signup />);
  expect(screen.getByText('Paso 1 de 3')).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Crea tu cuenta' })).toBeTruthy();
  expect(screen.getByText('Al menos 8 letras o números.')).toBeTruthy();
  expect(screen.getByText('no es un aparato médico')).toBeTruthy();
});

test('writes every error before calling signUp', () => {
  render(<Signup />);
  fill(' ', 'ana', '1234567');
  fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
  expect(screen.getByText('Escribe tu nombre.')).toBeTruthy();
  expect(screen.getByText('Escribe tu correo completo, por ejemplo nombre@correo.com')).toBeTruthy();
  expect(screen.getByText('La contraseña necesita al menos 8 letras o números.')).toBeTruthy();
  expect(screen.getByText('Marca la casilla para continuar.')).toBeTruthy();
  expect(screen.getAllByRole('alert')).toHaveLength(4);
  expect(mockSignUp).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Contraseña'), '12345678');
  expect(screen.queryByText('La contraseña necesita al menos 8 letras o números.')).toBeNull();
  expect(screen.getAllByRole('alert')).toHaveLength(3);
});

test('consent checkbox clears its error; valid form signs up and goes to onboarding', async () => {
  render(<Signup />);
  fill('Ana Ruiz ', 'ana@correo.com', '12345678');
  fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
  expect(screen.getByText('Marca la casilla para continuar.')).toBeTruthy();
  const box = screen.getByRole('checkbox');
  fireEvent.press(box);
  expect(screen.getByRole('checkbox').props.accessibilityState.checked).toBe(true);
  expect(screen.queryByText('Marca la casilla para continuar.')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
  await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith('ana@correo.com', '12345678', 'Ana Ruiz'));
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/onboarding');
});

test('server error stays on the screen', async () => {
  mockSignUp.mockResolvedValue({ error: 'User already registered' });
  render(<Signup />);
  fill('Ana', 'ana@correo.com', '12345678');
  fireEvent.press(screen.getByRole('checkbox'));
  fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
  expect(await screen.findByText('User already registered')).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
});

test('opens the privacy policy', () => {
  render(<Signup />);
  fireEvent.press(screen.getByText('Leer la política de privacidad'));
  expect(mockPush).toHaveBeenCalledWith('/legal');
});
