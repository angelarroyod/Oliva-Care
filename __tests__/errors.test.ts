import { OFFLINE_ERROR, errorText, failedTo } from '@/lib/errors';

test('no error, no text', () => {
  expect(errorText(null)).toBeNull();
  expect(errorText(undefined)).toBeNull();
});

test('known codes get their own Spanish text', () => {
  expect(errorText({ code: '42501', message: 'new row violates row-level security policy' })).toBe('No tienes permiso para hacer este cambio.');
  expect(errorText({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('El correo o la contraseña no son correctos.');
  expect(errorText({ code: 'PGRST301', message: 'JWT expired' })).toBe('Tu sesión ha caducado. Sal y vuelve a entrar.');
});

test('network failures say so', () => {
  expect(errorText({ message: 'TypeError: Failed to fetch' })).toBe(OFFLINE_ERROR);
  expect(errorText({ message: 'Network request failed' })).toBe(OFFLINE_ERROR);
});

test('anything else gets the fallback, never the server message', () => {
  expect(errorText({ code: 'XX000', message: 'internal error' })).toBe('No se pudo guardar. Vuelve a intentarlo.');
  expect(errorText({ message: 'boom' }, 'No se pudo entrar. Vuelve a intentarlo.')).toBe('No se pudo entrar. Vuelve a intentarlo.');
});

test('failedTo says "no se pudo" once', () => {
  expect(failedTo('No se pudo deshacer.', 'No se pudo guardar. Vuelve a intentarlo.')).toBe('No se pudo deshacer. Vuelve a intentarlo.');
  expect(failedTo('No se pudo enviar.', OFFLINE_ERROR)).toBe(`No se pudo enviar. ${OFFLINE_ERROR}`);
});
