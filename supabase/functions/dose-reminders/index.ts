// Oliva — dose reminders. pg_cron calls this every minute (supabase/cron/dose_reminders.sql).
// It finds doses whose reminder is due (plan.ts), claims each one in
// medication_doses (reminded_at / re_reminded_at) so overlapping runs never send
// twice, and sends one Expo push per patient and dose time to the nurse on shift.
//
// Deploy: supabase functions deploy dose-reminders --no-verify-jwt
// Secrets: supabase secrets set CRON_SECRET=<random>   (same value as the Vault secret the cron job sends)
//          supabase secrets set EXPO_ACCESS_TOKEN=...  (optional: only if push security is on in Expo)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { LOOKAHEAD_MIN, MINUTE, UNRECORDED_MIN, dueReminders, groupReminders, type Due, type DoseState, type NurseShift, type Schedule, type Zone } from './plan.ts';

const DEFAULT_TZ = 'Europe/Madrid'; // patients.time_zone default (0006)
const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

// UTC offset (minutes) of a time zone at an instant, from Intl. An unknown zone falls back to Madrid.
function zoneFor(tz: string): Zone {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return zoneFor(DEFAULT_TZ);
  }
  return (t) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    return Math.round((wall - Math.floor(t / MINUTE) * MINUTE) / MINUTE);
  };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('Unauthorized', { status: 401 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const now = Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  const fail = (what: string, e: { message: string }) => new Response(`${what}: ${e.message}`, { status: 500 });

  // Schedules that can have a dose inside [now − 60 min, now + 120 min]. Dates are
  // patient-local, so widen by a day each way and let plan.ts decide.
  const { data: schedules, error: sErr } = await db
    .from('medication_schedules')
    .select('id, patient_id, name, dose, times, reminder_mode, reminder_minutes, start_date, end_date, suspended_at, created_at')
    .eq('active', true)
    .lte('start_date', iso(now + 2 * 86_400_000).slice(0, 10))
    .or(`end_date.is.null,end_date.gte.${iso(now - 2 * 86_400_000).slice(0, 10)}`); // suspended_at: plan.ts
  if (sErr) return fail('schedules', sErr);
  if (!schedules?.length) return Response.json({ sent: 0 });

  const patientIds = [...new Set(schedules.map((s) => s.patient_id as string))];
  const [patients, rows, nurses] = await Promise.all([
    db.from('patients').select('id, time_zone').in('id', patientIds),
    db
      .from('medication_doses')
      .select('schedule_id, scheduled_for, status, reminded_at, re_reminded_at')
      .in('patient_id', patientIds)
      .gte('scheduled_for', iso(now - (UNRECORDED_MIN + 5) * MINUTE))
      .lte('scheduled_for', iso(now + (LOOKAHEAD_MIN + 5) * MINUTE)),
    db.from('care_memberships').select('profile_id, patient_id, shift_start, shift_end').eq('role', 'nurse').in('patient_id', patientIds).order('created_at'),
  ]);
  if (patients.error) return fail('patients', patients.error);
  if (rows.error) return fail('doses', rows.error);
  if (nurses.error) return fail('nurses', nurses.error);

  const zones = new Map(patients.data.map((p) => [p.id as string, zoneFor((p.time_zone as string | null) ?? DEFAULT_TZ)]));
  const zoneOf = (pid: string) => zones.get(pid) ?? zoneFor(DEFAULT_TZ);

  const due = dueReminders(schedules as Schedule[], rows.data as DoseState[], now, zoneOf);

  // Claim before sending: a dose is reminded at most once per kind, even if two runs overlap.
  // ponytail: a send that fails after its claim is not retried.
  const claimed: Due[] = [];
  for (const d of due) {
    const col = d.kind === 'first' ? 'reminded_at' : 're_reminded_at';
    const at = iso(d.at);
    const res = d.row
      ? await db
          .from('medication_doses')
          .update({ [col]: iso(now) })
          .eq('schedule_id', d.schedule.id)
          .eq('scheduled_for', at)
          .eq('status', 'pending')
          .is(col, null)
          .select('id')
      : await db
          .from('medication_doses')
          .upsert({ schedule_id: d.schedule.id, patient_id: d.schedule.patient_id, scheduled_for: at, status: 'pending', [col]: iso(now) }, { onConflict: 'schedule_id,scheduled_for', ignoreDuplicates: true })
          .select('id');
    if (!res.error && res.data?.length) claimed.push(d);
  }

  const reminders = groupReminders(claimed, nurses.data as NurseShift[], now, zoneOf);
  const profileIds = [...new Set(reminders.flatMap((r) => r.to))];
  if (!profileIds.length) return Response.json({ sent: 0, due: due.length });

  const { data: tokens, error: tErr } = await db.from('push_tokens').select('profile_id, token').in('profile_id', profileIds);
  if (tErr) return fail('tokens', tErr);

  const messages = reminders.flatMap((r) =>
    tokens
      .filter((t) => r.to.includes(t.profile_id as string))
      .map((t) => ({
        to: t.token as string,
        title: r.title,
        body: r.body,
        sound: 'default',
        priority: 'high',
        channelId: 'dosis', // src/features/notifications/push.ts
        data: { url: '/nurse/medicacion', kind: r.kind, at: iso(r.at) },
      })),
  );

  // Expo takes up to 100 messages per request. Tokens it no longer knows are deleted.
  // ponytail: push receipts (later delivery errors) aren't checked.
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (expoToken) headers.Authorization = `Bearer ${expoToken}`;
  let sent = 0;
  const gone: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH, { method: 'POST', headers, body: JSON.stringify(chunk) });
    if (!res.ok) continue;
    const { data } = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    data?.forEach((ticket, j) => {
      if (ticket.status === 'ok') sent += 1;
      else if (ticket.details?.error === 'DeviceNotRegistered') gone.push(chunk[j].to);
    });
  }
  if (gone.length) await db.from('push_tokens').delete().in('token', gone);

  return Response.json({ due: due.length, claimed: claimed.length, sent, removed: gone.length });
});
