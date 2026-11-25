import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { onInvalidate, outboxSnapshot, pendingWrites, subscribeOutbox, type PendingWrite } from '@/lib/db';

// Before the first fetch a live list is this exact (empty) array, so screens can
// tell "not loaded yet" from "nothing happened" with isLoaded(list).
const NOT_LOADED = Object.freeze([]) as unknown as never[];
export const isLoaded = (rows: readonly unknown[]) => rows !== NOT_LOADED;

export type LiveListOptions = {
  select?: string; // PostgREST select, e.g. '*, profiles(full_name)'
  since?: { col: string; value: string }; // only rows with col >= value
};

type Raw = Record<string, unknown>;
type ListQuery = { patientId: string; order: { col: string; asc: boolean }; since?: { col: string; value: string } };

// Timestamps come back as "…+00:00" but are written as "….000Z": compare instants.
const ISO = /^\d{4}-\d\d-\d\dT/;
const val = (v: unknown) => (typeof v === 'string' && ISO.test(v) ? Date.parse(v) : v);
const same = (a: unknown, b: unknown) => String(val(a)) === String(val(b));

// The eq/in filters of a queued update or delete (what our writes use).
const matches = (r: Raw, q: URLSearchParams) =>
  Array.from(q).every(([col, f]) => {
    if (col === 'select' || col === 'columns' || col === 'on_conflict') return true;
    const [, op = '', v = ''] = /^(\w+)\.(.*)$/.exec(f) ?? [];
    if (op === 'eq') return same(r[col], v);
    if (op === 'in') return v.slice(1, -1).split(',').some((x) => same(r[col], x.replace(/^"|"$/g, '')));
    return false; // ponytail: any other operator leaves the row as the server has it
  });

// Fetched rows with the writes still waiting in the offline outbox applied, so
// what was saved offline shows right away. An insert appends (or, as an upsert
// or with a client id, replaces the row with the same key: no duplicate once
// the refetch already has it); updates and deletes apply to the rows they
// filter. Rows changed or added by a queued write carry pending: true.
export function mergePending(rows: Raw[], writes: PendingWrite[], { patientId, order, since }: ListQuery): Raw[] {
  let out = rows;
  for (const w of writes) {
    if (w.method === 'POST') {
      const keys = w.query.get('on_conflict')?.split(',') ?? ['id'];
      for (const b of ([] as Raw[]).concat(w.body as Raw)) {
        const i = out.findIndex((r) => keys.every((k) => b[k] !== undefined && same(r[k], b[k])));
        out = i < 0
          ? [...out, { [order.col]: w.at, ...b, pending: true }] // a server default (created_at…) = when it was queued
          : out.map((r, j) => (j === i ? { ...r, ...b, pending: true } : r));
      }
    } else if (w.method === 'PATCH') {
      out = out.map((r) => (matches(r, w.query) ? { ...r, ...(w.body as Raw), pending: true } : r));
    } else if (w.method === 'DELETE') {
      out = out.filter((r) => !matches(r, w.query));
    }
  }
  if (out === rows) return rows;
  const after = (v: unknown, min: string) => (val(v) as number) >= Date.parse(min);
  const dir = order.asc ? 1 : -1;
  return out
    .filter((r) => !r.pending || (r.patient_id === patientId && (!since || after(r[since.col], since.value))))
    .sort((a, b) => {
      const x = val(a[order.col]) as string, y = val(b[order.col]) as string;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
}

export function useLiveList<Row, T>(
  table: string,
  patientId: string | undefined,
  order: { col: string; asc: boolean },
  map: (r: Row) => T,
  opts: LiveListOptions = {},
): T[] {
  const [rows, setRows] = useState<Raw[]>(NOT_LOADED);
  const outbox = useSyncExternalStore(subscribeOutbox, outboxSnapshot);
  // supabase-js reuses a channel with the same topic, so two screens watching
  // the same table would share (and tear down) one channel. Keep topics unique.
  const instance = useId();
  const select = opts.select ?? '*';
  const sinceCol = opts.since?.col;
  const sinceVal = opts.since?.value;

  useEffect(() => {
    setRows(NOT_LOADED);
    if (!patientId) return;
    let active = true;
    const fetchRows = () => {
      let q = supabase.from(table).select(select).eq('patient_id', patientId);
      if (sinceCol && sinceVal) q = q.gte(sinceCol, sinceVal);
      // Resolves to false when the fetch failed (invalidate() then keeps sent
      // writes overlaid).
      return q.order(order.col, { ascending: order.asc }).then(({ data, error }) => {
        // Offline the fetch fails: keep showing the last rows instead of "nothing".
        // A runtime select string defeats supabase's row typing.
        if (active && !error) setRows((data ?? []) as unknown as Raw[]);
        return !error;
      });
    };

    fetchRows();
    const off = onInvalidate(table, fetchRows); // refetch after local writes / deletes
    // ponytail: refetch on any change, not incremental merge — fine at this scale.
    const channel = supabase
      .channel(`${table}:${patientId}:${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `patient_id=eq.${patientId}` }, fetchRows)
      .subscribe();

    return () => {
      active = false;
      off();
      supabase.removeChannel(channel);
    };
  }, [table, patientId, order.col, order.asc, select, sinceCol, sinceVal, instance]);

  // Re-derived when the outbox changes (a write queued or sent). Like the fetch,
  // `map` is read when the data changes, not tracked.
  // ponytail: a queued row lacks embedded relations (select '*, x(…)'); no live list embeds today.
  return useMemo(() => {
    if (!isLoaded(rows) || !patientId) return NOT_LOADED;
    const writes = pendingWrites(table);
    const since = sinceCol && sinceVal ? { col: sinceCol, value: sinceVal } : undefined;
    const merged = writes.length ? mergePending(rows, writes, { patientId, order: { col: order.col, asc: order.asc }, since }) : rows;
    return merged.map((r) => map(r as Row));
  }, [rows, outbox, table, patientId, order.col, order.asc, sinceCol, sinceVal]);
}
