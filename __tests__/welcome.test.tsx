import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { AccessibilityInfo, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import Welcome from '../app/(auth)/welcome';

jest.mock('expo-router', () => ({ useRouter: jest.fn() }));

const LOGO = 'Logotipo de Tend: dos manos que sostienen una cruz. Toca para repetir la animación.';

beforeEach(() => {
  jest.useFakeTimers();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('shows the wordmark header, tagline and bullets', async () => {
  render(<Welcome />);
  await act(async () => {});
  expect(screen.getByRole('header', { name: 'Tend' })).toBeTruthy();
  expect(screen.getByText('Cuidado profesional en casa, con la familia al tanto.')).toBeTruthy();
  expect(screen.getByText('Cuida a tu familiar en equipo, en un solo lugar.')).toBeTruthy();
  expect(screen.getByText('La enfermera anota cómo va el turno.')).toBeTruthy();
  expect(screen.getByText('La familia ve cómo está, en cualquier momento.')).toBeTruthy();
});

test('Crear cuenta → signup, Ya tengo cuenta → login', async () => {
  const push = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({ push });
  render(<Welcome />);
  await act(async () => {});
  fireEvent.press(screen.getByText('Crear cuenta'));
  expect(push).toHaveBeenCalledWith('/(auth)/signup');
  fireEvent.press(screen.getByText('Ya tengo cuenta'));
  expect(push).toHaveBeenCalledWith('/(auth)/login');
});

test('the logo animation plays, finishes under 5 s and replays on tap', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const timing = jest.spyOn(Animated, 'timing');
  render(<Welcome />);
  await act(async () => {});
  const played = timing.mock.calls.length;
  expect(played).toBeGreaterThan(0);
  // Longest track: the last letter, 1.6 s + 3 × .08 s stagger + .7 s ≈ 2.54 s.
  const end = Math.max(...timing.mock.calls.map(([, c]) => (c.delay ?? 0) + (c.duration ?? 0)));
  expect(end).toBeGreaterThan(2000);
  expect(end).toBeLessThanOrEqual(5000);
  await act(async () => { jest.advanceTimersByTime(5000); });
  fireEvent.press(screen.getByRole('button', { name: LOGO }));
  expect(timing.mock.calls.length).toBe(played * 2);
  await act(async () => { jest.advanceTimersByTime(5000); });
});

test('reduce motion: the logo is static and tapping does nothing', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const timing = jest.spyOn(Animated, 'timing');
  render(<Welcome />);
  await act(async () => {});
  fireEvent.press(screen.getByRole('button', { name: LOGO }));
  expect(timing).not.toHaveBeenCalled();
});
