import { createClient } from '@supabase/supabase-js';
import {
  SAVED_OFFLINE, flush, lastQueued, mutate, onInvalidate, outboxSnapshot, saved, setOnline, unqueue,
} from '@/lib/db';

const mockPrefs = new Map<string, string>();
jest.mock('@/lib/prefs', () => ({
  readPref: async (k: string) => mockPrefs.get(k) ?? null,
  writePref: async (k: string, v: string) => { mockPrefs.set(k, v); },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));

// Real supabase-js builders: the outbox reads their method/url/headers/body.
const client = createClient('https://x.supabase.co', 'anon', { auth: { persistSession: false, autoRefreshToken: false } });
const reading = (control: string) => client.from('vital_readings').insert([{ control_id: control, kind: 'hr', value: 72 }]);
const res = (status: number, body: unknown = null) => ({ ok: status < 300, status, json: async () => body });
const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

beforeEach(async () => {
  setOnline(true);
  fetchMock.mockReset().mockResolvedValue(res(201));
  await flush(); // drain whatever a test left behind
  fetchMock.mockClear();
});

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

test('online writes go straight to the server and keep their toast', async () => {
  await mutate(Promise.resolve({ error: null }));
  expect(lastQueued()).toBe(0);
  expect(saved('Control guardado.')).toBe('Control guardado.');
});

test('offline: writes are kept on the phone, then sent in order with fresh auth', async () => {
  const fn = jest.fn();
  const off = onInvalidate('vital_readings', fn);
  setOnline(false);
  expect(await mutate(reading('k1'), 'vital_readings')).toBeNull();
  expect(saved('Control guardado.')).toBe(SAVED_OFFLINE);
  await mutate(
    client.from('medication_doses').upsert({ schedule_id: 's1', scheduled_for: '2026-10-15T06:00:00Z', status: 'given' }, { onConflict: 'schedule_id,scheduled_for' }),
    'medication_doses',
  );
  expect(fetchMock).not.toHaveBeenCalled();
  expect(fn).not.toHaveBeenCalled(); // nothing changed on the server yet
  expect(outboxSnapshot()).toEqual({ online: false, pending: 2 });
  const stored = mockPrefs.get('tend.outbox')!;
  expect(JSON.parse(stored)).toHaveLength(2);
  expect(stored).not.toContain('tok'); // auth is never stored

  expect(await flush()).toEqual({ sent: 0, failed: 0 }); // still offline: nothing goes out
  setOnline(true);
  expect(await flush()).toEqual({ sent: 2, failed: 0 });
  const [[url1, init1], [url2, init2]] = fetchMock.mock.calls;
  expect(url1).toContain('https://x.supabase.co/rest/v1/vital_readings');
  expect(init1).toMatchObject({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer tok', apikey: expect.any(String) }) });
  expect(JSON.parse(init1.body)).toEqual([{ control_id: 'k1', kind: 'hr', value: 72 }]);
  expect(decodeURIComponent(url2)).toContain('on_conflict=schedule_id,scheduled_for'); // idempotent replay
  expect(init2.headers.prefer).toContain('resolution=merge-duplicates');
  expect(fn).toHaveBeenCalledTimes(1);
  expect(outboxSnapshot()).toEqual({ online: true, pending: 0 });
  expect(mockPrefs.get('tend.outbox')).toBe('[]');
  off();
});

test('undo while offline takes the write back out of the outbox', async () => {
  setOnline(false);
  await mutate(reading('k2'), 'vital_readings');
  const id = lastQueued();
  expect(id).not.toBe(0);
  expect(unqueue(id)).toBe(true);
  expect(outboxSnapshot().pending).toBe(0);
  expect(unqueue(id)).toBe(false); // gone: the caller would run the compensating write
  setOnline(true);
  await flush();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('offline, a request that already started (not a builder) just runs', async () => {
  setOnline(false);
  expect(await mutate(Promise.resolve({ error: { message: 'Network request failed' } }))).toBe('Network request failed');
  expect(outboxSnapshot().pending).toBe(0);
});

test('flush: a duplicate counts as sent, a rejected write is dropped, a network drop keeps the rest', async () => {
  setOnline(false);
  for (const k of ['a', 'b', 'c', 'd']) await mutate(reading(k), 'vital_readings');
  setOnline(true);
  fetchMock
    .mockResolvedValueOnce(res(409, { code: '23505' })) // already there (a resend after a lost response)
    .mockResolvedValueOnce(res(403, { code: '42501' })) // RLS said no: retrying won't help
    .mockRejectedValueOnce(new TypeError('Network request failed'));
  expect(await flush()).toEqual({ sent: 1, failed: 1 });
  expect(outboxSnapshot().pending).toBe(2);

  fetchMock.mockResolvedValueOnce(res(503)).mockResolvedValue(res(201)); // server hiccup: keep and retry later
  expect(await flush()).toEqual({ sent: 0, failed: 0 });
  expect(await flush()).toEqual({ sent: 2, failed: 0 });
  expect(fetchMock).toHaveBeenCalledTimes(6);
});

test('a queue saved in an earlier session is sent after a restart', async () => {
  mockPrefs.set('tend.outbox', JSON.stringify([
    { id: 1, method: 'POST', url: 'https://x.supabase.co/rest/v1/messages', headers: {}, body: { body: 'Hola' }, tables: ['messages'] },
  ]));
  let fresh!: typeof import('@/lib/db');
  jest.isolateModules(() => { fresh = require('@/lib/db'); });
  expect(await fresh.flush()).toEqual({ sent: 1, failed: 0 });
  expect(fetchMock).toHaveBeenCalledWith('https://x.supabase.co/rest/v1/messages', expect.objectContaining({ body: '{"body":"Hola"}' }));
});
