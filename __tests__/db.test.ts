import { mutate, onInvalidate } from '@/lib/db';

test('returns null on success', async () => {
  expect(await mutate(Promise.resolve({ error: null }))).toBeNull();
});

test('returns the error message on failure', async () => {
  expect(await mutate(Promise.resolve({ error: { message: 'boom' } }))).toBe('boom');
});

test('a successful write refreshes the named tables; a failed one does not', async () => {
  const fn = jest.fn();
  const off = onInvalidate('medication_doses', fn);
  await mutate(Promise.resolve({ error: null }), 'medication_doses');
  await mutate(Promise.resolve({ error: { message: 'x' } }), 'medication_doses');
  expect(fn).toHaveBeenCalledTimes(1);
  off();
  await mutate(Promise.resolve({ error: null }), 'medication_doses');
  expect(fn).toHaveBeenCalledTimes(1);
});
