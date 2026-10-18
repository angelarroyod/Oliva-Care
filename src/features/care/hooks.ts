import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/useAuth';
import { useMembership } from '@/features/auth/useMembership';
import { onInvalidate } from '@/lib/db';
import { useLiveList } from './useLiveList';
import { addDays, firstName, hhmm, localDate, startOfDay } from './clock';
import { nursesFrom } from './shifts';
import { namesFrom } from './timeline';
import type {
  ConditionRow, DoseRow, EventRow, HandoffRow, MemberRow, PatientRow, ReadingRow, Role, ScheduleRow, VitalPlanRow,
} from './types';

// Live server data (supabase realtime via useLiveList). Derived values live in
// the pure modules next to this file (doses, vitals, shifts, timeline).
const id = <T,>(r: T) => r;

// Re-render every minute so pending → unrecorded and "hace N min" advance.
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// ISO start of the local day `days` ago — stable for the whole day so the live
// queries don't refetch every render.
export function useSince(days: number) {
  const today = localDate(new Date());
  return useMemo(() => addDays(startOfDay(new Date()), -days).toISOString(), [today, days]);
}

export function usePatient(pid?: string): PatientRow | null {
  const [row, setRow] = useState<PatientRow | null>(null);
  useEffect(() => {
    if (!pid) {
      setRow(null);
      return;
    }
    let active = true;
    const load = () =>
      supabase
        .from('patients')
        .select('*')
        .eq('id', pid)
        .maybeSingle()
        .then(({ data }: { data: PatientRow | null }) => {
          if (active) setRow(data);
        });
    load();
    const ch = supabase
      .channel(`patients:${pid}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients', filter: `id=eq.${pid}` }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [pid]);
  return row;
}

// Care team (names, roles, shift windows) from the care_team() RPC: profiles and
// care_memberships RLS only expose your own rows.
// ponytail: refetched after local writes (set_my_shift); another nurse's shift
// change shows on next mount — add a realtime trigger if that ever matters.
type TeamRpcRow = { profile_id: string; full_name: string | null; role: Role; shift: string | null; shift_start: string | null; shift_end: string | null };
export function useTeam(pid?: string): MemberRow[] {
  const [rows, setRows] = useState<MemberRow[]>([]);
  useEffect(() => {
    if (!pid) {
      setRows([]);
      return;
    }
    let active = true;
    const load = () =>
      supabase.rpc('care_team', { p_patient: pid }).then(({ data }: { data: TeamRpcRow[] | null }) => {
        if (!active) return;
        setRows(
          (data ?? []).map((r) => ({
            id: r.profile_id, patient_id: pid, profile_id: r.profile_id, role: r.role, relationship: null,
            shift: r.shift, shift_start: r.shift_start, shift_end: r.shift_end, profiles: { full_name: r.full_name ?? '' },
          })),
        );
      });
    load();
    const off = onInvalidate('care_memberships', load);
    return () => {
      active = false;
      off();
    };
  }, [pid]);
  return rows;
}

export const useSchedules = (pid?: string) =>
  useLiveList<ScheduleRow, ScheduleRow>('medication_schedules', pid, { col: 'created_at', asc: true }, id);

// Recorded doses since `sinceIso` (scheduled_for >= since).
export const useDoseRows = (pid: string | undefined, sinceIso: string) =>
  useLiveList<DoseRow, DoseRow>('medication_doses', pid, { col: 'scheduled_for', asc: true }, id, { since: { col: 'scheduled_for', value: sinceIso } });

export const useReadings = (pid: string | undefined, sinceIso: string) =>
  useLiveList<ReadingRow, ReadingRow>('vital_readings', pid, { col: 'taken_at', asc: true }, id, { since: { col: 'taken_at', value: sinceIso } });

export const useConditions = (pid?: string) =>
  useLiveList<ConditionRow, ConditionRow>('patient_conditions', pid, { col: 'added_at', asc: true }, id);

export const useVitalPlans = (pid?: string) =>
  useLiveList<VitalPlanRow, VitalPlanRow>('vital_plans', pid, { col: 'kind', asc: true }, id);

export const useEvents = (pid: string | undefined, sinceIso: string) =>
  useLiveList<EventRow, EventRow>('care_events', pid, { col: 'occurred_at', asc: true }, id, { since: { col: 'occurred_at', value: sinceIso } });

export const useHandoffs = (pid: string | undefined, sinceIso: string) =>
  useLiveList<HandoffRow, HandoffRow>('shift_handoffs', pid, { col: 'ended_at', asc: true }, id, { since: { col: 'ended_at', value: sinceIso } });

// Who/what every screen needs: active patient, me, the care team, a ticking clock.
export function useCare() {
  const { session } = useAuth();
  const { membership } = useMembership();
  const pid = membership?.patient_id;
  const meId = session?.user.id ?? '';
  const patient = usePatient(pid);
  const team = useTeam(pid);
  const now = useNow();
  const nurses = useMemo(() => nursesFrom(team), [team]);
  const names = useMemo(() => namesFrom(team), [team]);
  const myName = team.find((m) => m.profile_id === meId)?.profiles?.full_name?.trim() ?? '';
  return {
    pid,
    role: membership?.role ?? null,
    meId,
    myName,
    meNurse: nurses.find((n) => n.id === meId) ?? null,
    patient,
    short: firstName(patient?.full_name ?? '') || 'el paciente', // "Elena"
    team,
    nurses,
    names,
    now,
  };
}
export type Care = ReturnType<typeof useCare>;

// ---------- messages (unchanged) ----------
export type Message = { body: string; time: string; fromSelf: boolean; senderId: string };
type MsgRow = { sender_id: string; body: string; created_at: string };
export const mapMessage = (r: MsgRow, selfId: string): Message => ({
  body: r.body,
  time: hhmm(new Date(r.created_at)),
  fromSelf: r.sender_id === selfId,
  senderId: r.sender_id,
});
export const useMessages = (pid: string | undefined, selfId: string) =>
  useLiveList<MsgRow, Message>('messages', pid, { col: 'created_at', asc: true }, (r) => mapMessage(r, selfId));
