# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Oliva** (formerly Tend, before that Vela; old names remain in docs, the repo folder, specs, the Expo slug/scheme and the `com.tend.app` bundle IDs): a Spanish-language home-nursing app built with Expo (React Native + TypeScript), expo-router and Supabase (Postgres + RLS + realtime). One app, two roles: **nurse (enfermera)** records vitals, doses, handoffs and the care plan; **family (familiar)** is read-only. The same code runs on iOS, Android and web. All UI copy is Spanish.

A separate repo, **vela-web**, shares the same Supabase project but still uses the legacy tables (`vitals`, `medications`, `medication_plans`, free-text `patients.conditions`). Don't drop or narrow those tables or their RLS.

## Commands

```bash
npm start                 # Expo dev server (QR for Expo Go)
npm run web               # web preview on :8081 (also the "web" config in .claude/launch.json)
npm test                  # Jest (jest-expo preset)
npm test -- __tests__/db.test.ts          # single file
npm test -- -t "name of the test"         # single test by name
npm run typecheck         # tsc --noEmit
```

CI (`.github/workflows/ci.yml`) runs `typecheck` and `npm test -- --ci`. There's no linter or formatter.

Jest also picks up the test copies in `.claude/worktrees/`. When verifying, run `npx jest --testPathIgnorePatterns '/node_modules/' '<rootDir>/.claude/'` (the CLI flag replaces the default `/node_modules/`, so pass both; or add the pattern to `jest.config.js`).

Without `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) the UI still loads; auth calls fail.

## Architecture

**Routing (`app/`).** `app/index.tsx` redirects by session; the decision itself is the pure `routeForState` in `src/features/auth/guard.ts`. `(auth)/` holds welcome, login, signup and onboarding (role → patient or invite code). `(app)/_layout.tsx` is the session and membership gate and wraps everything in `<OfflineSync>`. Nurse and family each have their own `(tabs)` group; `plan.tsx` and `settings/` are shared. `legal.tsx` sits outside the gate.

**Data layer: three cooperating pieces.**
- `src/lib/db.ts` → **`mutate(builder, ...tables)` is the only way to write.** It awaits a supabase-js builder and returns an error string or null, then `invalidate(...tables)` refetches the live lists for those tables on this device. Supabase realtime can't filter DELETE events, so without the table names, undo wouldn't show up.
- **Offline outbox (also `db.ts`).** While offline, `mutate()` serializes the *unexecuted* PostgREST builder (method, url, headers, body) into a queue persisted via SecureStore. `flush()` replays it in order on reconnect and adds auth at send time. So pass the builder itself to `mutate()`; a `.then()` chain can't be queued. Replays must be idempotent: doses upsert on `(schedule_id, scheduled_for)`, inserts carry a client-generated `id`, and `23505` counts as sent. Use `saved(msg)` for success toasts (it swaps in the offline text), and `lastQueued()` + `unqueue(id)` for undo before sending.
- `src/features/care/useLiveList.ts` → realtime-subscribed list per table and patient. `mergePending` overlays queued outbox writes so offline saves appear immediately with `pending: true`. Before the first fetch the list is a sentinel empty array; check with `isLoaded(list)`.

**Care logic (`src/features/care/`).** `hooks.ts` holds the live server data. Everything derived lives in pure, unit-tested modules: `doses` (dose expansion from schedules on the device; only *recorded* doses are stored), `vitals`/`vitalsForm` (severity against the patient's own `vital_plans` ranges), `shifts` (who's on shift, overnight wrap), `timeline`, `estado` (family dashboard aggregates), `nextUp` (nurse "Lo siguiente" priority), and `clock` (local-time helpers). Spanish weekday and month names are hard-coded in `clock.ts` on purpose: don't use `Intl` for `es`, because Hermes on Android isn't guaranteed to support it and tests must not depend on ICU. Put new logic in these pure modules, with tests, not in screens.

**UI.** Tokens live in `src/theme.ts`. **All text goes through `<T size={…}>`** (`src/components/T.tsx`), which multiplies by the in-app text scale (100–200 %). Never set `fontSize`/`fontFamily` in a style. Accessibility rules the redesign follows: status is always shown as icon + word + colour, touch targets are ≥ 44 px, errors are written out and announced, and the animated logo respects reduce-motion. `__tests__/a11y.test.tsx` checks some of this.

**Comments.** `// ponytail:` marks a deliberate simplification and names its limit. Keep that convention.

## Supabase

- Migrations live in `supabase/migrations/`, numbered `000N_name.sql` and run in order. `0003_care_features.sql` is idempotent and additive and must stay compatible with vela-web's own migrations (it runs before or after them). `0005_rls_perf.sql` must be re-run after re-running `0002`, `0003` or vela-web's migrations.
- RLS model: new tables are readable by the patient's members and writable only by nurse members. **Family is read-only by RLS**, not by hiding buttons. `profiles`/`care_memberships` are owner-only; team names come through the `care_team()` RPC, and a nurse changes their own shift via `set_my_shift`. Author columns use `ON DELETE SET NULL` so account deletion (Edge Function `supabase/functions/delete-account`) is never blocked. Every table is in the `supabase_realtime` publication.
- Migrations are applied by hand in the Supabase SQL Editor, so the live project's migration history doesn't reflect them.
- The default vital ranges and condition suggestions are placeholders pending clinician review.

## Tests

`__tests__/` holds pure-logic unit tests plus screen tests with React Native Testing Library. `jest.setup.js` mocks `expo-font`, NetInfo (via its own shipped mock) and safe-area insets. `db.test.ts` builds a real supabase-js client to check that the outbox can still read the builder's fields; if a supabase-js upgrade breaks it, that test is where it shows.
