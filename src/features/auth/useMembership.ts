import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export type Membership = { role: 'nurse' | 'family' | 'doctor'; patient_id: string };

// A user may belong to several patients; prefer a nurse role, else the first.
export function pickActiveMembership(rows: Membership[]): Membership | null {
  if (rows.length === 0) return null;
  return rows.find((r) => r.role === 'nurse') ?? rows[0];
}

export function useMembership() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [state, setState] = useState<{ uid: string | undefined; membership: Membership | null } | null>(null);

  // Keyed on the user, not the session object: a token refresh hands out a new
  // session every hour and must not reload (and unmount) the signed-in app.
  useEffect(() => {
    let active = true;
    if (!uid) {
      setState({ uid, membership: null });
      return;
    }
    supabase
      .from('care_memberships')
      .select('role, patient_id')
      .eq('profile_id', uid) // own rows only: members can also read the care team
      .then(({ data }) => {
        if (active) setState({ uid, membership: pickActiveMembership((data as Membership[]) ?? []) });
      });
    return () => { active = false; };
  }, [uid]);

  const current = state?.uid === uid ? state : null;
  return { loading: current === null, membership: current?.membership ?? null };
}
