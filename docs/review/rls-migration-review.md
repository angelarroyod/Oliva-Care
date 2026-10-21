# RLS and migration review: 0002–0005

Static review of `supabase/migrations/0002_rls.sql`, `0003_care_features.sql`, `0004_vital_readings_unique.sql` and `0005_rls_perf.sql`, at commit `cadbcbb` (tip of `feat/tend-redesign`). `0001_schema.sql` and `supabase/functions/delete-account/index.ts` were read for context, because the foreign keys and the delete flow depend on them.

Nothing was run: no connection to the live database, no migration applied, no migration file changed. Anything that depends on vela-web's migrations (which share the project but are not in this repo) or on the live state is marked **ambiguous**. These items are not counted as confirmed.

Severity uses the same scale as the code review:
- **Blocker**: a security hole, silent data loss, or a required flow that cannot complete.
- **Major**: a realistic harm, with a workaround available.
- **Minor**: an edge case, hardening, or performance.
- **Nit**: cosmetic.

## Summary

| Area | Result |
|---|---|
| Family write access | No clinical table can be written by a family member. The family writes that exist are `messages` (by design) and the user's own `profiles` and `push_tokens` rows, plus two onboarding RPCs. See §1. |
| `care_team` | Checks the caller through `is_member` and uses a fixed `search_path`. It cannot reach patients the caller is not a member of. No finding. |
| `set_my_shift` | Checks both the caller and the nurse role in its `WHERE` clause and uses a fixed `search_path`. It touches only the caller's own membership row. No finding. |
| Other SECURITY DEFINER functions | `is_member`, `is_nurse` and `redeem_invite` (0002) have no fixed `search_path`. `redeem_invite` can also be brute-forced. See RLS-2 and RLS-3. |
| Delete-account | It is blocked wherever vela-web's `medication_plans` exists: `created_by` has no ON DELETE action and no migration here relaxes it. See RLS-1. |

| Severity | Count | IDs |
|---|---|---|
| Blocker | 1 | RLS-1 (conditional on vela-web's 0006 being applied, which 0003 and 0005 both assume) |
| Major | 2 | RLS-2, RLS-4 |
| Minor | 8 | RLS-3, RLS-5, RLS-6, RLS-7, RLS-8, RLS-9, RLS-10, RLS-11 |
| Nit | 2 | RLS-12, RLS-13 |
| Ambiguous (not counted) | 4 | A-1 … A-4 |

## 1. Policies and functions that let a family member write

A family member is an `authenticated` user for whom `is_member(patient)` is true and `is_nurse(patient)` is false. Every write path such a user passes:

| Policy / function | Where | Writes | Scope | Assessment |
|---|---|---|---|---|
| `messages_send` | 0002:69–70, rewritten 0005:18–20 | `INSERT` on `messages` when `sender_id = auth.uid()` and `is_member(patient_id)` | The patient's message thread | Intended: it backs the family Mensajes tab. It is still a family write on patient-scoped data, so "family is read-only" holds only for the clinical tables. The `WITH CHECK` does not restrict `created_at` or `read_at`, so a sender can backdate a message (RLS-12). |
| `profiles_self` | 0002:31–33, rewritten 0005:10–12 | `ALL` (insert/update/delete) on the user's own `profiles` row | Self | Self-scoped. Because `DELETE` is allowed, a user can delete their profile directly (RLS-13). |
| `push_self` | 0002:79–80, rewritten 0005:22–24 | `ALL` on the user's own `push_tokens` | Self | Correct. |
| `redeem_invite(code)` (SECURITY DEFINER) | 0002:83–92 | Inserts a `care_memberships` row for the caller and updates `invites.accepted_at` | The patient named by a valid code | Intended for joining. It can be brute-forced (RLS-2). |
| `create_patient_with_nurse(...)` (SECURITY DEFINER) | 0002:95–102, replaced by 0003:219–228 | Inserts a `patients` row, the caller's nurse membership and the basic `vital_plans` | A new patient | Intended for onboarding. Any authenticated user can call it, including someone who is family on another patient, because roles are per patient. It does not reach existing patients. |
| `set_my_shift(...)` (SECURITY DEFINER) | 0003:158–167 | Updates the caller's own membership | — | Family callers match no row and get `not_a_nurse`, so there is no family write. |

No family write exists on `patients`, `care_memberships`, `vitals`, `medications`, `care_events`, `shift_handoffs`, `invites`, `medication_schedules`, `medication_doses`, `vital_readings`, `patient_conditions` or `vital_plans`. Every insert, update and delete policy on those tables is gated on `is_nurse(patient_id)`:
- 0002:40–41, 52, 56, 60, 64 and 76
- 0003:128 and 154
- 0005:30–31, 35–36, 43–44 and 64–68

## 2. SECURITY DEFINER functions

| Function | Where | Checks caller identity | Checks role | Fixed `search_path` | Can reach outside the caller's scope | Notes |
|---|---|---|---|---|---|---|
| `care_team(p_patient)` | 0003:140–150 | Yes. `is_member(p_patient)` uses `auth.uid()`. | Any member, by design: family sees the team's names and shifts. | Yes (`public`) | No. A non-member gets zero rows. `EXECUTE` is revoked from `public` and `anon`. | It bypasses `profiles` RLS on purpose, but only for co-members of the same patient. Every relation is schema-qualified. |
| `set_my_shift(p_patient, p_start, p_end)` | 0003:158–167 | Yes. `profile_id = auth.uid()` is in the `WHERE` clause. | Yes. `role = 'nurse'`, and it raises `not_a_nurse` when no row matches. | Yes (`public`) | No. It can only update the caller's own membership. `EXECUTE` is revoked from `public` and `anon`. | Start and end must be set together. Start equal to end is allowed and means a 24-hour shift, which matches the client. |
| `seed_basic_plan(p_patient)` | 0003:200–212 | No | No | Yes | Not callable by clients: `EXECUTE` is revoked from `public`, `anon` and `authenticated`. Only `create_patient_with_nurse` and the migration call it. | It only inserts missing basic rows (`on conflict do nothing`). |
| `create_patient_with_nurse(...)` | 0003:219–228 (0002:95–102 before) | Yes. The membership uses `auth.uid()`. For `anon` the NOT NULL `profile_id` fails and the whole call rolls back. | Not needed | Yes in 0003. **No** in the 0002 version (RLS-4). | No | See RLS-4 for what happens when 0002 is re-run. |
| `is_member` / `is_nurse` | 0002:16–28 | Yes (`auth.uid()`) | `is_nurse` checks the role | **No** (RLS-3) | No. They only report the caller's own membership. | All relations are qualified, so this is hardening rather than an exploit. |
| `redeem_invite(p_code)` | 0002:83–92 | Uses `auth.uid()` but never checks it is non-null | No | **No** (RLS-3) | It grants membership to any patient whose code the caller guesses (RLS-2). | Still has `EXECUTE` for `PUBLIC`, and so for `anon`, because 0002:104 only adds a grant. |
| `handle_new_user()` (0001, context only) | 0001:104–109 | Trigger | — | No | No | Outside 0002–0005. It would show up in the same `search_path` advisor check. |

## 3. Can delete-account still be blocked?

The flow works like this:
1. `delete-account/index.ts:19` checks the caller's JWT with `auth.getUser()`.
2. `:23` deletes that user with the service role, which bypasses RLS, so no policy can block the delete.
3. The delete cascades `auth.users` → `public.profiles` (0001:5). Every foreign key that references `profiles` then has to cascade or set null.

| FK → `profiles(id)` | Defined | ON DELETE after 0003 | Blocks? |
|---|---|---|---|
| `care_memberships.profile_id` | 0001:28 | cascade | No |
| `push_tokens.profile_id` | 0001:96 | cascade | No |
| `messages.sender_id` (NOT NULL) | 0001:70 | cascade (0003:195–196). The user's messages are deleted. | No |
| `care_events.author_id`, `shift_handoffs.nurse_id`, `invites.invited_by`, `vitals.recorded_by`, `medications.administered_by` | 0001 | set null (0003:185–194) | No |
| `medication_schedules.created_by` / `updated_by`, `medication_doses.recorded_by`, `vital_readings.taken_by`, `patient_conditions.added_by`, `vital_plans.updated_by` | 0003 | set null | No |
| **`medication_plans.created_by`** (vela-web 0006) | vela-web, outside this repo. Per `docs/superpowers/specs/2026-10-01-vela-med-plans-design.md:48` it is `references public.profiles(id)` with no action. | **Unchanged.** 0003 never alters it, and 0005:87–91 only indexes it. | **Yes** (RLS-1) |

No `RESTRICT` constraint and no `ON DELETE` trigger exists in 0001–0005. The app never writes to Storage (no `storage.`/`.upload(` call in `app/` or `src/`), so a `storage.objects.owner` reference cannot block deletion either.

## 4. Findings

### RLS-1 Blocker (conditional): account deletion fails for any nurse who created a vela-web medication plan
- **Where:** `0003_care_features.sql:169–196`, the FK block, which omits `medication_plans`. Also `0005_rls_perf.sql:87–91` and the claim in `README.md:88`.
- **Statement:** 0003 resets every author FK to `on delete set null` except `medication_plans.created_by`. 0005 adds `medication_plans_created_by_idx` under a comment saying account deletion sets author columns to null.
- **Reasoning:** vela-web's 0006 created `created_by uuid references public.profiles(id)` (spec line 48), which defaults to NO ACTION.
  - 0003 already treats that table as present: it migrates its rows at :258–276. 0005 also anticipates it (:59 and :87–91).
  - When a nurse who created any plan deletes their account, the `auth.users` → `profiles` cascade hits an FK violation.
  - `deleteUser` then fails and the function returns 400. That breaks the App Store 5.1.1(v) flow for that user.
  - The README states the opposite: "`ON DELETE SET NULL` on every author column so account deletion never gets blocked".
- **Fix (not applied):** in 0003 (or a new 0006), guarded by `to_regclass('public.medication_plans')`, drop and re-add `medication_plans_created_by_fkey ... on delete set null`.
- **Note:** this is blocking only where vela-web's 0006 ran. If it never ran on the project, the item is moot.

### RLS-2 Major: invite codes can be brute-forced through `redeem_invite`, and `anon` gets a validity oracle
- **Where:** `0002_rls.sql:83–92` and `:104`. Codes come from `src/features/auth/invite.ts:2–8`.
- **Statement:**
  - `redeem_invite` is SECURITY DEFINER. Any caller can invoke it with any code, as often as they like.
  - 0002 grants `EXECUTE` to `authenticated` but never revokes the default `PUBLIC` grant, so `anon` can call it too.
- **Reasoning:**
  - Codes are 6 characters from a 31-symbol alphabet (31⁶ ≈ 8.9×10⁸). They stay valid for 7 days (0001:92) and nothing throttles attempts.
  - An authenticated attacker who loops guesses joins the patient of any valid code they hit, as family. Family has read access to the patient's vitals, medication, notes and messages.
  - With N live codes, each guess succeeds with probability N/8.9×10⁸.
  - `anon` can test codes without consuming them: an invalid code raises `invalid_or_expired_invite`, while a valid one fails later on the NOT NULL `profile_id`.
  - The function is unchanged by the redesign (pre-existing), but it is in 0002's scope.
- **Fix (not applied):**
  - Revoke `EXECUTE` from `public` and `anon`, and `set search_path = public`.
  - Raise `if auth.uid() is null`.
  - Use longer codes or bind them to an email, and throttle attempts, for example with a per-user attempts table.

### RLS-3 Minor: `is_member`, `is_nurse` and `redeem_invite` are SECURITY DEFINER without a fixed `search_path`
- **Where:** `0002_rls.sql:16`, `:23` and `:83`.
- **Reasoning:**
  - Their bodies schema-qualify every relation (`public.care_memberships`, `public.invites`, `auth.uid()`), and PostgREST fixes the session's search_path.
  - So shadowing would need DDL access the API does not give. This is hardening, not an exploit.
  - It still trips Supabase's security advisor (`function_search_path_mutable`), which 0005 does not touch. 0005 only addresses the performance advisor.
- **Fix:** add `set search_path = public` (or `''`) to all three.

### RLS-4 Major: re-running 0002 after 0003 silently downgrades `create_patient_with_nurse`
- **Where:** `0002_rls.sql:95–102` against `0003_care_features.sql:219–228`. The README (`:59`) and 0002's header say 0002 is safe to re-run.
- **Reasoning:** 0002's `create or replace` puts back the old body, which:
  - has no `search_path`;
  - hard-codes `shift = 'night'`;
  - does not call `seed_basic_plan`.

  Patients created after such a re-run have no `vital_plans` rows. The client then shows the BASIC fallback, and the first range a nurse edits turns the fallback off: the other basic vitals vanish from the plan (Task 1 finding on `app/(app)/plan.tsx:81`). 0005 does not restore the function, even though the README tells operators to re-run 0005 after 0002.
- **Fix:** drop the function from 0002, or make 0002 the same as 0003's version.

### RLS-5 Minor: re-running 0002 or 0003 undoes 0005 and leaves duplicate permissive policies
- **Where:** `0002_rls.sql:56`, `0003_care_features.sql:121–130` and `:153–154`, against `0005_rls_perf.sql:49–70`.
- **Reasoning:**
  - 0003 recreates `<t>_write FOR ALL` next to 0005's `<t>_insert`, `<t>_update` and `<t>_delete`, and recreates `handoff_delete` with a bare `auth.uid()`.
  - Access stays the same, but the advisor warnings return, and nothing warns the operator except a README line.
- **Fix:** fold 0005's split and `(select auth.uid())` into 0002 and 0003 themselves.

### RLS-6 Minor: 0005 takes AccessExclusive locks for its whole run
- **Where:** `0005_rls_perf.sql:6`, `:14–16` and `:98`.
- **Reasoning:**
  - `drop/create policy` takes an AccessExclusive lock on each table (including `care_memberships` at :14–16). The explicit transaction holds those locks through the later policy rewrites and the non-concurrent `create index` statements.
  - `is_member` and `is_nurse` read `care_memberships`, so nearly every API read and Realtime check waits until the transaction commits.
  - On small tables this lasts seconds. If a long-running query or an index build stretches it, the API stalls; a crossing lock order can also abort the migration.
- **Fix:** run the policy rewrites in their own short transaction, and build the indexes separately (optionally `concurrently`, outside a transaction).

### RLS-7 Minor: three `ON DELETE CASCADE` foreign keys are still unindexed
- **Where:** `0005_rls_perf.sql:72–96`.
- **Reasoning:**
  - `vitals.patient_id`, `medications.patient_id` and `invites.patient_id` (0001:39, 49, 86) have no index. 0001 only indexes `care_memberships`, `care_events` and `messages`.
  - 0005's header says it clears `unindexed_foreign_keys`, but these three remain.
  - Deleting a patient sequential-scans those tables, and RLS-filtered `patient_id = ?` reads from vela-web scan as well.

### RLS-8 Minor: author columns are not bound to the caller, and nurse update/delete is not limited to the author
- **Where:**
  - `0002_rls.sql:60`, `:64` and `:76`
  - `0003_care_features.sql:128`
  - `0005_rls_perf.sql:64–68`
- **Reasoning:**
  - The insert `WITH CHECK`s test only `is_nurse(patient_id)`. Any nurse member can write `recorded_by`, `taken_by`, `author_id`, `nurse_id` or `invited_by` as another person, for example a doctor call or a dose attributed to a colleague.
  - The update and delete policies on `medication_doses` and `vital_readings` let any nurse change or delete another nurse's record. The "only my own record" rule in `medicacion.tsx` (`.eq('recorded_by', meId)`) exists only in the UI.
  - This is not a family issue, but it weakens the audit trail the family relies on.
- **Fix:** add `<author> = (select auth.uid())` to the insert checks, and to the update/delete `USING` where only the author may undo.

### RLS-9 Minor: family can read every invite code, and nurses can mint invites of any role
- **Where:** `0002_rls.sql:73–76`.
- **Reasoning:**
  - `invites_read` uses `is_member`, so family can read all codes for their patient.
  - `invites_insert` does not constrain `role`, so any nurse can create a `nurse` or `doctor` invite.
  - If such an invite exists, a family member can pass its code to another account, which joins with nurse write access. `redeem_invite` copies `inv.role`.
  - This app only mints `family` codes (`nurse/(tabs)/perfil.tsx:91`). Whether vela-web mints others is unknown (see A-4).
- **Fix:** limit `invites_read` to nurses (or to `invited_by = auth.uid()`), and add `role = 'family'` to the insert check unless nurse invites are a feature.

### RLS-10 Minor: 0004 builds its unique index without a duplicate check, under a write lock
- **Where:** `0004_vital_readings_unique.sql:4`.
- **Reasoning:**
  - `create unique index` (not `concurrently`) blocks writes to `vital_readings` while it builds.
  - It aborts if any `(control_id, kind)` pair is already duplicated, and there is no pre-check or dedupe.
  - Duplicates are unlikely, because legacy rows get one reading per kind per control (0003:233–248). Even so, a failure would leave the outbox replay unprotected (see the 0004 header) without anyone noticing, unless the operator reads the error.

### RLS-11 Minor: 0005 replaces vela-web's handoff and undo policies on assumption
- **Where:** `0005_rls_perf.sql:27–38` and `:41`.
- **Reasoning:**
  - `vitals_undo` and `events_undo` are dropped and recreated from a predicate written by hand. Only their names are checked, not their original `USING` clause, command or roles.
  - `handoff_undo` is dropped unconditionally as "identical" to `handoff_delete`.
  - If vela-web's originals differ, for example a time window or no `is_nurse`, 0005 changes access silently while claiming "same access". A safer rewrite reads `pg_policies.qual` and swaps only `auth.uid()` for `(select auth.uid())`. (The exact originals are in A-1.)

### RLS-12 Nit: `messages_send` doesn't pin server-owned columns
- **Where:** `0002_rls.sql:70` and `0005_rls_perf.sql:18–20`.
- **Reasoning:** any member can insert a message with any `created_at` (and a pre-set `read_at`), so a message can be placed earlier in the thread than when it was sent.
- **Fix:** restrict this with a column-level `grant insert (id, patient_id, sender_id, body)`, or a trigger that sets `created_at = now()`.

### RLS-13 Nit: `profiles_self FOR ALL` allows a self-service partial "account deletion"
- **Where:** `0002_rls.sql:31–33` and `0005_rls_perf.sql:10–12`.
- **Reasoning:**
  - `DELETE` on one's own profile through PostgREST cascades memberships, push tokens and messages, and nulls authorship, while the `auth.users` row stays.
  - The profile is only created by the insert trigger (0001:111), so the account is left without a profile and the app's next sign-in finds no membership or name.
- **Fix:** split the policy into `select` and `update` (insert is done by the trigger, delete by the Edge Function).

## 5. Ambiguous: depends on vela-web or the live project

- **A-1:** vela-web's original `vitals_undo`, `events_undo` and `handoff_undo` (and its `medication_plans` read/write policies). RLS-11 is only harmful if they differ from 0005's assumptions. This cannot be checked without vela-web's migrations or `pg_policies` on the live project.
- **A-2:** 0005's split loop (`:49–70`) creates nurse `insert`/`update`/`delete` policies on `medications` and `medication_plans` without checking that a `<p>_write FOR ALL` existed. It also overwrites any vela-web policies with the same names. If vela-web had narrowed writes on those tables (for example creator-only updates), 0005 widens them to every nurse member. No family write results in either case.
- **A-3:** FK constraint names. 0003:173–196 uses `drop constraint if exists <default name>` before re-adding. If vela-web recreated any of those FKs under a different name, the old NO ACTION constraint survives next to the new one and keeps blocking delete-account.
- **A-4:** whether any client (vela-web) creates `nurse`- or `doctor`-role invites. RLS-9 is only exploitable if it does.

## What I did not find

- A family write path on clinical data.
- A way to reach another patient's rows through `care_team` or `set_my_shift`.
- A `RESTRICT` constraint or trigger that blocks account deletion, other than RLS-1 and A-3.
