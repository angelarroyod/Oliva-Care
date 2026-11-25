-- Run the dose-reminders Edge Function every minute. Run once by hand in the
-- Supabase SQL Editor after deploying the function and applying 0006. Safe to
-- re-run: it replaces the job.
--
-- 1. Database → Extensions: enable pg_cron and pg_net (or run the two lines below).
-- 2. Pick a random secret and set it on the function:
--      supabase secrets set CRON_SECRET=<secret>
-- 3. Store the URL and the same secret in Vault (once; edit the values):
--      select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/dose-reminders', 'dose_reminders_url');
--      select vault.create_secret('<secret>', 'dose_reminders_secret');
-- 4. Run this file.
-- Stop it with: select cron.unschedule('dose-reminders');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'dose-reminders';

select cron.schedule('dose-reminders', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'dose_reminders_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'dose_reminders_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
$job$);
