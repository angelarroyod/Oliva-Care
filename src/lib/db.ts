import { env } from './env';
import { errorText } from './errors';
import { readPref, writePref } from './prefs';
import { supabase } from './supabase';

// Supabase can't filter DELETE events, so a filtered realtime subscription
// never hears about deletes (undo). Live lists also register here, and every
// successful write through mutate() refetches the named tables on this device.
// ponytail: other devices catch up on their next realtime change.
const listeners = new Map<string, Set<() => unknown>>();

export function onInvalidate(table: string, fn: () => unknown) {
  const set = listeners.get(table) ?? new Set<() => unknown>();
  listeners.set(table, set.add(fn));
  return () => set.delete(fn);
}

// Resolves once every refetch it started has settled.
export function invalidate(...tables: string[]) {
  const runs: unknown[] = [];
  for (const t of tables) listeners.get(t)?.forEach((fn) => runs.push(fn()));
  return Promise.allSettled(runs);
}

// Back online: realtime doesn't replay what changed meanwhile, so refetch every live list.
export function invalidateAll() {
  listeners.forEach((set) => set.forEach((fn) => fn()));
}

// Offline outbox. While offline, mutate() doesn't send the write: it keeps the
// request (method, url, headers, body) on the phone and flush() replays the
// queue in order when the connection returns. Auth is added at send time and
// never stored. Writes stay idempotent on replay: doses upsert on
// (schedule_id, scheduled_for), inserts carry a client id, and a duplicate
// (23505) counts as already sent.
// ponytail: reads PostgrestBuilder's method/url/headers/body fields (db.test
// builds a real client, so a supabase-js change that moves them fails there).
// Stored with SecureStore (prefs), which warns above 2 KB; move to
// expo-file-system if long queues show up.
type Request = { method: string; url: string; headers: Record<string, string>; body?: unknown };
type Entry = Request & { id: number; tables: string[] };
export type FlushResult = { sent: number; failed: number };

const KEY = 'tend.outbox';
let online = true;
let outbox: Entry[] = [];
let sent: Entry[] = []; // sent by flush(), still shown in live lists until they have refetched
let lastId = 0; // the entry the latest mutate() queued, 0 if it went straight to the server
let inFlight = 0;
let flushing: Promise<FlushResult> | null = null;
let snap = { online, pending: 0 };
const subs = new Set<() => void>();

const emit = () => {
  snap = { online, pending: outbox.length };
  subs.forEach((fn) => fn());
};
const persist = () => writePref(KEY, JSON.stringify(outbox));

let loading: Promise<void> | null = null;
const ready = () =>
  (loading ??= readPref(KEY).then((v) => {
    try {
      const stored = v ? (JSON.parse(v) as Entry[]) : [];
      if (!stored.length) return;
      outbox = [...stored, ...outbox];
      emit();
    } catch {
      // ponytail: unreadable queue starts empty rather than blocking every write.
    }
  }));

// For useSyncExternalStore: { online, pending } with a stable identity between changes.
// The first subscriber loads a queue saved in an earlier session, so it shows
// (banner, live lists) even when the app starts offline.
export const subscribeOutbox = (fn: () => void) => {
  subs.add(fn);
  void ready();
  return () => { subs.delete(fn); };
};
export const outboxSnapshot = () => snap;

// Queued writes to one table, oldest first, so live lists can show them before
// they're sent (useLiveList). `at`: when it was queued (an entry id is Date.now()
// plus a fraction). RPC urls (/rest/v1/rpc/…) never match a table.
export type PendingWrite = { method: string; query: URLSearchParams; body: unknown; at: string };
export const pendingWrites = (table: string): PendingWrite[] =>
  [...sent, ...outbox].flatMap((e) => {
    const url = new URL(e.url);
    if (!url.pathname.endsWith(`/rest/v1/${table}`)) return [];
    return [{ method: e.method, query: url.searchParams, body: e.body, at: new Date(Math.floor(e.id)).toISOString() }];
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

// Awaits a Supabase write and returns what to tell the person, in Spanish
// (errorText), or null on success. Show it inline, next to what failed.
// Pass the tables it touched so live lists refresh right away. Offline, the
// write is queued instead and this returns null (see saved() / unqueue()).
export async function mutate<T extends { error: { message: string; code?: string } | null }>(
  p: PromiseLike<T>,
  ...tables: string[]
): Promise<string | null> {
  lastId = 0;
  const req = online ? null : toRequest(p);
  if (req) {
    const id = Date.now() + Math.random();
    lastId = id;
    await ready();
    outbox.push({ ...req, id, tables });
    persist();
    emit();
    return null;
  }
  await flushing; // queued writes go first, so an undo never overtakes its record
  const { error } = await p;
  if (!error && tables.length) invalidate(...tables);
  return errorText(error);
}

export const SAVED_OFFLINE = 'Guardado en el teléfono. Se enviará al volver la conexión.';
// Success toast for the write mutate() just made: queued ones say where they are.
export const saved = (msg: string) => (lastId ? SAVED_OFFLINE : msg);
// The id of the write mutate() just queued (0 if it was sent), for unqueue().
export const lastQueued = () => lastId;

// Undo while still offline: takes a queued write back out. False once it was
// sent (or is being sent), and then the caller runs the compensating write.
export function unqueue(id: number) {
  if (!id || id === inFlight || !outbox.some((e) => e.id === id)) return false;
  outbox = outbox.filter((e) => e.id !== id);
  persist();
  emit();
  return true;
}

async function send(e: Entry): Promise<'sent' | 'failed' | 'retry'> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return 'retry'; // signed out or the refresh failed: keep it for later
  let res: Response;
  try {
    res = await fetch(e.url, {
      method: e.method,
      headers: { ...e.headers, 'Content-Type': 'application/json', apikey: env.supabaseAnonKey, Authorization: `Bearer ${token}` },
      body: e.body === undefined ? undefined : JSON.stringify(e.body),
    });
  } catch {
    return 'retry'; // network dropped again
  }
  if (res.ok) return 'sent';
  if (res.status === 401 || res.status >= 500) return 'retry';
  const err = (await res.json().catch(() => null)) as { code?: string } | null;
  return err?.code === '23505' ? 'sent' : 'failed'; // already there: a resend after a lost response
}

// Sends the queue in order. Stops (keeping the rest) on a network or auth
// problem; a write the server rejects is dropped and counted as failed.
export function flush() {
  return (flushing ??= (async () => {
    const r: FlushResult = { sent: 0, failed: 0 };
    const touched = new Set<string>();
    const done: Entry[] = [];
    try {
      await ready();
      while (online && outbox.length) {
        const e = outbox[0];
        inFlight = e.id;
        const res = await send(e);
        inFlight = 0;
        if (res === 'retry') break;
        r[res]++;
        e.tables.forEach((t) => touched.add(t));
        if (res === 'sent') {
          done.push(e);
          sent = [...sent, e];
        }
        outbox = outbox.filter((x) => x.id !== e.id);
        persist();
        emit();
      }
    } finally {
      inFlight = 0;
      flushing = null;
    }
    // The sent rows stay on screen until the refetch brings the real ones, so
    // an offline "Dada" never flips back to pending while the queue goes out.
    void invalidate(...touched).then(() => {
      if (!done.length) return;
      sent = sent.filter((x) => !done.includes(x));
      emit();
    });
    return r;
  })());
}
