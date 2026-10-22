import { render, screen, fireEvent } from '@testing-library/react-native';
import Legal from '../app/legal';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));

test('legal screen shows the privacy and medical notice sections', () => {
  render(<Legal />);
  expect(screen.getByRole('header', { name: 'Privacidad y aviso médico' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Tus datos' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Aviso médico' })).toBeTruthy();
  expect(screen.getByText('Nunca vendemos tus datos ni los usamos para publicidad.')).toBeTruthy();
  expect(screen.getByText(/Oliva no es un aparato médico/)).toBeTruthy();
  expect(screen.getByText('En una emergencia, llama al 112.')).toBeTruthy();
});

test('back returns to where it was opened from', () => {
  render(<Legal />);
  fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
  expect(mockBack).toHaveBeenCalled();
});
