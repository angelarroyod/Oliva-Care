import { mapMessage } from '@/features/care/hooks';

test('mapMessage flags self', () => {
  expect(mapMessage({ sender_id: 'me', body: 'hola', created_at: '2026-07-03T23:38:00Z' }, 'me').fromSelf).toBe(true);
  expect(mapMessage({ sender_id: 'nurse', body: 'hola', created_at: '2026-07-03T23:40:00Z' }, 'me').fromSelf).toBe(false);
});
