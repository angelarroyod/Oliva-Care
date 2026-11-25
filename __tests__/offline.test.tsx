import { render, screen, act } from '@testing-library/react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { ToastProvider } from '@/components/Toast';
import { OfflineSync, flushText } from '@/components/Offline';
import { Screen } from '@/components/Screen';
import { T } from '@/components/T';
import { mutate, outboxSnapshot } from '@/lib/db';

jest.mock('@/lib/prefs', () => ({ readPref: async () => null, writePref: async () => {} }));
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));
const fetchMock = jest.fn(async () => ({ ok: true, status: 201, json: async () => null }));
globalThis.fetch = fetchMock as unknown as typeof fetch;

// A write supabase-js hasn't sent yet (what screens hand mutate()).
const write = () => ({
  method: 'POST', url: new URL('https://x.test/rest/v1/care_events'), headers: new Headers(), body: { type: 'note' },
  then: () => { throw new Error('sent while offline'); },
}) as unknown as PromiseLike<{ error: null }>;

const ui = (role: 'nurse' | 'family') =>
  render(
    <ToastProvider>
      <OfflineSync role={role}>
        <Screen><T>Contenido</T></Screen>
      </OfflineSync>
    </ToastProvider>,
  );
// The NetInfo listener OfflineSync registered on mount.
const net = (isConnected: boolean) =>
  act(async () => {
    const listener = (NetInfo.addEventListener as jest.Mock).mock.calls.at(-1)[0] as (s: Partial<NetInfoState>) => Promise<void>;
    await listener({ isConnected, isInternetReachable: isConnected });
  });

test('nurse: banner while offline counts what is waiting; back online it all goes out', async () => {
  ui('nurse');
  await net(true);
  expect(screen.queryByText(/Sin conexión/)).toBeNull();

  await net(false);
  expect(screen.getByText(/Lo que anotes se guarda en el teléfono y se enviará al volver la conexión\.$/)).toBeTruthy();
  await act(async () => { await mutate(write(), 'care_events'); });
  expect(screen.getByText(/ 1 registro pendiente de enviar\.$/)).toBeTruthy();
  await act(async () => { await mutate(write(), 'care_events'); });
  expect(screen.getByText(/ 2 registros pendientes de enviar\.$/)).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();

  await net(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(/Sin conexión/)).toBeNull();
  expect(screen.getByText('Conexión recuperada. Se enviaron 2 registros.')).toBeTruthy();
});

test('family: says it is showing the last saved data', async () => {
  ui('family');
  await net(false);
  expect(screen.getByText(/^Sin conexión\. Estás viendo lo último que se guardó\. Se actualizará al volver la conexión\.$/)).toBeTruthy();
  await net(true);
  expect(screen.queryByText(/Sin conexión/)).toBeNull();
});

test('online, a flush that stopped on a server error is tried again a few seconds later', async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  try {
    ui('nurse');
    await net(false);
    await act(async () => { await mutate(write(), 'care_events'); });
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => null });
    await net(true); // the server hiccups: the record stays on the phone
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outboxSnapshot().pending).toBe(1);
    await act(async () => { await jest.advanceTimersByTimeAsync(5_000); }); // no network change needed
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(outboxSnapshot().pending).toBe(0);
    expect(screen.getByText('Conexión recuperada. Se envió 1 registro.')).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

test('reconnect toast wording', () => {
  expect(flushText({ sent: 1, failed: 0 })).toBe('Conexión recuperada. Se envió 1 registro.');
  expect(flushText({ sent: 3, failed: 0 })).toBe('Conexión recuperada. Se enviaron 3 registros.');
  expect(flushText({ sent: 1, failed: 2 })).toBe('Conexión recuperada. Se envió 1 registro. No se pudieron enviar 2 registros.');
});

test('outside the signed-in app (no role) there is no banner', async () => {
  render(<ToastProvider><Screen><T>Login</T></Screen></ToastProvider>);
  expect(screen.queryByText(/Sin conexión/)).toBeNull();
});
