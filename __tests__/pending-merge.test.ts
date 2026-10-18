import { createClient } from '@supabase/supabase-js';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { flush, mutate, pendingWrites, setOnline } from '@/lib/db';
import { mergePending, useLiveList } from '@/features/care/useLiveList';

const mockPrefs = new Map<string, string>();
jest.mock('@/lib/prefs', () => ({
  readPref: async (k: string) => mockPrefs.get(k) ?? null,
  writePref: async (k: string, v: string) => { mockPrefs.set(k, v); },
}));
let mockRows: Record<string, unknown>[] = [];
const mockOrder = jest.fn(() => Promise.resolve({ data: mockRows, error: null }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ order: mockOrder, gte: () => ({ order: mockOrder }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: jest.fn(),
  },
}));

// Real supabase-js builders: the merge reads the url/body they would send.
const client = createClient('https://x.supabase.co', 'anon', { auth: { persistSession: false, autoRefreshToken: false } });
const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

beforeEach(async () => {
  setOnline(true);
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 201, json: async () => null });
  await flush(); // empty the outbox between tests
  mockRows = [];
  setOnline(false);
});

const dose = (sid: string, at: string, over: Record<string, unknown> = {}) => ({
  id: `d-${sid}`, schedule_id: sid, patient_id: 'p1', scheduled_for: at, status: 'pending', recorded_by: null, ...over,
});
const doses = { patientId: 'p1', order: { col: 'scheduled_for', asc: true } };

test('a "Dada" saved offline replaces the dose on its conflict key, whatever the timestamp format', async () => {
  const fetched = [dose('met', '2026-10-18T08:00:00+00:00'), dose('los', '2026-10-18T21:30:00+00:00')];
  for (const [sid, at] of [['met', '2026-10-18T08:00:00.000Z'], ['ome', '2026-10-18T20:00:00.000Z']]) {
    await mutate(
      client.from('medication_doses').upsert(
        { schedule_id: sid, patient_id: 'p1', scheduled_for: at, status: 'given', recorded_by: 'n1' },
        { onConflict: 'schedule_id,scheduled_for' },
      ),
      'medication_doses',
    );
  }
  const out = mergePending(fetched, pendingWrites('medication_doses'), doses);
  expect(out).toEqual([
    { ...fetched[0], scheduled_for: '2026-10-18T08:00:00.000Z', status: 'given', recorded_by: 'n1', pending: true },
    { schedule_id: 'ome', patient_id: 'p1', scheduled_for: '2026-10-18T20:00:00.000Z', status: 'given', recorded_by: 'n1', pending: true },
    fetched[1], // untouched: no marker
  ]);
});

test("a control saved offline joins its patient's list in taken_at order; other patients and older rows stay out", async () => {
  const fetched = [
    { id: 'r1', patient_id: 'p1', control_id: 'c0', kind: 'hr', taken_at: '2026-10-18T09:00:00+00:00' },
    { id: 'r2', patient_id: 'p1', control_id: 'c9', kind: 'hr', taken_at: '2026-10-18T11:00:00+00:00' },
  ];
  const reading = (id: string, patient: string, control: string, kind: string, at: string) =>
    ({ id, patient_id: patient, control_id: control, kind, value: 1, taken_at: at });
  await mutate(client.from('vital_readings').insert([
    reading('q1', 'p1', 'c1', 'hr', '2026-10-18T10:00:00.000Z'),
    reading('q2', 'p1', 'c1', 'temp', '2026-10-18T10:00:00.000Z'),
  ]), 'vital_readings');
  await mutate(client.from('vital_readings').insert([reading('q3', 'p2', 'c2', 'hr', '2026-10-18T10:00:00.000Z')]), 'vital_readings');
  await mutate(client.from('vital_readings').insert([reading('q4', 'p1', 'c3', 'hr', '2026-10-16T10:00:00.000Z')]), 'vital_readings');
  // Another table's write and an RPC never leak in.
  await mutate(client.from('care_events').insert({ patient_id: 'p1', type: 'note' }), 'care_events');
  await mutate(client.rpc('vital_readings'), 'vital_readings');

  const out = mergePending(fetched, pendingWrites('vital_readings'), {
    patientId: 'p1', order: { col: 'taken_at', asc: true }, since: { col: 'taken_at', value: '2026-10-17T22:00:00.000Z' },
  });
  expect(out.map((r) => [r.id, !!r.pending])).toEqual([['r1', false], ['q1', true], ['q2', true], ['r2', false]]);
});

test('a queued insert the refetch already has shows once; a server default is when it was queued', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-18T09:30:00Z'));
  await mutate(client.from('messages').insert({ id: 'm1', patient_id: 'p1', sender_id: 'f1', body: 'Uno' }), 'messages');
  await mutate(client.from('messages').insert({ id: 'm2', patient_id: 'p1', sender_id: 'f1', body: 'Dos' }), 'messages');
  now.mockRestore();
  const sent = { id: 'm1', patient_id: 'p1', sender_id: 'f1', body: 'Uno', created_at: '2026-10-18T09:29:30+00:00' };
  const out = mergePending([sent], pendingWrites('messages'), { patientId: 'p1', order: { col: 'created_at', asc: true } });
  expect(out).toEqual([
    { ...sent, pending: true },
    { id: 'm2', patient_id: 'p1', sender_id: 'f1', body: 'Dos', created_at: '2026-10-18T09:30:00.000Z', pending: true },
  ]);
});

test('an undo queued after the record went out: updates and deletes apply to the rows they filter', async () => {
  const fetched = [dose('met', '2026-10-18T08:00:00+00:00', { status: 'given', recorded_by: 'n1' }), dose('los', '2026-10-18T21:30:00+00:00')];
  await mutate(
    client.from('medication_doses').update({ status: 'pending', recorded_by: null })
      .eq('schedule_id', 'met').eq('scheduled_for', '2026-10-18T08:00:00.000Z').eq('recorded_by', 'n1'),
    'medication_doses',
  );
  expect(mergePending(fetched, pendingWrites('medication_doses'), doses)).toEqual([
    { ...fetched[0], status: 'pending', recorded_by: null, pending: true },
    fetched[1],
  ]);

  const readings = ['hr', 'temp', 'bp'].map((kind) => ({ id: kind, patient_id: 'p1', control_id: 'c1', kind, taken_at: '2026-10-18T10:00:00Z' }));
  await mutate(client.from('vital_readings').delete().eq('control_id', 'c1').in('kind', ['hr', 'temp']), 'vital_readings');
  const out = mergePending(readings, pendingWrites('vital_readings'), { patientId: 'p1', order: { col: 'taken_at', asc: true } });
  expect(out.map((r) => r.id)).toEqual(['bp']);
});

test('nothing queued for the table: the fetched array comes back as is', () => {
  const fetched = [dose('met', '2026-10-18T08:00:00+00:00')];
  expect(mergePending(fetched, pendingWrites('medication_doses'), doses)).toBe(fetched);
});

test('live list: a message sent offline shows at once, marked, and turns into the real row after flush', async () => {
  mockRows = [{ id: 'm0', patient_id: 'p1', sender_id: 'n1', body: 'Hola', created_at: '2026-10-18T07:00:00+00:00' }];
  const { result } = renderHook(() =>
    useLiveList('messages', 'p1', { col: 'created_at', asc: true }, (r: { body: string; pending?: boolean }) =>
      `${r.body}${r.pending ? ' (sin enviar)' : ''}`),
  );
  await waitFor(() => expect(result.current).toEqual(['Hola']));

  await act(() => mutate(client.from('messages').insert({ id: 'm1', patient_id: 'p1', sender_id: 'f1', body: '¿Cenó?' }), 'messages'));
  expect(result.current).toEqual(['Hola', '¿Cenó? (sin enviar)']);

  mockRows = [...mockRows, { id: 'm1', patient_id: 'p1', sender_id: 'f1', body: '¿Cenó?', created_at: '2026-10-18T09:00:00+00:00' }];
  let release!: () => void;
  mockOrder.mockImplementationOnce(() => new Promise<{ data: typeof mockRows; error: null }>((ok) => {
    release = () => ok({ data: mockRows, error: null });
  }));
  await act(async () => {
    setOnline(true);
    await flush();
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  // Sent, refetch still on its way: the message stays put (no flicker, no duplicate).
  expect(result.current).toEqual(['Hola', '¿Cenó? (sin enviar)']);
  await act(async () => release());
  expect(result.current).toEqual(['Hola', '¿Cenó?']);
});

test('a queue saved in an earlier session shows as soon as something subscribes, even offline', async () => {
  mockPrefs.set('tend.outbox', JSON.stringify([
    { id: 1, method: 'POST', url: 'https://x.supabase.co/rest/v1/messages', headers: {}, body: { id: 'm9', body: 'Hola' }, tables: ['messages'] },
  ]));
  let fresh!: typeof import('@/lib/db');
  jest.isolateModules(() => { fresh = require('@/lib/db'); });
  fresh.setOnline(false);
  const fn = jest.fn();
  fresh.subscribeOutbox(fn);
  await waitFor(() => expect(fn).toHaveBeenCalled());
  expect(fresh.outboxSnapshot().pending).toBe(1);
  expect(fresh.pendingWrites('messages')).toMatchObject([{ method: 'POST', body: { id: 'm9', body: 'Hola' } }]);
});
