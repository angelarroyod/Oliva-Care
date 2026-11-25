-- Oliva dose reminders: what the dose-reminders Edge Function needs. Apply after
-- 0005_rls_perf.sql in the Supabase SQL Editor. Idempotent and additive (vela-web
-- never reads these columns). The cron job itself is in supabase/cron/dose_reminders.sql.

-- The server turns a schedule's '08:00' into an instant in the patient's zone.
-- The app expands doses in the device's zone, so this must match where the
-- nurses' phones are. ponytail: Spain only until there's a way to set it.
alter table public.patients add column if not exists time_zone text not null default 'Europe/Madrid';

-- One device token belongs to one account: a phone that signs in as someone else
-- stops receiving the previous account's reminders, even if that sign-out never
-- reached the server. push_tokens RLS only shows your own rows, hence definer.
create or replace function public.register_push_token(p_token text, p_platform text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if coalesce(btrim(p_token), '') = '' then raise exception 'empty token' using errcode = '22023'; end if;
  delete from public.push_tokens where token = p_token and profile_id <> auth.uid();
  insert into public.push_tokens (profile_id, token, platform, updated_at)
  values (auth.uid(), p_token, p_platform, now())
  on conflict (profile_id, token) do update set platform = excluded.platform, updated_at = now();
end $$;
revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- The job reads doses by time window across patients.
create index if not exists medication_doses_scheduled_idx on public.medication_doses (scheduled_for);
create index if not exists push_tokens_token_idx on public.push_tokens (token);
