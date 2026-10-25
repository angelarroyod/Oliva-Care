# Tend — home nursing care app (mobile)

> Formerly **Vela**. This repo is the **React Native / Expo mobile** app. The web companion, **[vela-web](https://github.com/angelarroyod/vela-web)** (React + Vite, `docker compose up`), shares the same Supabase backend but still runs the previous Vela design and schema — see [Web app status](#web-app-status).

Spanish-language home-nursing app with two roles in one app:

- **Nurse (enfermera):** records vital signs and medication, writes the shift handoff, keeps the care plan.
- **Family (familiar):** follows the patient's day and week, the history and the messages.

Built with **Expo (React Native + TypeScript)**, **expo-router** and **Supabase** (Postgres + RLS + realtime). The same code runs on iOS, Android and web.

## What's in the Tend redesign

**Accessible identity.** The Oliva brand (`design/logo/oliva/kit/GUIDE.md`): an olive palette in **light and dark** appearances, both checked for WCAG contrast in `__tests__/theme.test.ts`, [Atkinson Hyperlegible Next](https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next) for UI, and an animated logo (La O, an olive leaf inside the O) that respects reduce-motion. Status is always shown as **icon + word + colour**, touch targets are ≥ 44 px, errors are written out in Spanish next to what failed and announced, and there's an in-app **text size from 100 to 200 %** (Configuración → Tamaño del texto). iOS and Android use the system tab bar (Liquid Glass on iOS 26); web keeps a floating glass bar.

**Six care features:**

| # | Feature | Where |
|---|---------|-------|
| 1 | **Weekly family dashboard** — today at the top (doses, vitals, "lo que debes saber", latest vitals), the week below (dose strip, exceptions, 4-week trend charts) | Familia → Estado |
| 2 | **Dynamic vitals form** — fields come from the patient's care plan; every value is checked against the patient's own ranges (normal / revisar / alerta, glucose by moment, pain 0–10) | Enfermera → Signos |
| 3 | **Daily history** — 7-day strip with a status dot per day, filters, one timeline of doses, controls, notes and handoffs | Historial (both roles) |
| 4 | **Skip a dose with a reason** — "No se dio" requires a reason (and a note for "Otro motivo"), visible to everyone | Medicación |
| 5 | **Configurable medication reminder** — at the exact time or N minutes before; routed to whoever is on shift when it fires, with a shift-boundary warning | Medicación → Avisos |
| 6 | **Condition-based suggestions** — adding a condition suggests which vitals to measure, how often and in which range | Plan de cuidados |

Also: "Lo siguiente" priority hero for the nurse (fever → due dose → control → handoff), fever path across nurse and family screens, structured shift handoff with undo, medication schedules ("Añadir medicamento"), per-nurse shift windows, quick replies in Mensajes, and 7-second toasts with **Deshacer**.

> The default ranges and condition suggestions are typical values. **A clinician must review them before release.**

## Screens

| Nurse | Family | Access & settings |
|-------|--------|-------------------|
| Inicio (Lo siguiente, paciente, en este turno) | Estado (hoy + esta semana) | Bienvenida (animated logo) |
| Signos (dynamic form) | Historial | Entrar · Crear cuenta |
| Historial | Mensajes | Elegir rol · Paciente · Código |
| Relevo de turno | Perfil del paciente | Configuración (tamaño del texto) |
| Perfil (turno, código de invitación) | Plan de cuidados (read-only) | Privacidad y aviso médico |
| Medicación → Aviso · Añadir medicamento (pushed) | | |
| Plan de cuidados (editable) | | |

## Run it

```bash
npm install
```

```bash
cp .env.example .env
```

Fill `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from your Supabase project, then:

```bash
npm start
```

- **Supabase:** run the SQL files in `supabase/migrations/` in order in the SQL Editor: `0001_schema.sql`, `0002_rls.sql`, `0003_care_features.sql`, `0004_vital_readings_unique.sql`, `0005_rls_perf.sql`. `0003` is idempotent and purely additive (see [Data model](#data-model)). Before running it on a project with old data, set `LEGACY_TZ` near the end of the file to your patients' time zone (default `Europe/Madrid`). `0005` only rewrites policies for the performance advisor (same access) and adds foreign-key indexes; run it again after re-running `0002`, `0003` or vela-web's migrations.
- **Phone (Expo Go):** scan the QR from `npm start`; phone and computer on the same Wi-Fi, or `npx expo start --tunnel`.
- **Web preview:** `npm run web`.
- Without `.env` the UI still loads; auth calls just fail.

## Quality gates

```bash
npm test
```

```bash
npm run typecheck
```

CI runs both on every push and pull request (43 suites, 268 tests). The care logic (doses, severity, shifts, timeline, family aggregates) is pure TypeScript with unit tests; screens have React Native Testing Library tests.

## Data model

`0003_care_features.sql` adds, on top of the M2 schema:

| Table | Holds |
|-------|-------|
| `medication_schedules` | medication + dose + purpose, `times time[]`, reminder (`exact` / `before` + minutes), start / end date, `suspended_at` ("Dejar de dar") |
| `medication_doses` | one row per **recorded** dose: `given` or `skipped` (+ reason, note), who, when, `recorded_late` |
| `vital_readings` | one row per value; a `control_id` groups one save; `severity` (ok / warn / alert) against the patient's plan at save time |
| `patient_conditions` | the patient's conditions (8 kinds) |
| `vital_plans` | per patient and vital: frequency, in routine or not, normal range(s), alert band, which conditions it comes from |

Plus `care_memberships.shift_start` / `shift_end` (who is on shift; overnight wraps), the `care_team()` RPC extended with those shift windows (names and roles of the team; `profiles` / `care_memberships` stay readable only by their owner), the `set_my_shift` RPC (a nurse changes only their own window), `ON DELETE SET NULL` on every author column so account deletion never gets blocked, and every table in the `supabase_realtime` publication. Every new table is readable by the patient's members and writable only by nurse members — **family is read-only by RLS**, not by hidden buttons.

How it behaves:

- **Doses are expanded on the device** from the schedules; only recorded doses are stored. A dose is *pending* until 60 minutes after its time and *sin registrar* after that (re-reminder shown at +30 min). Any nurse can record it later ("anotada más tarde").
- **Who gets a reminder** is whoever is on shift when it fires; a nurse without a fixed shift covers the gaps.
- **Severity:** *warn* outside the patient's normal range, *alert* outside the alert band; blood pressure takes the worse of systolic and diastolic; glucose uses the range for its moment. A temperature above 37.5 °C opens the fever path until a doctor call is logged or a normal temperature is recorded.
- **Legacy data:** old `vitals` rows are copied into `vital_readings`; vela-web's `medication_plans` become schedules with the same id (their administered doses come along); any other `medications` row becomes a one-day schedule. The old tables are left untouched for vela-web, and re-running `0003` picks up rows written since.
- **Offline:** writes made without a connection go to an outbox on the phone (`src/lib/db.ts`, through `mutate()`), a dark banner says so with the pending count, and the queue is sent in order when the connection returns ("Conexión recuperada. Se enviaron N registros."). Undo while offline takes the write back out. Lists show what was saved offline right away, marked "Pendiente de enviar" (`mergePending` in `useLiveList`), and otherwise keep the last data loaded in this session. Inserts carry a client id, so a resend after a lost response never doubles a row (`0004` adds one reading per vital per control as a database rule too).
- **Shared project with vela-web:** `0003` is written to run before or after vela-web's own migrations (`0003_lazo` … `0006_medication_plans`) — it reuses their `patients.allergies text[]` and `care_team()`, and opens no table wider than vela-web expects.

Not done yet (see [Roadmap](#roadmap)): push reminders and the server-side "sin registrar" job (need the EAS dev build).

## Project layout

```
app/                    expo-router routes
  index.tsx             session-based entry redirect
  legal.tsx             privacy + medical notice (outside the session gate)
  (auth)/               welcome, login, signup, onboarding (role → patient | code)
  (app)/                session-gated
    nurse/(tabs)/       inicio, signos, historial, relevo, perfil
    nurse/              medicacion, aviso/[id], pauta-nueva (pushed)
    family/(tabs)/      inicio (Estado), historial, mensajes, perfil
    plan.tsx            plan de cuidados (nurse edits, family reads)
    settings/           configuración
src/
  theme.ts              Oliva tokens (light + dark colour, type, radius, glass)
  components/           T (scaled text), Button, Card, Controls, Status, Sheet, Toast, Screen,
                        Icon, Logo, Avatar, TabBarIcon, TimelineItem, TrendCard, ReasonChip, ReminderPicker,
                        Glass, PressScale
  features/care/        live hooks + pure logic: clock, vitals, shifts, doses, timeline, estado, nextUp
  features/auth/        AuthProvider, useAuth, useMembership, guard, invite, appleAuth
  features/settings/    text size
  lib/                  supabase client, env, mutate/invalidate, Spanish error texts, device prefs
supabase/
  migrations/           0001_schema, 0002_rls, 0003_care_features, 0004_vital_readings_unique, 0005_rls_perf
  functions/            delete-account Edge Function
__tests__/              unit + screen tests
docs/superpowers/       earlier specs and plans (written under the Vela name)
```

## Web app status

vela-web has its own redesign (Lazo) and still writes the legacy `vitals` / `medications` / `medication_plans` tables and the free-text `patients.conditions`. Migration `0003` keeps all of them so the web app keeps working; data written there reaches Tend when `0003` is re-run. Moving the web app onto the new tables is a separate task.

## Docs

- Original design spec: [docs/superpowers/specs/2026-06-26-vela-design.md](docs/superpowers/specs/2026-06-26-vela-design.md)
- Medication plans spec (superseded by the Tend schema): [docs/superpowers/specs/2026-10-01-vela-med-plans-design.md](docs/superpowers/specs/2026-10-01-vela-med-plans-design.md)
- Milestone plans: [M1](docs/superpowers/plans/2026-06-26-vela-m1-foundation.md) · [M2](docs/superpowers/plans/2026-06-26-vela-m2-backend-auth.md) · [M3](docs/superpowers/plans/2026-07-03-vela-m3-live-data.md) · [M4](docs/superpowers/plans/2026-07-03-vela-m4-polish.md)

## Roadmap

- **M1 — Foundation** ✅ screens, navigation, theme.
- **M2 — Backend + auth** ✅ Supabase (Postgres + RLS), email/password + Sign in with Apple, onboarding, family invite/join, account deletion.
- **M3 — Live data** ✅ screens on Supabase with realtime sync (family ⇄ nurse).
- **M4 — Polish (lean)** ✅ write-error handling, accessibility labels, privacy + medical-disclaimer screen.
- **M5 — Tend** ✅ rename, accessible redesign, the six care features, schedules, shifts, new schema, app icons.
- **Next:** push reminders + server "sin registrar" job (EAS dev build, Apple enrollment) · port vela-web to Tend · release prep (EAS builds, TestFlight, store metadata).
