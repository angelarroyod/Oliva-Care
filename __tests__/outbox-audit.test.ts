// Audit of the offline outbox (src/lib/db.ts): replays, ordering, 23505 and
// undo-while-sending. Each failing test is tagged with its finding id (OB-n) in
// docs/review/outbox-audit.md and asserts what ends up on the server, using a
// small in-memory PostgREST below (unique keys, upsert, eq filters, and requests
// that can be held, fail, or commit and then lose their response).
import { createClient } from '@supabase/supabase-js';
import { flush, lastQueued, mutate, outboxSnapshot, setOnline, unqueue } from '@/lib/db';

const mockPrefs = new Map<string, string>();
jest.mock('@/lib/prefs', () => ({
  readPref: async (k: string) => mockPrefs.get(k) ?? null,
  writePref: async (k: string, v: string) => { mockPrefs.set(k, v); },
}));
// The access token of whoever is signed in on the phone right now.
let mockToken: string | null = 'tok-carmen';
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: mockToken ? { access_token: mockToken } : null } }) } },
}));

// ---------------------------------------------------------------- fake server
type Row = Record<string, unknown>;
const UNIQUE: Record<string, string[][]> = {
  shift_handoffs: [['id']],
  messages: [['id']],
  care_events: [['id']],
  invites: [['id'], ['code']],
  vital_plans: [['patient_id', 'kind']],
  medication_doses: [['id'], ['schedule_id', 'scheduled_for']],
  vital_readings: [['id'], ['control_id', 'kind']],
};
const tables = new Map<string, Row[]>();
const rows = (t: string) => tables.get(t) ?? [];
const requests: { method: string; table: string; auth: string | null }[] = [];
let nextId = 0;

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const conflict = (t: string, row: Row, except?: Row) =>
  (UNIQUE[t] ?? []).some((cols) => rows(t).some((r) => r !== except && cols.every((c) => r[c] === row[c])));
const matches = (q: URLSearchParams) => (r: Row) =>
  [...q.entries()].every(([k, v]) => !v.startsWith('eq.') || String(r[k]) === v.slice(3));

// Applies one PostgREST request to the tables, as the server would.
function apply(url: URL, method: string, headers: Headers, body: unknown): Response {
  const t = url.pathname.split('/').pop()!;
  const list = rows(t);
  if (method === 'POST') {
    const input = (Array.isArray(body) ? body : [body]) as Row[];
    const onConflict = url.searchParams.get('on_conflict')?.split(',');
    const upsert = (headers.get('prefer') ?? '').includes('resolution=merge-duplicates') && onConflict;
    const next = list.map((r) => ({ ...r }));
    for (const row of input) {
      const existing = upsert ? next.find((r) => onConflict!.every((c) => r[c] === row[c])) : undefined;
      if (existing) Object.assign(existing, row);
      else {
        const fresh = { id: `srv-${nextId++}`, ...row };
        tables.set(t, next);
        if (conflict(t, fresh)) {
          tables.set(t, list); // the whole statement rolls back
          return json(409, { code: '23505', message: `duplicate key value violates unique constraint on "${t}"` });
        }
        next.push(fresh);
      }
    }
    tables.set(t, next);
    return json(201);
  }
  if (method === 'PATCH') {
    list.filter(matches(url.searchParams)).forEach((r) => Object.assign(r, body as Row));
    return json(204);
  }
  if (method === 'DELETE') {
    tables.set(t, list.filter((r) => !matches(url.searchParams)(r)));
    return json(204);
  }
  return json(405);
}

// What happens to the next request: by default it's applied and answered.
type Commit = () => Response;
type Plan = (commit: Commit) => Promise<Response>;
const plans: Plan[] = [];
const planNext = (p: Plan) => plans.push(p);
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
};
// Holds the next request until release(); `arrived` resolves once it is in flight.
function holdNext(then: 'ok' | 'drop' | 'lost-response') {
  const arrived = deferred();
  const gate = deferred();
  planNext(async (commit) => {
    arrived.resolve();
    await gate.promise;
    if (then === 'drop') throw new TypeError('Network request failed');
    const res = commit();
    if (then === 'lost-response') throw new TypeError('Network request failed'); // it reached the server
    return res;
  });
  return { arrived: arrived.promise, release: gate.resolve };
}

const serverFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = new URL(String(input));
  const headers = new Headers(init.headers);
  const method = init.method ?? 'GET';
  requests.push({ method, table: url.pathname.split('/').pop()!, auth: headers.get('authorization') });
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
  const commit = () => apply(url, method, headers, body);
  const plan = plans.shift();
  return plan ? plan(commit) : commit();
};
globalThis.fetch = serverFetch as unknown as typeof fetch;

// Real supabase-js builders: online they go through the same fake server.
const client = createClient('https://x.supabase.co', 'anon', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: serverFetch as unknown as typeof fetch },
});

beforeEach(async () => {
  plans.length = 0;
  mockToken = 'tok-carmen';
  setOnline(true);
  await flush(); // drain whatever a test left behind
  tables.clear();
  requests.length = 0;
});

// ------------------------------------------------------------------ controls
// What already works, so the failures below are not about the fake server.

test('control: a queued insert whose response was lost is resent once, counted as sent, stored once', async () => {
  setOnline(false);
  await mutate(client.from('messages').insert({ id: 'm1', patient_id: 'p1', body: 'Hola' }), 'messages');
  setOnline(true);
  planNext(async (commit) => { commit(); throw new TypeError('Network request failed'); });
  expect(await flush()).toEqual({ sent: 0, failed: 0 }); // kept for later
  expect(await flush()).toEqual({ sent: 1, failed: 0 }); // the resend hits 23505: already there
  expect(rows('messages').map((r) => r.id)).toEqual(['m1']);
});

test('control: queued writes reach the server in the order they were made, across a dropped connection', async () => {
  setOnline(false);
  for (const id of ['a', 'b', 'c']) await mutate(client.from('care_events').insert({ id, patient_id: 'p1' }), 'care_events');
  setOnline(true);
  planNext(async (commit) => commit());
  planNext(async () => { throw new TypeError('Network request failed'); });
  await flush();
  await flush();
  expect(rows('care_events').map((r) => r.id)).toEqual(['a', 'b', 'c']);
});

test('control: undo while the record is still queued (not being sent) means it never reaches the server', async () => {
  setOnline(false);
  await mutate(client.from('shift_handoffs').insert({ id: 'h0', patient_id: 'p1', nurse_id: 'c' }), 'shift_handoffs');
  expect(unqueue(lastQueued())).toBe(true);
  setOnline(true);
  await flush();
  expect(rows('shift_handoffs')).toEqual([]);
});

// ------------------------------------------------------------------ findings

test('[OB-1 ordering] an online edit made after a flush stopped on a server error is not overwritten by the older queued edit', async () => {
  const plan = (ranges: number[][]) =>
    client.from('vital_plans').upsert({ patient_id: 'p1', kind: 'hr', ranges }, { onConflict: 'patient_id,kind' });
  setOnline(false);
  await mutate(plan([[60, 100]]), 'vital_plans'); // older edit, saved on the phone
  setOnline(true);
  planNext(async () => json(503)); // server hiccup on reconnect: flush keeps the queue and stops
  expect(await flush()).toEqual({ sent: 0, failed: 0 });
  expect(await mutate(plan([[50, 90]]), 'vital_plans')).toBeNull(); // newer edit, made online
  await flush(); // the next reconnect sends what was left
  expect(rows('vital_plans').map((r) => r.ranges)).toEqual([[[50, 90]]]); // the latest edit wins
});

test('[OB-2 23505] a queued invite whose code already belongs to another invite is not counted as sent', async () => {
  tables.set('invites', [{ id: 'i0', patient_id: 'other-patient', code: 'ABC234', role: 'family' }]);
  setOnline(false);
  await mutate(client.from('invites').insert({ patient_id: 'p1', code: 'ABC234', role: 'family', invited_by: 'c' }), 'invites');
  setOnline(true);
  const result = await flush();
  expect(rows('invites').filter((r) => r.patient_id === 'p1')).toEqual([]); // the server has no invite for p1…
  expect(result).toEqual({ sent: 0, failed: 1 }); // …so it must not be reported as sent
});

test('[OB-3 undo race] undo tapped while the record is being sent, whose response is then lost, still removes it', async () => {
  // relevo.tsx: insert with a client id; undo = unqueue, else delete by id.
  setOnline(false);
  await mutate(client.from('shift_handoffs').insert({ id: 'h1', patient_id: 'p1', nurse_id: 'c' }), 'shift_handoffs');
  const queued = lastQueued();
  setOnline(true);
  const sending = holdNext('lost-response');
  const flushing = flush();
  await sending.arrived; // the record is in flight
  const undo = (async () => {
    if (unqueue(queued)) return null;
    return mutate(client.from('shift_handoffs').delete().eq('id', 'h1'), 'shift_handoffs');
  })();
  sending.release(); // it reached the server, but the phone never heard back
  await flushing;
  expect(await undo).toBeNull(); // "Deshacer" reports success…
  await flush(); // …and the next flush sends the record again
  expect(rows('shift_handoffs').map((r) => r.id)).toEqual([]);
});

test('[OB-4 undo race] the undo of a write that went to the server does not take a different queued write out of the outbox', async () => {
  // medicacion.tsx record(): `await mutate(upsert)`, then `lastQueued()` and `saved()` for the toast and its undo.
  const slow = holdNext('ok');
  const dada = mutate(
    client.from('medication_doses').upsert(
      { schedule_id: 'met', patient_id: 'p1', scheduled_for: '2026-10-15T14:00:00+00:00', status: 'given', recorded_by: 'c' },
      { onConflict: 'schedule_id,scheduled_for' },
    ),
    'medication_doses',
  );
  await slow.arrived; // weak signal: "Dada" hangs
  setOnline(false); // the connection drops; on Signos the nurse saves a control, which is queued
  await mutate(client.from('vital_readings').insert([{ id: 'r1', patient_id: 'p1', control_id: 'k1', kind: 'hr', value: 72 }]), 'vital_readings');
  slow.release(); // "Dada" did reach the server
  expect(await dada).toBeNull();
  const queued = lastQueued(); // what the "Dada" toast's undo will try to unqueue
  expect(unqueue(queued)).toBe(false); // nothing of "Dada" is queued: undo has to reset the dose on the server
  expect(outboxSnapshot().pending).toBe(1); // the control is still waiting to be sent
});

test('[OB-5 replay identity] writes queued by one account are not sent with the next account\'s session', async () => {
  setOnline(false);
  await mutate(client.from('messages').insert({ id: 'm-carmen', patient_id: 'p1', sender_id: 'carmen', body: 'Durmió bien' }), 'messages');
  mockToken = null; // Carmen's session ends (signed out / refresh failed)
  setOnline(true);
  expect(await flush()).toEqual({ sent: 0, failed: 0 }); // kept "for later"
  mockToken = 'tok-rosa'; // Rosa signs in on the same phone
  await flush();
  expect(requests.filter((r) => r.table === 'messages' && r.auth === 'Bearer tok-rosa')).toEqual([]);
});
