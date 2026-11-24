import { addDays, atTime, localDate, startOfDay } from '@/features/care/clock';
import { planFromRows, severity, VITALS } from '@/features/care/vitals';
import type { GlucoseCtx, VitalKind, VitalPlanRow } from '@/features/care/types';

// Offline demo (EXPO_PUBLIC_DEMO=1): a fetch that answers supabase-js from an
// in-memory copy of a sample patient, so the public web demo needs no backend
// and every screen code path stays the real one. Handles the auth endpoints
// the app uses, PostgREST select/insert/upsert/update/delete with the filters
// the app uses (eq, neq, in, is, gt/gte/lt/lte, order, limit) and the
// care_team / set_my_shift RPCs. Family can only write messages, like RLS.
// ponytail: state lives for one page load (reload = fresh sample); realtime is
// off, local writes still refresh through invalidate().

type Row = Record<string, unknown>;

export const DEMO_USERS = {
  nurse: { id: 'd0000000-0000-4000-8000-000000000001', email: 'lucia@demo.oliva', full_name: 'Lucía Romero', role: 'nurse' },
  family: { id: 'd0000000-0000-4000-8000-000000000003', email: 'javier@demo.oliva', full_name: 'Javier Martín', role: 'family' },
} as const;
const NURSE2 = 'd0000000-0000-4000-8000-000000000002';
const PID = 'd0000000-0000-4000-8000-0000000000a1';
const S = { enal: 'd0000000-0000-4000-8000-0000000000b1', metf: 'd0000000-0000-4000-8000-0000000000b2', omep: 'd0000000-0000-4000-8000-0000000000b3' };

const uuid = () => globalThis.crypto.randomUUID();
const iso = (d: Date) => d.toISOString();
// Deterministic jitter in [-1, 1] so the sample looks the same on every load.
const jit = (i: number) => ((Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1) * 2) - 1;

function seed(now: Date): Record<string, Row[]> {
  const today = startOfDay(now);
  const ago = (min: number) => iso(new Date(now.getTime() - min * 60_000));
  const start = localDate(addDays(today, -30));
  const created = iso(addDays(today, -30));

  const plans: VitalPlanRow[] = (
    [
      ['bp', 'Mañana y noche', ['hypertension']],
      ['hr', 'Con la presión', ['hypertension']],
      ['glucose', 'En ayunas y antes de cenar', ['diabetes']],
      ['spo2', 'Cada turno', []],
      ['temp', 'Cada turno', []],
    ] as [VitalKind, string, VitalPlanRow['source_conditions']][]
  ).map(([kind, frequency, source_conditions]) => ({
    patient_id: PID, kind, frequency, in_routine: true, ranges: VITALS[kind].def,
    alert_low: VITALS[kind].alert[0], alert_high: VITALS[kind].alert[1],
    source_conditions, updated_by: DEMO_USERS.nurse.id, updated_at: created,
  }));
  const plan = planFromRows(plans);

  const schedules = [
    { id: S.omep, name: 'Omeprazol', dose: '20 mg', purpose: 'Protector de estómago', times: ['08:00:00'] },
    { id: S.metf, name: 'Metformina', dose: '850 mg', purpose: 'Azúcar', times: ['08:30:00', '20:30:00'] },
    { id: S.enal, name: 'Enalapril', dose: '10 mg', purpose: 'Tensión', times: ['09:00:00', '21:00:00'] },
  ].map((s) => ({
    ...s, patient_id: PID, reminder_mode: 'before', reminder_minutes: 15, active: true, start_date: start,
    end_date: null, suspended_at: null, created_at: created, updated_by: DEMO_USERS.nurse.id, updated_at: created,
  }));

  // Two weeks of doses: given on time, except one skipped and one never recorded.
  // Today's doses less than an hour old stay pending so "Lo siguiente" has one.
  const doses: Row[] = [];
  for (let d = -14; d <= 0; d++) {
    const day = addDays(today, d);
    for (const s of schedules) for (const t of s.times) {
      const at = atTime(day, t);
      if (at.getTime() > now.getTime() - 60 * 60_000) continue;
      const by = at.getHours() < 16 ? DEMO_USERS.nurse.id : NURSE2;
      const base = { id: uuid(), schedule_id: s.id, patient_id: PID, scheduled_for: iso(at), recorded_by: by, recorded_late: false, skip_reason: null, skip_note: null };
      if (d === -4 && s.id === S.metf && t === '20:30:00') continue; // sin registrar
      if (d === -2 && s.id === S.metf && t === '08:30:00') {
        doses.push({ ...base, status: 'skipped', recorded_at: iso(at), skip_reason: 'not_eaten', skip_note: null });
        continue;
      }
      doses.push({ ...base, status: 'given', recorded_at: iso(new Date(at.getTime() + 4 * 60_000)) });
    }
  }

  // Four weeks of controls at 09:00 and 20:00. Yesterday evening's pressure is high.
  const readings: Row[] = [];
  let i = 0;
  for (let d = -27; d <= 0; d++) {
    for (const t of ['09:00:00', '20:00:00']) {
      const at = atTime(addDays(today, d), t);
      if (at > now) continue;
      const control = uuid();
      const by = at.getHours() < 16 ? DEMO_USERS.nurse.id : NURSE2;
      const morning = t === '09:00:00';
      const high = d === -1 && !morning;
      const vals: [VitalKind, number, number | null, GlucoseCtx | null][] = [
        ['bp', high ? 152 : Math.round(126 + 7 * jit(++i)), high ? 88 : Math.round(78 + 5 * jit(++i)), null],
        ['hr', Math.round(72 + 6 * jit(++i)), null, null],
        ['spo2', Math.round(97 + 1.4 * jit(++i)), null, null],
        ['temp', Math.round((36.5 + 0.3 * jit(++i)) * 10) / 10, null, null],
        ['glucose', Math.round((morning ? 112 : 132) + 14 * jit(++i)), null, morning ? 'fasting' : 'pre_meal'],
      ];
      for (const [kind, value, value2, context] of vals) {
        readings.push({
          id: uuid(), patient_id: PID, control_id: control, kind, value, value2, context,
          severity: severity(plan, kind, value, value2, context), taken_at: iso(at), taken_by: by, note: null, family_notified: false,
        });
      }
    }
  }

  const lastHandoff = now.getHours() >= 8 ? atTime(today, '08:00:00') : atTime(addDays(today, -1), '16:00:00');
  const morningNote = now.getHours() >= 11 ? atTime(today, '10:30:00') : new Date(now.getTime() - 20 * 60_000);

  return {
    patients: [{ id: PID, full_name: 'Elena Martín Ruiz', age: 84, room: null, status: 'Estable', allergies: ['Penicilina'], created_at: created }],
    profiles: [
      { id: DEMO_USERS.nurse.id, full_name: DEMO_USERS.nurse.full_name },
      { id: NURSE2, full_name: 'Carmen Díaz' },
      { id: DEMO_USERS.family.id, full_name: DEMO_USERS.family.full_name },
    ],
    care_memberships: [
      { id: uuid(), patient_id: PID, profile_id: DEMO_USERS.nurse.id, role: 'nurse', relationship: null, shift: null, shift_start: '08:00:00', shift_end: '16:00:00' },
      { id: uuid(), patient_id: PID, profile_id: NURSE2, role: 'nurse', relationship: null, shift: null, shift_start: '16:00:00', shift_end: '08:00:00' },
      { id: uuid(), patient_id: PID, profile_id: DEMO_USERS.family.id, role: 'family', relationship: 'Hijo', shift: null, shift_start: null, shift_end: null },
    ],
    medication_schedules: schedules,
    medication_doses: doses,
    vital_readings: readings,
    patient_conditions: [
      { patient_id: PID, condition: 'hypertension', added_by: DEMO_USERS.nurse.id, added_at: created },
      { patient_id: PID, condition: 'diabetes', added_by: DEMO_USERS.nurse.id, added_at: created },
    ],
    vital_plans: plans,
    care_events: [
      { id: uuid(), patient_id: PID, author_id: DEMO_USERS.nurse.id, type: 'note', title: null, body: 'Ha desayunado bien y ha dado un paseo corto por el pasillo.', severity: 'info', occurred_at: iso(morningNote) },
    ],
    shift_handoffs: [
      {
        id: uuid(), patient_id: PID, nurse_id: NURSE2, summary: 'Noche tranquila. Ha dormido seguido desde las 23:00.',
        recommendation: 'Vigilar la tensión de la tarde: ayer subió a 152/88.', started_at: iso(new Date(lastHandoff.getTime() - 8 * 3600_000)), ended_at: iso(lastHandoff),
      },
    ],
    messages: [
      { id: uuid(), patient_id: PID, sender_id: DEMO_USERS.family.id, body: '¿Qué tal ha pasado la noche mi madre?', created_at: ago(95), read_at: null },
      { id: uuid(), patient_id: PID, sender_id: DEMO_USERS.nurse.id, body: 'Muy bien, ha dormido seguido. Esta mañana ha desayunado todo.', created_at: ago(80), read_at: null },
      { id: uuid(), patient_id: PID, sender_id: DEMO_USERS.family.id, body: 'Gracias, Lucía. Paso a verla por la tarde.', created_at: ago(70), read_at: null },
    ],
    invites: [{ id: uuid(), patient_id: PID, email: null, role: 'family', code: 'K7M2QX', invited_by: DEMO_USERS.nurse.id, accepted_at: null, expires_at: iso(addDays(now, 7)) }],
  };
}

let db: Record<string, Row[]> | null = null;
const store = () => (db ??= seed(new Date()));

// ---------- auth ----------
const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const userOf = (u: (typeof DEMO_USERS)[keyof typeof DEMO_USERS]) => ({
  id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: { provider: 'email' },
  user_metadata: { full_name: u.full_name }, created_at: '2026-01-01T00:00:00Z',
});
function session(u: (typeof DEMO_USERS)[keyof typeof DEMO_USERS]) {
  const exp = Math.floor(Date.now() / 1000) + 365 * 86400;
  const access_token = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: u.id, exp, role: 'authenticated' })}.demo`;
  return { access_token, token_type: 'bearer', expires_in: exp - Math.floor(Date.now() / 1000), expires_at: exp, refresh_token: u.id, user: userOf(u) };
}
const byId = (id: unknown) => Object.values(DEMO_USERS).find((u) => u.id === id);
function caller(h: Headers) {
  const token = h.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  try {
    return byId(JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub);
  } catch {
    return undefined;
  }
}

// ---------- PostgREST ----------
const ISO = /^\d{4}-\d\d-\d\dT/;
const val = (v: unknown) => (typeof v === 'string' && ISO.test(v) ? Date.parse(v) : v);
const num = (v: unknown) => { const x = val(v); return typeof x === 'number' ? x : Number.isNaN(Number(x)) ? String(x) : Number(x); };
const RESERVED = new Set(['select', 'order', 'on_conflict', 'columns', 'limit', 'offset']);

function filterOk(r: Row, q: URLSearchParams) {
  return Array.from(q).every(([col, f]) => {
    if (RESERVED.has(col)) return true;
    const [, op = '', v = ''] = /^(\w+)\.(.*)$/.exec(f) ?? [];
    const a = r[col];
    switch (op) {
      case 'eq': return String(val(a)) === String(val(v));
      case 'neq': return String(val(a)) !== String(val(v));
      case 'in': return v.slice(1, -1).split(',').some((x) => String(val(a)) === String(val(x.replace(/^"|"$/g, ''))));
      case 'is': return v === 'null' ? a == null : String(a) === v;
      case 'gt': return num(a) > num(v);
      case 'gte': return num(a) >= num(v);
      case 'lt': return num(a) < num(v);
      case 'lte': return num(a) <= num(v);
      default: return true;
    }
  });
}

function select(table: string, q: URLSearchParams) {
  let rows = (store()[table] ?? []).filter((r) => filterOk(r, q));
  const order = q.get('order');
  if (order) {
    const [col, dir] = order.split('.');
    const k = dir === 'desc' ? -1 : 1;
    rows = [...rows].sort((a, b) => (num(a[col]) < num(b[col]) ? -k : num(a[col]) > num(b[col]) ? k : 0));
  }
  const limit = Number(q.get('limit'));
  if (limit) rows = rows.slice(0, limit);
  const cols = (q.get('select') ?? '*').split(',').map((c) => c.trim());
  return cols.includes('*') ? rows : rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
}

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const denied = () => json(403, { code: '42501', message: 'permission denied (demo)' });

function write(method: string, table: string, q: URLSearchParams, h: Headers, body: unknown, me: ReturnType<typeof caller>) {
  if (!me) return json(401, { code: 'PGRST301', message: 'no session' });
  if (me.role === 'family' && table !== 'messages') return denied(); // family is read-only, as in RLS
  const all = (store()[table] ??= []);
  if (method === 'POST') {
    const now = new Date().toISOString();
    const keys = q.get('on_conflict')?.split(',');
    for (const b of ([] as Row[]).concat(body as Row)) {
      const i = keys ? all.findIndex((r) => keys.every((k) => String(r[k]) === String(b[k]))) : -1;
      if (i >= 0 && h.get('Prefer')?.includes('merge-duplicates')) all[i] = { ...all[i], ...b };
      else if (b.id && all.some((r) => r.id === b.id)) return json(409, { code: '23505', message: 'duplicate key (demo)' });
      else all.push({ id: uuid(), created_at: now, occurred_at: now, taken_at: now, added_at: now, updated_at: now, expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(), accepted_at: null, active: true, suspended_at: null, ...b });
    }
    return json(201);
  }
  if (method === 'PATCH') all.forEach((r, i) => { if (filterOk(r, q)) all[i] = { ...r, ...(body as Row) }; });
  if (method === 'DELETE') store()[table] = all.filter((r) => !filterOk(r, q));
  return json(204);
}

function rpc(name: string, body: Row, me: ReturnType<typeof caller>) {
  const s = store();
  if (name === 'care_team') {
    return json(200, s.care_memberships.filter((m) => m.patient_id === body.p_patient).map((m) => ({
      profile_id: m.profile_id, role: m.role, shift: m.shift, shift_start: m.shift_start, shift_end: m.shift_end,
      full_name: s.profiles.find((p) => p.id === m.profile_id)?.full_name ?? '',
    })));
  }
  if (name === 'set_my_shift' && me?.role === 'nurse') {
    s.care_memberships.forEach((m) => { if (m.profile_id === me.id && m.patient_id === body.p_patient) Object.assign(m, { shift_start: body.p_start, shift_end: body.p_end }); });
    return json(204);
  }
  return denied(); // onboarding (create patient, redeem invite) isn't part of the demo
}

export async function demoFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const method = (init.method ?? 'GET').toUpperCase();
  const h = new Headers(init.headers);
  const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : undefined;
  const path = url.pathname;

  if (path.startsWith('/auth/v1/')) {
    const ep = path.slice('/auth/v1/'.length);
    if (ep === 'token') {
      const u = url.searchParams.get('grant_type') === 'refresh_token'
        ? byId(body?.refresh_token)
        : Object.values(DEMO_USERS).find((x) => x.email === String(body?.email ?? '').trim().toLowerCase());
      return u ? json(200, session(u)) : json(400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (ep === 'user') { const u = caller(h); return u ? json(200, userOf(u)) : json(401, { code: 'bad_jwt', msg: 'no session' }); }
    if (ep === 'logout' || ep === 'recover') return json(204);
    return json(422, { code: 'signup_disabled', error_code: 'signup_disabled', msg: 'Not available in the demo' });
  }
  const me = caller(h);
  if (path.startsWith('/rest/v1/rpc/')) return rpc(path.slice('/rest/v1/rpc/'.length), body ?? {}, me);
  if (path.startsWith('/rest/v1/')) {
    const table = path.slice('/rest/v1/'.length);
    if (method === 'GET' || method === 'HEAD') return me ? json(200, select(table, url.searchParams)) : json(200, []);
    return write(method, table, url.searchParams, h, body, me);
  }
  return denied(); // edge functions (delete-account)
}

// Realtime transport that never connects: the demo has no server to push changes.
export class SilentSocket {
  readyState = 0;
  binaryType = 'arraybuffer';
  onopen: unknown = null;
  onclose: unknown = null;
  onerror: unknown = null;
  onmessage: unknown = null;
  constructor(_url: string) {}
  send() {}
  close() {}
}
