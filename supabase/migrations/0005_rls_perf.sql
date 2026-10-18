-- Clears the Supabase performance advisor (auth_rls_initplan,
-- multiple_permissive_policies, unindexed_foreign_keys) without changing who
-- can read or write what. Apply after 0004 in the SQL Editor. Idempotent.
-- Re-running 0002/0003 (or vela-web's migrations) brings back their original
-- policies, so run this file again after them.
begin;

-- ---------------------------------------------------------------- auth.uid() once per statement
-- `(select auth.uid())` is evaluated once instead of per row; same value.
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists memberships_self on public.care_memberships;
create policy memberships_self on public.care_memberships
  for select using (profile_id = (select auth.uid()));

drop policy if exists messages_send on public.messages;
create policy messages_send on public.messages
  for insert with check (sender_id = (select auth.uid()) and public.is_member(patient_id));

drop policy if exists push_self on public.push_tokens;
create policy push_self on public.push_tokens
  for all using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

-- Undo your own record: vela-web's policies, rewritten only where they exist.
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vitals' and policyname = 'vitals_undo') then
    drop policy vitals_undo on public.vitals;
    create policy vitals_undo on public.vitals
      for delete using (recorded_by = (select auth.uid()) and public.is_nurse(patient_id));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'care_events' and policyname = 'events_undo') then
    drop policy events_undo on public.care_events;
    create policy events_undo on public.care_events
      for delete using (author_id = (select auth.uid()) and public.is_nurse(patient_id));
  end if;
end $$;

-- handoff_undo (vela-web) and handoff_delete (0003) were identical; keep one.
drop policy if exists handoff_undo on public.shift_handoffs;
drop policy if exists handoff_delete on public.shift_handoffs;
create policy handoff_delete on public.shift_handoffs
  for delete using (nurse_id = (select auth.uid()) and public.is_nurse(patient_id));

-- ---------------------------------------------------------------- one SELECT policy per table
-- `<t>_write for all` also applied to SELECT, next to `<t>_read`. Split it into
-- insert/update/delete. SELECT stays is_member (every nurse is a member).
do $$
declare t text[];
begin
  foreach t slice 1 in array array[
    ['medication_schedules', 'medication_schedules'],
    ['medication_doses', 'medication_doses'],
    ['vital_readings', 'vital_readings'],
    ['patient_conditions', 'patient_conditions'],
    ['vital_plans', 'vital_plans'],
    ['medications', 'meds'],       -- legacy, 0002 (vela-web still writes it)
    ['medication_plans', 'plans']  -- legacy, vela-web 0006 (absent without vela-web)
  ] loop
    continue when to_regclass('public.' || t[1]) is null;
    execute format('drop policy if exists %I on public.%I', t[2] || '_write', t[1]);
    execute format('drop policy if exists %I on public.%I', t[2] || '_insert', t[1]);
    execute format('create policy %I on public.%I for insert with check (public.is_nurse(patient_id))', t[2] || '_insert', t[1]);
    execute format('drop policy if exists %I on public.%I', t[2] || '_update', t[1]);
    execute format('create policy %I on public.%I for update using (public.is_nurse(patient_id)) with check (public.is_nurse(patient_id))', t[2] || '_update', t[1]);
    execute format('drop policy if exists %I on public.%I', t[2] || '_delete', t[1]);
    execute format('create policy %I on public.%I for delete using (public.is_nurse(patient_id))', t[2] || '_delete', t[1]);
  end loop;
end $$;

-- ---------------------------------------------------------------- foreign-key indexes
-- Author columns: deleting an account sets them to null (messages: deletes the
-- rows), which otherwise scans each whole table.
create index if not exists care_events_author_id_idx on public.care_events (author_id);
create index if not exists invites_invited_by_idx on public.invites (invited_by);
create index if not exists medication_doses_recorded_by_idx on public.medication_doses (recorded_by);
create index if not exists medication_schedules_created_by_idx on public.medication_schedules (created_by);
create index if not exists medication_schedules_updated_by_idx on public.medication_schedules (updated_by);
create index if not exists medications_administered_by_idx on public.medications (administered_by);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists patient_conditions_added_by_idx on public.patient_conditions (added_by);
create index if not exists shift_handoffs_nurse_id_idx on public.shift_handoffs (nurse_id);
create index if not exists vital_plans_updated_by_idx on public.vital_plans (updated_by);
create index if not exists vital_readings_taken_by_idx on public.vital_readings (taken_by);
create index if not exists vitals_recorded_by_idx on public.vitals (recorded_by);
do $$ begin
  if to_regclass('public.medication_plans') is not null then
    create index if not exists medication_plans_created_by_idx on public.medication_plans (created_by);
  end if;
end $$;

-- Dose → schedule composite FK (ON DELETE CASCADE from medication_schedules).
create index if not exists medication_doses_schedule_patient_idx on public.medication_doses (schedule_id, patient_id);
-- useHandoffs: where patient_id = ? and ended_at >= ? order by ended_at.
create index if not exists shift_handoffs_patient_ended_idx on public.shift_handoffs (patient_id, ended_at);

commit;
