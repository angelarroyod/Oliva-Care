import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import Mensajes from '../app/(app)/family/(tabs)/mensajes';
import type { Message } from '@/features/care/hooks';

const mockInsert = jest.fn((_row: Record<string, unknown>) => Promise.resolve<{ error: { message: string } | null }>({ error: null }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ insert: mockInsert }) } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'm-new' }));
let mockMessages: Message[] = [];
jest.mock('@/features/care/hooks', () => ({
  useCare: () => ({
    pid: 'p1', meId: 'me', names: () => '', now: new Date(2026, 9, 15, 23, 40),
    nurses: [{ id: 'c', name: 'Carmen Morales', short: 'Carmen', start: '22:00', end: '06:00' }],
  }),
  useMessages: () => mockMessages,
}));

beforeEach(() => {
  mockInsert.mockClear();
  mockMessages = [];
});

test('sending inserts a message and clears the draft', async () => {
  render(<Mensajes />);
  const input = screen.getByLabelText('Escribe un mensaje a Carmen Morales');
  fireEvent.changeText(input, 'hola');
  fireEvent.press(screen.getByLabelText('Enviar mensaje'));
  await waitFor(() => expect(mockInsert).toHaveBeenCalledWith({ id: 'm-new', patient_id: 'p1', sender_id: 'me', body: 'hola' }));
  expect(input.props.value).toBe('');
});

test('Enter sends; blank drafts are ignored', async () => {
  render(<Mensajes />);
  const input = screen.getByLabelText('Escribe un mensaje a Carmen Morales');
  fireEvent.changeText(input, '   ');
  fireEvent(input, 'submitEditing');
  expect(mockInsert).not.toHaveBeenCalled();
  fireEvent.changeText(input, ' ¿Cenó bien? ');
  fireEvent(input, 'submitEditing');
  await waitFor(() => expect(mockInsert).toHaveBeenCalledWith({ id: 'm-new', patient_id: 'p1', sender_id: 'me', body: '¿Cenó bien?' }));
  // Enter keeps the composer focused for the next message.
  expect(input.props.submitBehavior).toBe('submit');
});

test('a failed send restores the draft and shows the error', async () => {
  mockInsert.mockResolvedValueOnce({ error: { message: 'Sin conexión' } });
  render(<Mensajes />);
  const input = screen.getByLabelText('Escribe un mensaje a Carmen Morales');
  fireEvent.changeText(input, 'hola');
  fireEvent.press(screen.getByLabelText('Enviar mensaje'));
  expect(await screen.findByText('No se pudo enviar. Vuelve a intentarlo.')).toBeTruthy();
  expect(screen.getByLabelText('Escribe un mensaje a Carmen Morales').props.value).toBe('hola');
});

test('a message saved offline is marked as not sent yet', () => {
  mockMessages = [
    { body: 'Hola', time: '23:30', fromSelf: false, senderId: 'c', pending: false },
    { body: '¿Cenó bien?', time: '23:40', fromSelf: true, senderId: 'me', pending: true },
  ];
  render(<Mensajes />);
  expect(screen.getByText('23:30')).toBeTruthy();
  expect(screen.getByText('23:40 · Pendiente de enviar')).toBeTruthy();
  expect(screen.getByLabelText('Tú dijiste: ¿Cenó bien?, pendiente de enviar')).toBeTruthy();
});
