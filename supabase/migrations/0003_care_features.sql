-- Tend care features: medication schedules + doses, vital readings, conditions,
-- per-patient vital plans, shift windows. Apply after 0002_rls.sql in the
-- Supabase SQL Editor. Idempotent: safe to re-run (re-running also migrates
-- legacy rows written since the last run).
--
-- Purely additive: `vitals`, `medications` and vela-web's `medication_plans`
-- stay as they are (vela-web still writes them). Compatible with vela-web's
-- migrations on the same project (0003_lazo … 0006_medication_plans) in any order. Doses are expanded client-side from medication_schedules;
-- medication_doses stores what someone recorded. Push reminders (pg_cron +
-- Edge Function) are deferred until the EAS dev build exists.

-- ---------------------------------------------------------------- enums
do $$ begin create type public.reminder_mode as enum ('exact', 'before'); exception when duplicate_object then null; end $$;
do $$ begin create type public.dose_status as enum ('pending', 'given', 'skipped', 'unrecorded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.skip_reason as enum ('asleep', 'refused', 'nausea_vomiting', 'not_eaten', 'doctor_order', 'out_of_stock', 'other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.vital_kind as enum ('bp', 'hr', 'glucose', 'spo2', 'rr', 'temp', 'weight', 'pain'); exception when duplicate_object then null; end $$;
do $$ begin create type public.condition_kind as enum ('diabetes', 'hypertension', 'heart_failure', 'copd_asthma', 'hypothyroidism', 'renal_failure', 'dementia', 'reduced_mobility'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- columns
-- Who is on shift: start inclusive, end exclusive, overnight wraps. Null = no
-- fixed shift (covers any gap). `shift` stays as a free-text label.
alter table public.care_memberships add column if not exists shift_start time;
alter table public.care_memberships add column if not exists shift_end time;
alter table public.patients add column if not exists allergies text[] not null default '{}'; -- same as vela-web 0003_lazo

-- ---------------------------------------------------------------- tables
create table if not exists public.medication_schedules (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  dose text not null default '',
  purpose text,
  times time[] not null check (cardinality(times) between 1 and 12),
  reminder_mode public.reminder_mode not null default 'before',
  reminder_minutes int not null default 15 check (reminder_minutes between 0 and 120),
  active boolean not null default true,
  start_date date not null default current_date,
  end_date date, -- inclusive (planned course)
  suspended_at timestamptz, -- "Dejar de dar": doses from this instant on are no longer expected
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (id, patient_id),
  check (end_date is null or end_date >= start_date - 1)
);
create index if not exists medication_schedules_patient_idx on public.medication_schedules (patient_id);
alter table public.medication_schedules add column if not exists suspended_at timestamptz; -- for databases that ran an earlier 0003

create table if not exists public.medication_doses (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null,
  patient_id uuid not null references public.patients(id) on delete cascade,
  scheduled_for timestamptz not null,
  status public.dose_status not null default 'pending',
  recorded_at timestamptz,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_late boolean not null default false,
  skip_reason public.skip_reason,
  skip_note text,
  reminded_at timestamptz,
  re_reminded_at timestamptz,
  unique (schedule_id, scheduled_for),
  -- a dose always belongs to its schedule's patient
  foreign key (schedule_id, patient_id) references public.medication_schedules (id, patient_id) on delete cascade,
  check (status <> 'skipped' or skip_reason is not null),
  check (skip_reason is distinct from 'other' or coalesce(btrim(skip_note), '') <> '')
);
create index if not exists medication_doses_patient_idx on public.medication_doses (patient_id, scheduled_for);

create table if not exists public.vital_readings (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  control_id uuid not null, -- groups one "control" (one save)
  kind public.vital_kind not null,
  value numeric not null,
  value2 numeric, -- diastolic
  context text check (context is null or context in ('fasting', 'pre_meal', 'post_meal', 'bedtime')),
  severity text not null check (severity in ('ok', 'warn', 'alert')),
  taken_at timestamptz not null default now(),
  taken_by uuid references public.profiles(id) on delete set null,
  note text,
  family_notified boolean not null default false
);
create index if not exists vital_readings_patient_idx on public.vital_readings (patient_id, taken_at desc);
create index if not exists vital_readings_control_idx on public.vital_readings (control_id);

create table if not exists public.patient_conditions (
  patient_id uuid not null references public.patients(id) on delete cascade,
  condition public.condition_kind not null,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (patient_id, condition)
);

create table if not exists public.vital_plans (
  patient_id uuid not null references public.patients(id) on delete cascade,
  kind public.vital_kind not null,
  frequency text not null,
  in_routine boolean not null default true, -- shown under "Según su plan"
  -- [[lo,hi]] or [[lo,hi],[lo,hi]] (bp, glucose); [] = no range yet (weight).
  -- ponytail: jsonb rather than numeric[][] — PostgREST round-trips nested JSON arrays reliably.
  ranges jsonb not null default '[]'::jsonb check (jsonb_typeof(ranges) = 'array'),
  alert_low numeric,
  alert_high numeric,
  source_conditions public.condition_kind[] not null default '{}',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (patient_id, kind)
);

-- ---------------------------------------------------------------- RLS
alter table public.medication_schedules enable row level security;
alter table public.medication_doses enable row level security;
alter table public.vital_readings enable row level security;
alter table public.patient_conditions enable row level security;
alter table public.vital_plans enable row level security;

-- Every member of the patient reads; only nurse members write. Family is
-- read-only by RLS, not by hidden buttons.
do $$
declare t text;
begin
  foreach t in array array['medication_schedules', 'medication_doses', 'vital_readings', 'patient_conditions', 'vital_plans'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (public.is_member(patient_id))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all using (public.is_nurse(patient_id)) with check (public.is_nurse(patient_id))', t || '_write', t);
  end loop;
end $$;

-- Care team (names, roles, shifts). profiles / care_memberships RLS only expose
-- your own rows, so the team comes from this SECURITY DEFINER function — the
-- same one vela-web uses, extended with the shift window. (Opening those tables
-- to co-members instead would change what vela-web's membership query returns.)
drop policy if exists memberships_comember on public.care_memberships; -- from an earlier draft of this file
drop policy if exists profiles_comember on public.profiles;
drop function if exists public.shares_patient(uuid);
drop function if exists public.care_team(uuid); -- the return type grows, so replace isn't enough
create function public.care_team(p_patient uuid)
  returns table (profile_id uuid, full_name text, role care_role, shift text, shift_start time, shift_end time)
  language sql security definer stable set search_path = public as $$
  select m.profile_id, p.full_name, m.role, m.shift, m.shift_start, m.shift_end
  from public.care_memberships m
  join public.profiles p on p.id = m.profile_id
  where m.patient_id = p_patient and public.is_member(p_patient)
  order by m.created_at;
$$;
revoke execute on function public.care_team(uuid) from public, anon;
grant execute on function public.care_team(uuid) to authenticated;

-- A nurse can undo their own handoff ("Deshacer").
drop policy if exists handoff_delete on public.shift_handoffs;
create policy handoff_delete on public.shift_handoffs for delete using (nurse_id = auth.uid() and public.is_nurse(patient_id));

-- A nurse sets only their own shift window (no general update on memberships:
-- that would let a member change their own role).
create or replace function public.set_my_shift(p_patient uuid, p_start time, p_end time) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if (p_start is null) <> (p_end is null) then raise exception 'shift_start_and_end_together'; end if;
  update public.care_memberships set shift_start = p_start, shift_end = p_end
  where patient_id = p_patient and profile_id = auth.uid() and role = 'nurse';
  if not found then raise exception 'not_a_nurse'; end if;
end; $$;
revoke execute on function public.set_my_shift(uuid, time, time) from public, anon;
grant execute on function public.set_my_shift(uuid, time, time) to authenticated;

-- Account deletion (functions/delete-account) deletes the auth user, which
-- cascades to profiles. Authored rows must not block that: care records stay for
-- the team without their author; the user's own messages go. (Same as vela-web
-- 0003_lazo for the 0001 tables; repeated here for projects without vela-web.)
alter table public.medication_schedules drop constraint if exists medication_schedules_created_by_fkey,
  add constraint medication_schedules_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.medication_schedules drop constraint if exists medication_schedules_updated_by_fkey,
  add constraint medication_schedules_updated_by_fkey foreign key (updated_by) references public.profiles(id) on delete set null;
alter table public.medication_doses drop constraint if exists medication_doses_recorded_by_fkey,
  add constraint medication_doses_recorded_by_fkey foreign key (recorded_by) references public.profiles(id) on delete set null;
alter table public.vital_readings drop constraint if exists vital_readings_taken_by_fkey,
  add constraint vital_readings_taken_by_fkey foreign key (taken_by) references public.profiles(id) on delete set null;
alter table public.patient_conditions drop constraint if exists patient_conditions_added_by_fkey,
  add constraint patient_conditions_added_by_fkey foreign key (added_by) references public.profiles(id) on delete set null;
alter table public.vital_plans drop constraint if exists vital_plans_updated_by_fkey,
  add constraint vital_plans_updated_by_fkey foreign key (updated_by) references public.profiles(id) on delete set null;
alter table public.vitals drop constraint if exists vitals_recorded_by_fkey,
  add constraint vitals_recorded_by_fkey foreign key (recorded_by) references public.profiles(id) on delete set null;
alter table public.medications drop constraint if exists medications_administered_by_fkey,
  add constraint medications_administered_by_fkey foreign key (administered_by) references public.profiles(id) on delete set null;
alter table public.care_events drop constraint if exists care_events_author_id_fkey,
  add constraint care_events_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;
alter table public.shift_handoffs drop constraint if exists shift_handoffs_nurse_id_fkey,
  add constraint shift_handoffs_nurse_id_fkey foreign key (nurse_id) references public.profiles(id) on delete set null;
alter table public.invites drop constraint if exists invites_invited_by_fkey,
  add constraint invites_invited_by_fkey foreign key (invited_by) references public.profiles(id) on delete set null;
alter table public.messages drop constraint if exists messages_sender_id_fkey,
  add constraint messages_sender_id_fkey foreign key (sender_id) references public.profiles(id) on delete cascade;

-- ---------------------------------------------------------------- basic plan
-- Every patient measures these "básico para todos" until the plan changes.
create or replace function public.seed_basic_plan(p_patient uuid) returns void
  language sql security definer set search_path = public as $$
  insert into public.vital_plans (patient_id, kind, frequency, in_routine, ranges, alert_low, alert_high)
  select p_patient, v.kind::public.vital_kind, 'Cada turno', true, v.ranges::jsonb, v.lo, v.hi
  from (values
    ('bp', '[[90,140],[60,90]]', 80, 180),
    ('hr', '[[60,100]]', 45, 130),
    ('temp', '[[36,37.5]]', 35, 38.5),
    ('spo2', '[[95,100]]', 90, 100)
  ) as v(kind, ranges, lo, hi)
  on conflict (patient_id, kind) do nothing;
$$;
revoke execute on function public.seed_basic_plan(uuid) from public, anon, authenticated;

select public.seed_basic_plan(p.id)
from public.patients p
where not exists (select 1 from public.vital_plans vp where vp.patient_id = p.id);

-- New patients: nurse membership without a hard-coded night shift, plus the basic plan.
create or replace function public.create_patient_with_nurse(p_name text, p_age int, p_room text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; begin
  insert into public.patients (full_name, age, room) values (p_name, p_age, p_room) returning id into new_id;
  insert into public.care_memberships (patient_id, profile_id, role, is_primary)
  values (new_id, auth.uid(), 'nurse', true);
  perform public.seed_basic_plan(new_id);
  return new_id;
end; $$;
grant execute on function public.create_patient_with_nurse(text, int, text) to authenticated;

-- ---------------------------------------------------------------- legacy data
-- vitals → vital_readings: one reading per non-null column, sharing the old
-- row id as control_id. Severity against the default ranges.
insert into public.vital_readings (patient_id, control_id, kind, value, value2, severity, taken_at, taken_by, note)
select v.patient_id, v.id, x.kind::public.vital_kind, x.value, x.value2, x.severity, v.taken_at, v.recorded_by, v.note
from public.vitals v
cross join lateral (values
  ('bp', v.bp_sys::numeric, v.bp_dia::numeric,
    case when v.bp_sys < 80 or v.bp_sys > 180 or v.bp_dia < 40 or v.bp_dia > 120 then 'alert'
         when v.bp_sys < 90 or v.bp_sys > 140 or v.bp_dia < 60 or v.bp_dia > 90 then 'warn' else 'ok' end),
  ('hr', v.hr::numeric, null::numeric,
    case when v.hr < 45 or v.hr > 130 then 'alert' when v.hr < 60 or v.hr > 100 then 'warn' else 'ok' end),
  ('temp', v.temp_c::numeric, null::numeric,
    case when v.temp_c < 35 or v.temp_c > 38.5 then 'alert' when v.temp_c < 36 or v.temp_c > 37.5 then 'warn' else 'ok' end),
  ('spo2', v.spo2::numeric, null::numeric,
    case when v.spo2 < 90 then 'alert' when v.spo2 < 95 then 'warn' else 'ok' end)
) as x(kind, value, value2, severity)
where x.value is not null
  and not exists (select 1 from public.vital_readings r where r.control_id = v.id);

-- vela-web's recurring plans (its 0006, if present) → schedules with the same id,
-- and their dose log (medications rows with plan_id) → 'given' doses. Every other
-- medications row is one dose, not a plan → a one-day inactive schedule reusing
-- the row id, plus a 'given' dose when it was administered.
-- Wall-clock times use LEGACY_TZ: set it to your patients' time zone before running.
do $$
declare legacy_tz constant text := 'Europe/Madrid'; -- LEGACY_TZ
begin
  if to_regclass('public.medication_plans') is not null then
    execute $q$
      insert into public.medication_schedules
        (id, patient_id, name, dose, purpose, times, start_date, end_date, active, suspended_at, created_by, created_at)
      select p.id, p.patient_id, p.name, p.dose, nullif(btrim(p.reason), ''), p.times, p.start_date, p.end_date,
             p.suspended_at is null and (p.end_date is null or p.end_date >= current_date),
             p.suspended_at, p.created_by, p.created_at
      from public.medication_plans p
      on conflict (id) do nothing
    $q$;
    execute $q$
      insert into public.medication_doses (schedule_id, patient_id, scheduled_for, status, recorded_at, recorded_by)
      select m.plan_id, m.patient_id, m.scheduled_at, 'given', coalesce(m.administered_at, m.scheduled_at), m.administered_by
      from public.medications m
      join public.medication_schedules s on s.id = m.plan_id
      where m.status = 'administered' and m.scheduled_at is not null
      on conflict (schedule_id, scheduled_for) do nothing
    $q$;
  end if;

  -- to_jsonb: medications.plan_id only exists where vela-web's 0006 ran
  insert into public.medication_schedules (id, patient_id, name, dose, purpose, times, start_date, end_date, active, created_at)
  select m.id, m.patient_id, m.name, coalesce(m.dose, ''), m.reason,
         array[(m.scheduled_at at time zone legacy_tz)::time],
         (m.scheduled_at at time zone legacy_tz)::date, (m.scheduled_at at time zone legacy_tz)::date,
         false, least(m.scheduled_at, now())
  from public.medications m
  where m.scheduled_at is not null and btrim(m.name) <> '' and (to_jsonb(m) ->> 'plan_id') is null
  on conflict (id) do nothing;

  insert into public.medication_doses (schedule_id, patient_id, scheduled_for, status, recorded_at, recorded_by)
  select m.id, m.patient_id, m.scheduled_at, 'given', coalesce(m.administered_at, m.scheduled_at), m.administered_by
  from public.medications m
  join public.medication_schedules s on s.id = m.id
  where m.status = 'administered' and m.scheduled_at is not null
  on conflict (schedule_id, scheduled_for) do nothing;
end $$;

-- ---------------------------------------------------------------- realtime
do $$
declare t text;
begin
  foreach t in array array[
    'medication_schedules', 'medication_doses', 'vital_readings', 'patient_conditions', 'vital_plans',
    'care_events', 'messages', 'shift_handoffs', 'care_memberships', 'patients'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object or undefined_object then null;
    end;
  end loop;
end $$;
