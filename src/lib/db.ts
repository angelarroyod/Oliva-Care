import { env } from './env';
import { errorText } from './errors';
import { readPref, writePref } from './prefs';
import { supabase } from './supabase';

// Supabase can't filter DELETE events, so a filtered realtime subscription
// never hears about deletes (undo). Live lists also register here, and every
// successful write through mutate() refetches the named tables on this device.
// A listener resolves to false when its refetch failed.
// ponytail: other devices catch up on their next realtime change.
const listeners = new Map<string, Set<() => unknown>>();

export function onInvalidate(table: string, fn: () => unknown) {
  const set = listeners.get(table) ?? new Set<() => unknown>();
  listeners.set(table, set.add(fn));
  return () => set.delete(fn);
}

// Resolves once every refetch it started has settled. Writes flush() sent stay
// overlaid on live lists (pendingWrites) until a refetch of every table they
// touched has succeeded, so a refetch that fails (the connection dropped again)
// never makes an offline "Dada" flip back to pending.
export async function invalidate(...tables: string[]) {
  const before = sent;
  const ok = await Promise.all(
    [...new Set(tables)].map(async (t) => {
      const runs = await Promise.allSettled([...(listeners.get(t) ?? [])].map((fn) => fn()));
      return runs.every((r) => r.status === 'fulfilled' && r.value !== false) ? t : null;
    }),
  );
  const fresh = new Set(ok);
  const keep = sent.filter((e) => !before.includes(e) || !e.tables.every((t) => fresh.has(t)));
  if (keep.length !== sent.length) {
    sent = keep;
    emit();
  }
}

// Back online: realtime doesn't replay what changed meanwhile, so refetch every live list.
export function invalidateAll() {
  void invalidate(...listeners.keys(), ...sent.flatMap((e) => e.tables));
}

// Offline outbox. While offline, mutate() doesn't send the write: it keeps the
// request (method, url, headers, body) on the phone and flush() replays the
// queue in order when the connection returns. Auth is added at send time and
// never stored. Writes stay idempotent on replay: doses upsert on
// (schedule_id, scheduled_for), inserts carry a client id, and a duplicate
// (23505) counts as already sent when an earlier attempt may have landed.
// Each entry belongs to the account that queued it and is only ever sent with
// that account's session; another account on the same phone neither sees nor
// sends it.
// ponytail: reads PostgrestBuilder's method/url/headers/body fields (db.test
// builds a real client, so a supabase-js change that moves them fails there).
// Stored with SecureStore (prefs), which warns above 2 KB; move to
// expo-file-system if long queues show up.
type Request = { method: string; url: string; headers: Record<string, string>; body?: unknown };
type Entry = Request & {
  id: number; // unique on this phone (a counter seeded from the clock), for unqueue()
  at?: number; // when it was queued (ms); older entries only have a Date.now() + fraction id
  tables: string[];
  owner?: string | null; // user id that queued it; missing on entries from before owners
  maybeSent?: boolean; // an attempt may have reached the server (lost response, 5xx)
};
export type FlushResult = { sent: number; failed: number };

const KEY = 'tend.outbox';
const SEND_TIMEOUT = 20_000; // Android's fetch never times out on its own
let online = true;
let user: string | null = null; // who is signed in on this phone (last known)
let outbox: Entry[] = [];
let sent: Entry[] = []; // sent by flush(), still shown in live lists until they have refetched
let lastId = 0; // the entry the latest mutate() to finish queued, 0 if it went to the server
let seq = 0;
let inFlight = 0;
let flushing: Promise<FlushResult> | null = null;
let snap = { online, pending: 0 };
const subs = new Set<() => void>();

// Entries from before owners existed go out with whoever flushes first.
const mine = (e: Entry) => !e.owner || e.owner === user;

function emit() {
  snap = { online, pending: outbox.filter(mine).length };
  subs.forEach((fn) => fn());
}
const persist = () => writePref(KEY, JSON.stringify(outbox));

let loading: Promise<void> | null = null;
const ready = () =>
  (loading ??= readPref(KEY).then((v) => {
    try {
      const stored = v ? (JSON.parse(v) as Entry[]) : [];
      if (!stored.length) return;
      outbox = [...stored, ...outbox];
      seq = Math.max(seq, ...stored.map((e) => Math.ceil(e.id)));
      emit();
    } catch {
      // ponytail: unreadable queue starts empty rather than blocking every write.
    }
  }));

// For useSyncExternalStore: { online, pending } with a stable identity between changes.
// `pending` counts only the signed-in account's writes. The first subscriber
// loads a queue saved in an earlier session, so it shows (banner, live lists)
// even when the app starts offline.
export const subscribeOutbox = (fn: () => void) => {
  subs.add(fn);
  void ready();
  return () => { subs.delete(fn); };
};
export const outboxSnapshot = () => snap;

// AuthProvider reports every session change here (null on sign-out). The
// outbox also learns the user from each session it reads, and keeps the last
// one when the session can't be read (an expired token while offline).
export function setOutboxUser(id: string | null) {
  if (id === user) return;
  user = id;
  emit();
}
async function session() {
  try {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (s?.user?.id) setOutboxUser(s.user.id);
    return s;
  } catch {
    return null; // unreadable: a queued write keeps the last known owner
  }
}

// Account deletion: the signed-in account's queued writes go too, health data
// included. Other accounts' entries stay for when they sign in again.
export async function dropQueued() {
  await ready();
  outbox = outbox.filter((e) => !mine(e));
  persist();
  emit();
}

// Queued writes to one table, oldest first, so live lists can show them before
// they're sent (useLiveList). `at`: when it was queued. RPC urls
// (/rest/v1/rpc/…) never match a table.
export type PendingWrite = { method: string; query: URLSearchParams; body: unknown; at: string };
export const pendingWrites = (table: string): PendingWrite[] =>
  [...sent, ...outbox].filter(mine).flatMap((e) => {
    const url = new URL(e.url);
    if (!url.pathname.endsWith(`/rest/v1/${table}`)) return [];
    return [{ method: e.method, query: url.searchParams, body: e.body, at: new Date(e.at ?? Math.floor(e.id)).toISOString() }];
  });

// Returns true when this flipped the state.
export function setOnline(on: boolean) {
  if (on === online) return false;
  online = on;
  emit();
  return true;
}

// Only a PostgREST builder that hasn't run yet can be stored; anything else
// (a plain promise, a .then chain) already started and just runs.
function toRequest(p: unknown): Request | null {
  const b = p as { method?: unknown; url?: unknown; headers?: unknown; body?: unknown };
  if (typeof b.method !== 'string' || !(b.url instanceof URL) || !(b.headers instanceof Headers)) return null;
  const headers: Record<string, string> = {};
  b.headers.forEach((v, k) => { headers[k] = v; });
  return { method: b.method, url: b.url.href, headers, body: b.body };
}

function enqueue(req: Request, tables: string[], maybeSent = false) {
  const at = Date.now();
  const id = (seq = Math.max(at, seq + 1));
  outbox.push({ ...req, id, at, tables, owner: user, ...(maybeSent ? { maybeSent } : {}) });
  persist();
  emit();
  return id;
}

// Awaits a Supabase write and returns what to tell the person, in Spanish
// (errorText), or null on success. Show it inline, next to what failed.
// Pass the tables it touched so live lists refresh right away. The write is
// queued instead, and this returns null (see saved() / unqueue()), when:
// - the phone is offline;
// - earlier writes are still queued or being sent, so it never overtakes them
//   (an undo never lands before its record, a stale edit never lands last);
// - it was sent but the answer never came back: it may be on the server, and
//   the outbox's idempotent resend settles it without a duplicate.
export async function mutate<T extends { error: { message: string; code?: string } | null }>(
  p: PromiseLike<T>,
  ...tables: string[]
): Promise<string | null> {
  let queued = 0;
  const done = (err: string | null) => {
    lastId = queued; // set as it returns, so the caller reads its own write's id
    return err;
  };
  const req = toRequest(p);
  if (req) {
    await ready();
    await session(); // who owns it if it's queued
    if (online && !flushing && outbox.some(mine)) await flush();
    if (!online || flushing || outbox.some(mine)) {
      queued = enqueue(req, tables);
      return done(null);
    }
  } else {
    await flushing; // queued writes go first
  }
  const res = await p;
  const { error } = res;
  if (req && error && (res as { status?: number }).status === 0) {
    queued = enqueue(req, tables, true); // fetch threw: the write may have reached the server
    return done(null);
  }
  if (!error && tables.length) void invalidate(...tables);
  return done(errorText(error));
}

export const SAVED_OFFLINE = 'Guardado en el teléfono. Se enviará al volver la conexión.';
// Success toast for the write mutate() just made: queued ones say where they are.
export const saved = (msg: string) => (lastId ? SAVED_OFFLINE : msg);
// The id of the write the last mutate() to finish queued (0 if it was sent),
// for unqueue(). Read it right after awaiting mutate().
export const lastQueued = () => lastId;

// Undo before the record went out: takes a queued write back out. False once it
// was sent, is being sent, or an earlier attempt may have reached the server;
// the caller then runs the compensating write, which mutate() queues behind it.
export function unqueue(id: number) {
  const e = id ? outbox.find((x) => x.id === id) : undefined;
  if (!e || id === inFlight || e.maybeSent) return false;
  outbox = outbox.filter((x) => x !== e);
  persist();
  emit();
  return true;
}

const authed = (e: Entry, token: string) => ({
  ...e.headers, 'Content-Type': 'application/json', apikey: env.supabaseAnonKey, Authorization: `Bearer ${token}`,
});

// A dose recorded offline must not overwrite one another nurse recorded
// meanwhile (online, medicacion's takenBy() refuses it). Returns 'retry' if the
// check couldn't be made, true when someone else's record is already there.
// ponytail: check-then-write leaves a gap of one round trip; a conditional
// record_dose RPC (update … where status in ('pending', 'unrecorded')) closes it.
async function doseTaken(e: Entry, token: string): Promise<boolean | 'retry'> {
  const url = new URL(e.url);
  const b = e.body as Record<string, unknown> | undefined;
  const isDose = e.method === 'POST' && url.pathname.endsWith('/rest/v1/medication_doses') &&
    url.searchParams.get('on_conflict') === 'schedule_id,scheduled_for' && !!b && !Array.isArray(b);
  if (!isDose || b.status === 'pending') return false;
  const q = new URL(`${url.origin}${url.pathname}`);
  q.searchParams.set('select', 'status,recorded_by');
  q.searchParams.set('schedule_id', `eq.${b.schedule_id}`);
  q.searchParams.set('scheduled_for', `eq.${b.scheduled_for}`);
  try {
    const res = await fetch(q.href, { headers: authed(e, token) });
    if (!res.ok) return 'retry';
    const rows = (await res.json()) as { status: string; recorded_by: string | null }[] | null;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    return !!row && row.status !== 'pending' && row.status !== 'unrecorded' && row.recorded_by !== b.recorded_by;
  } catch {
    return 'retry';
  }
}

function maybeSent(e: Entry) {
  if (e.maybeSent) return;
  e.maybeSent = true;
  persist();
}

async function send(e: Entry, token: string): Promise<'sent' | 'failed' | 'retry'> {
  const taken = await doseTaken(e, token);
  if (taken === 'retry') return 'retry';
  if (taken) return 'failed';
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), SEND_TIMEOUT);
  let res: Response;
  try {
    res = await fetch(e.url, {
      method: e.method,
      headers: authed(e, token),
      body: e.body === undefined ? undefined : JSON.stringify(e.body),
      signal: abort.signal,
    });
  } catch {
    maybeSent(e); // dropped or timed out, maybe after the server committed it
    return 'retry';
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return 'sent';
  if (res.status >= 500) {
    maybeSent(e); // a 502/504 can come back after the commit
    return 'retry';
  }
  if (res.status === 401) return 'retry';
  const err = (await res.json().catch(() => null)) as { code?: string } | null;
  // A duplicate is our own earlier attempt only if one may have landed;
  // otherwise it collides with someone else's row (an invite code) and failed.
  return err?.code === '23505' && e.maybeSent ? 'sent' : 'failed';
}

// Sends the signed-in account's queue in order. Stops (keeping the rest) on a
// network or auth problem; a write the server rejects is dropped and counted as
// failed. Writes queued while it runs go out in the same pass.
export function flush() {
  return (flushing ??= (async () => {
    const r: FlushResult = { sent: 0, failed: 0 };
    const touched = new Set<string>();
    try {
      await ready();
      while (online) {
        const s = await session();
        const e = outbox.find(mine);
        if (!s || !e) break; // signed out or the refresh failed: keep it for later
        inFlight = e.id;
        const res = await send(e, s.access_token);
        inFlight = 0;
        if (res === 'retry') break;
        r[res]++;
        e.tables.forEach((t) => touched.add(t));
        if (res === 'sent') sent = [...sent, e];
        outbox = outbox.filter((x) => x !== e);
        persist();
        emit();
      }
    } finally {
      inFlight = 0;
      flushing = null;
    }
    if (touched.size) void invalidate(...touched);
    return r;
  })());
}
