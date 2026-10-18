import { useEffect, useId, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { onInvalidate } from '@/lib/db';

// Before the first fetch a live list is this exact (empty) array, so screens can
// tell "not loaded yet" from "nothing happened" with isLoaded(list).
const NOT_LOADED = Object.freeze([]) as unknown as never[];
export const isLoaded = (rows: readonly unknown[]) => rows !== NOT_LOADED;

export type LiveListOptions = {
  select?: string; // PostgREST select, e.g. '*, profiles(full_name)'
  since?: { col: string; value: string }; // only rows with col >= value
};

export function useLiveList<Row, T>(
  table: string,
  patientId: string | undefined,
  order: { col: string; asc: boolean },
  map: (r: Row) => T,
  opts: LiveListOptions = {},
): T[] {
  const [rows, setRows] = useState<T[]>(NOT_LOADED);
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
      return q.order(order.col, { ascending: order.asc }).then(({ data, error }) => {
        // Offline the fetch fails: keep showing the last rows instead of "nothing".
        // A runtime select string defeats supabase's row typing.
        if (active && !error) setRows(((data ?? []) as unknown as Row[]).map(map));
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

  return rows;
}
