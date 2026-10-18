// Supabase can't filter DELETE events, so a filtered realtime subscription
// never hears about deletes (undo). Live lists also register here, and every
// successful write through mutate() refetches the named tables on this device.
// ponytail: other devices catch up on their next realtime change.
const listeners = new Map<string, Set<() => void>>();

export function onInvalidate(table: string, fn: () => void) {
  const set = listeners.get(table) ?? new Set<() => void>();
  listeners.set(table, set.add(fn));
  return () => set.delete(fn);
}

export function invalidate(...tables: string[]) {
  for (const t of tables) listeners.get(t)?.forEach((fn) => fn());
}

// Awaits a Supabase write and returns the error message (or null on success).
// Pass the tables it touched so live lists refresh right away.
export async function mutate<T extends { error: { message: string } | null }>(
  p: PromiseLike<T>,
  ...tables: string[]
): Promise<string | null> {
  const { error } = await p;
  if (!error && tables.length) invalidate(...tables);
  return error?.message ?? null;
}
