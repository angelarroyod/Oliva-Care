import { demoFetch, DEMO_USERS } from '@/lib/demo';

const BASE = 'https://demo.oliva.invalid';
const PID = 'd0000000-0000-4000-8000-0000000000a1';

async function signIn(email: string) {
  const res = await demoFetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', body: JSON.stringify({ email, password: 'x' }) });
  const s = await res.json();
  return { Authorization: `Bearer ${s.access_token}` };
}

describe('offline demo backend', () => {
  it('signs in the sample users and rejects others', async () => {
    const ok = await demoFetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', body: JSON.stringify({ email: DEMO_USERS.nurse.email }) });
    expect(ok.status).toBe(200);
    const bad = await demoFetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', body: JSON.stringify({ email: 'x@y.z' }) });
    expect(bad.status).toBe(400);
  });

  it('filters, orders and lets the nurse write', async () => {
    const h = await signIn(DEMO_USERS.nurse.email);
    const since = new Date(Date.now() - 86400_000).toISOString();
    const rows = await (await demoFetch(`${BASE}/rest/v1/vital_readings?select=*&patient_id=eq.${PID}&taken_at=gte.${since}&order=taken_at.asc`, { headers: h })).json();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r: { taken_at: string }) => r.taken_at >= since)).toBe(true);
    const body = JSON.stringify({ patient_id: PID, type: 'note', body: 'demo' });
    expect((await demoFetch(`${BASE}/rest/v1/care_events`, { method: 'POST', headers: h, body })).status).toBe(201);
  });

  it('keeps family read-only except messages', async () => {
    const h = await signIn(DEMO_USERS.family.email);
    const note = await demoFetch(`${BASE}/rest/v1/care_events`, { method: 'POST', headers: h, body: JSON.stringify({ patient_id: PID }) });
    expect((await note.json()).code).toBe('42501');
    const msg = await demoFetch(`${BASE}/rest/v1/messages`, { method: 'POST', headers: h, body: JSON.stringify({ patient_id: PID, body: 'hola' }) });
    expect(msg.status).toBe(201);
  });
});
