# RLS and migration review: 0002–0005

This is a static review of:
- `supabase/migrations/0002_rls.sql`
- `0003_care_features.sql`
- `0004_vital_readings_unique.sql`
- `0005_rls_perf.sql`

It was done at commit `cadbcbb`, the tip of `feat/tend-redesign`. I also read `0001_schema.sql` and `supabase/functions/delete-account/index.ts`, because the foreign keys and the delete flow depend on them.

**Nothing was run.** I did not connect to the live database, apply any migration or change any migration file.

**What I could not check.** vela-web's migrations share the project but are not in this repo. Its DDL is known only from `docs/superpowers/specs/2026-10-01-vela-med-plans-design.md`, a superseded design spec. Anything that depends on vela-web or on live state is marked **ambiguous**, comes with the query that would settle it, and is **not counted** in the totals.

Two independent adversarial reviewers then checked every claim against the SQL. They corrected several items, and those corrections are folded in below.

**Severity:**
- **Blocker:** a security hole, silent data loss, or a required flow that cannot complete.
- **Major:** realistic harm with a workaround.
- **Minor:** an edge case, hardening, performance, or an integrity gap.
- **Nit:** cosmetic.

## Summary

| Area | Result |
|---|---|
| Family write access | No clinical table can be written by family under the policies in this repo. Family **can** write in three places: `messages` (by design), their own `profiles`/`push_tokens` rows, and `invites.accepted_at`, by burning pending codes through `redeem_invite` (RLS-14). Policies vela-web adds to the same tables can only be checked in the live `pg_policies` (A-5). See §1. |
| `care_team` | Checks the caller through `is_member` and has a fixed `search_path`. It cannot reach patients the caller isn't a member of. **No finding.** |
| `set_my_shift` | Checks the caller and the nurse role in its `WHERE` and has a fixed `search_path`. It only touches the caller's own membership. **No finding.** |
| Other SECURITY DEFINER functions | `is_member`, `is_nurse` and `redeem_invite` have no fixed `search_path` (RLS-3). `redeem_invite` can be brute-forced, gives `anon` an oracle (RLS-2), lets family burn codes and is not single-use under concurrency (RLS-14). |
| Delete-account | Nothing in this repo blocks it. It **would** be blocked by vela-web's `medication_plans.created_by` if that FK is NO ACTION, as the spec shows (RLS-1, conditional). Other vela-web tables, triggers and Storage are unknown (A-6). |

| Severity | Count | IDs |
|---|---|---|
| Blocker | 0 confirmed, plus **1 conditional** (ambiguous, not counted) | RLS-1 |
| Major | 2 | RLS-2, RLS-4 |
| Minor | 10 | RLS-3, RLS-5, RLS-6, RLS-7, RLS-8, RLS-9, RLS-11, RLS-12, RLS-14, RLS-15 |
| Nit | 4 | RLS-10, RLS-13, RLS-16, RLS-17 |
| Ambiguous (not counted) | 7 | A-1 … A-7 (plus RLS-1) |

## 1. Policies and functions that let a family member write

A family member is an `authenticated` user for whom `is_member(patient)` is true and `is_nurse(patient)` is false. This covers policies defined in 0001–0005 only; see A-5 for vela-web's.

| Policy / function | Where | Writes | Scope | Assessment |
|---|---|---|---|---|
| `messages_send` | 0002:69–70, rewritten 0005:18–20 | `INSERT` on `messages` when `sender_id = auth.uid()` and `is_member(patient_id)` | The patient's message thread | Intended: it backs the family Mensajes tab. It is still a family write on patient-scoped data, so "family is read-only" holds only for the clinical tables. Nothing pins `created_at`, so a message can be backdated (RLS-12). |
| `profiles_self` | 0002:31–33, rewritten 0005:10–12 | `ALL` on the user's own `profiles` row | Self | Self-scoped. It allows deleting the user's own profile (RLS-13), and any `full_name` shown to the team, such as "Enfermera Ana" (RLS-16). |
| `push_self` | 0002:79–80, rewritten 0005:22–24 | `ALL` on the user's own `push_tokens` | Self | Correct. |
| `redeem_invite(code)` (SECURITY DEFINER) | 0002:83–92 | Inserts a `care_memberships` row for the caller, and **always** updates `invites.accepted_at` | The patient behind any code the caller knows or guesses | Intended for joining, but family can read every pending code (`invites_read`) and redeem it. The insert is a no-op for an existing member, yet the code is still consumed (RLS-14). It can be brute-forced (RLS-2). |
| `create_patient_with_nurse(...)` (SECURITY DEFINER) | 0002:95–102, replaced by 0003:219–228 | Inserts a `patients` row, the caller's nurse membership and the basic `vital_plans` | A new patient | Intended for onboarding. Roles are per patient, so a user who is family on another patient can call it. It does not reach existing patients. |
| `set_my_shift(...)` (SECURITY DEFINER) | 0003:158–167 | Updates the caller's own membership | — | Family match no row and get `not_a_nurse`, so there is no family write. |

No policy in 0001–0005 lets family `INSERT`/`UPDATE`/`DELETE` on `patients`, `care_memberships`, `vitals`, `medications`, `care_events`, `shift_handoffs`, `medication_schedules`, `medication_doses`, `vital_readings`, `patient_conditions` or `vital_plans`. Every write policy on those tables is gated on `is_nurse(patient_id)`:
- 0002:40–41, 52, 56, 60 and 64
- 0003:128 and 154
- 0005:30–31, 35–36, 43–44 and 64–68

`invites` inserts are gated the same way (0002:76). Its only family-reachable write goes through `redeem_invite` (above).

## 2. SECURITY DEFINER functions

| Function | Where | Checks caller identity | Checks role | Fixed `search_path` | Can reach outside the caller's scope | Notes |
|---|---|---|---|---|---|---|
| `care_team(p_patient)` | 0003:140–150 | Yes, through `is_member(p_patient)` (`auth.uid()`) | Any member, by design: family sees the team's names and shifts | Yes (`public`) | No. A non-member gets 0 rows. `EXECUTE` is revoked from `public` and `anon`. | It bypasses `profiles` RLS on purpose, for co-members only. Every relation is qualified. The drop-and-recreate interacts with vela-web's copy of the function (A-7). |
| `set_my_shift(p_patient, p_start, p_end)` | 0003:158–167 | Yes: `profile_id = auth.uid()` in the `WHERE` | Yes: `role = 'nurse'`, and it raises `not_a_nurse` when no row matches | Yes (`public`) | No. Only the caller's own membership. `EXECUTE` is revoked from `public` and `anon`. | Start and end are set together. Start equal to end means 24 h, which matches `shifts.ts`. |
| `seed_basic_plan(p_patient)` | 0003:200–212 | No | No | Yes | Clients can't call it: `EXECUTE` is revoked from `public`, `anon` and `authenticated`. That revoke is needed, because Supabase's default privileges grant `anon`/`authenticated` directly. Only the definer-owned `create_patient_with_nurse` and the migration call it. | It only adds missing basic rows. |
| `create_patient_with_nurse(...)` | 0003:219–228 (0002:95–102 before) | Yes: the membership uses `auth.uid()`. For `anon`, the NOT NULL `profile_id` fails and the call rolls back. | Not needed | Yes in 0003. **No** in 0002's version (RLS-4). | No | Unthrottled. With anonymous sign-ins enabled (a live setting), anyone can create patients, which is hardening only. |
| `is_member` / `is_nurse` | 0002:16–28 | Yes (`auth.uid()`) | `is_nurse` checks the role | **No** (RLS-3) | No. They only report on the caller. | |
| `redeem_invite(p_code)` | 0002:83–92 | Uses `auth.uid()` but never checks it is non-null | No | **No** (RLS-3) | Yes, for any patient whose code is known or guessed (RLS-2, RLS-14). | Still executable by `PUBLIC`/`anon`: 0002:104 only adds a grant. |
| `handle_new_user()` (0001, context only) | 0001:104–109 | Trigger | — | No | No | Outside 0002–0005. It would get the same `search_path` advisor lint. |

## 3. Can delete-account still be blocked?

How the deletion works:
1. `delete-account/index.ts:19` checks the caller's JWT with `auth.getUser()`.
2. `:23` deletes that user through the GoTrue admin API.
3. The `auth.users` → `public.profiles` cascade (0001:5) and every RI action below run without RLS, so no policy can block the deletion.

Every FK that references `profiles(id)` must cascade or set null. Both reviewers enumerated all 14 such FKs (plus `profiles.id → auth.users`) independently and matched them against this table. Every set-null column is nullable and not part of a PK, unique or CHECK constraint.

| FK → `profiles(id)` | Defined | ON DELETE after 0003 | Blocks? |
|---|---|---|---|
| `care_memberships.profile_id` | 0001:28 | cascade | No |
| `push_tokens.profile_id` | 0001:96 | cascade | No |
| `messages.sender_id` (NOT NULL) | 0001:70 | cascade (0003:195–196). The user's messages are deleted. | No |
| `vitals.recorded_by`, `medications.administered_by`, `care_events.author_id`, `shift_handoffs.nurse_id`, `invites.invited_by` | 0001:40, 53, 60, 79, 90 | set null (0003:185–194) | No |
| `medication_schedules.created_by`/`updated_by`, `medication_doses.recorded_by`, `vital_readings.taken_by`, `patient_conditions.added_by`, `vital_plans.updated_by` | 0003:40, 42, 57, 81, 91, 107 | set null, inline and re-added at 0003:173–184 | No |
| **`medication_plans.created_by`** (vela-web 0006) | Outside this repo. Spec line 48: `references public.profiles(id)`, with no action. | **Never altered here.** 0005:87–91 only indexes it. | **Yes, if live as in the spec** (RLS-1) |

No `RESTRICT` constraint and no trigger on these tables exists in 0001–0005.

Deleting a patient's **only nurse** succeeds, but leaves the patient permanently without anyone who can write or invite (RLS-15). The edge function's deploy comment names a secret the CLI refuses (RLS-17).

## 4. Findings

### RLS-1 Conditional blocker (ambiguous, not counted): account deletion fails for a nurse who created a vela-web medication plan
- **Where:** `0003_care_features.sql:169–196`, whose FK block omits `medication_plans`. Also `0005_rls_perf.sql:87–91` and the README claim at `README.md:88`.
- **Statement:**
  - 0003 resets every author FK to `on delete set null` except vela-web's `medication_plans.created_by`.
  - 0005 indexes that column under a comment saying account deletion sets author columns to null.
  - The README says "`ON DELETE SET NULL` on every author column so account deletion never gets blocked".
- **Reasoning:**
  - The spec's DDL is `created_by uuid references public.profiles(id)`, which means NO ACTION.
  - If the live constraint matches, deleting such a nurse raises 23503 inside the cascade. `deleteUser` then fails, and the function returns 400, breaking App Store 5.1.1(v) for that user.
  - This is **ambiguous** because the spec is superseded and names a different file (`0003_medication_plans`). It is also possible that vela-web's real 0006 adopted SET NULL, as its `0003_lazo` did for the 0001 tables (0003:171–172).
- **Check:**
  ```sql
  select conname, confdeltype
  from pg_constraint
  where confrelid = 'public.profiles'::regclass
    and confdeltype in ('a', 'r');
  ```
  Any row in the result is a blocker.
- **Fix (not applied):** put the guarded `drop/add constraint ... on delete set null` in a migration that is **re-run after vela-web's** (0005 is already documented that way). 0003 is the wrong place: when vela-web's 0006 runs after 0003, which 0003:8 says is supported, a `to_regclass` guard there just skips.

### RLS-2 Major: invite codes can be brute-forced through `redeem_invite`, and `anon` gets a validity oracle
- **Where:** `0002_rls.sql:83–92` and `:104`. Codes come from `src/features/auth/invite.ts:2–8`.
- **Statement:**
  - `redeem_invite` is SECURITY DEFINER and can be called without limit.
  - 0002 only grants `EXECUTE` to `authenticated`. The default `PUBLIC` grant and Supabase's default grant to `anon` remain.
- **Reasoning:**
  - **Search space:** codes are 6 characters from a 31-symbol alphabet (31⁶ ≈ 8.9×10⁸). They default to a 7-day lifetime (0001:92), though `invites_insert` doesn't enforce it.
  - **Growing target set:** `perfil.tsx:87–97` mints a new code on every tap without retiring old ones, so the number of live codes N keeps growing.
  - **Attack:** an authenticated attacker who loops guesses joins the patient of every hit as family, with read access to vitals, medication, notes and messages. Each guess succeeds with probability N/8.9×10⁸.
  - **Oracle:** `anon` can tell codes apart without consuming them. An invalid code raises P0001 `invalid_or_expired_invite`. A valid code fails later on the NOT NULL `profile_id` (23502), and the statement rolls back, so the code survives.
  - **Detail leak:** the 23502 `DETAIL` ("Failing row contains …") is built with the definer's privileges and returned by PostgREST. It very likely reveals the target `patient_id` and the invite's role. That depends on the function owner, which is postgres by default.
  - Unchanged by the redesign (pre-existing), but in 0002's scope.
- **Fix (not applied):**
  - Revoke `EXECUTE` from `public` and `anon`, `set search_path = public`, and raise when `auth.uid() is null`.
  - Use longer codes or bind them to the invitee's email, and throttle attempts (for example a per-user attempts table).

### RLS-3 Minor: `is_member`, `is_nurse` and `redeem_invite` are SECURITY DEFINER without a fixed `search_path`
- **Where:** `0002_rls.sql:16`, `:23` and `:83`. 0005 does not redefine them.
- **Reasoning:**
  - Every relation is schema-qualified. `now()` and the operators resolve in `pg_catalog`, which is searched first implicitly, and `pg_temp` is never searched for functions.
  - Shadowing would need `CREATE` on a schema in the caller's path, which API callers don't have. This is hardening plus Supabase's `function_search_path_mutable` lint, which 0005 (a performance-advisor fix) doesn't touch.
- **Fix:** `set search_path = public` (or `''`) on all three.

### RLS-4 Major (borderline minor): re-running 0002 after 0003 silently downgrades `create_patient_with_nurse`
- **Where:** `0002_rls.sql:95–102` against `0003_care_features.sql:219–228`. 0002:2 says "safe to re-run", and README:59 tells operators to re-run 0005, not 0003, after 0002.
- **Reasoning:**
  - `create or replace` also replaces the function's settings. A re-run of 0002 removes 0003's `search_path`, restores `shift = 'night'`, and drops the `seed_basic_plan` call. 0005 doesn't restore it.
  - Patients created afterwards have no `vital_plans`. The client then shows the BASIC fallback, and the first range a nurse edits turns that fallback off, so the other basic vitals vanish (Task 1 finding on `app/(app)/plan.tsx:81`, `vitals.ts:76–86`).
  - Re-running 0003 restores the function, but it only re-seeds patients with zero plan rows (0003:214–216).
- **Fix:** remove the function from 0002, or make 0002 identical to 0003's version.

### RLS-5 Minor: re-running 0002 or 0003 undoes 0005
- **Where:**
  - 0002:31–33, 44–46, 56, 69–70 and 79–80
  - 0003:121–130 and 153–154
  - against 0005:49–70
- **Reasoning:**
  - The re-runs recreate `<t>_write FOR ALL` next to 0005's split policies, and bare `auth.uid()` policies. Permissive policies OR together, so access is unchanged; only the advisor and performance problems return.
  - Only the README and 0005's own header (0005:4–5) warn about this, and someone re-running 0002 or 0003 won't see either.
- **Fix:** fold 0005's split and `(select auth.uid())` into 0002 and 0003.

### RLS-6 Minor: 0005 and 0003 hold AccessExclusive locks across many statements
- **Where:** `0005_rls_perf.sql:6`, `:10–16` and `:98`, and `0003_care_features.sql:173–196`.
- **Reasoning:**
  - `create/drop policy` takes AccessExclusive on its table, starting with `profiles` and `care_memberships`. The explicit transaction holds those locks through the remaining rewrites and the non-concurrent index builds.
  - `is_member`/`is_nurse` need AccessShare on `care_memberships`, so API reads and Realtime checks queue until commit. A crossing lock order with a concurrent transaction can deadlock.
  - 0003 is heavier and repeats on every re-run: each of its 12 `drop/add constraint ... foreign key` statements (without `not valid`) takes AccessExclusive and scans the referencing table.
- **Fix:** run the parts as separate executions. Deleting `begin`/`commit` is not enough, because the SQL Editor wraps a multi-statement script in one transaction. Build indexes `concurrently`, outside a transaction. Re-add FKs `not valid` and then `validate constraint`.

### RLS-7 Minor: three `ON DELETE CASCADE` foreign keys remain unindexed
- **Where:** `0005_rls_perf.sql:72–96`, against 0001:39, 49 and 86.
- **Reasoning:**
  - `vitals.patient_id`, `medications.patient_id` and `invites.patient_id` have no leading-column index. All other patient and author FKs are covered.
  - 0005's header (`:1–3`) claims to clear `unindexed_foreign_keys`, which these three keep tripping.
  - The cost only hits admin deletions of a patient (`patients` has no DELETE policy) and vela-web's filtered reads. vela-web might have indexed these columns on the live project.

### RLS-8 Minor: author columns are not bound to the caller, and nurse update/delete is not limited to the author
- **Where:**
  - `0002_rls.sql:52`, `:56`, `:60`, `:64` and `:76`
  - `0003_care_features.sql:128`
  - `0005_rls_perf.sql:64–68`
- **Reasoning:**
  - The insert checks test only `is_nurse(patient_id)`, so a nurse can record `recorded_by`, `administered_by`, `taken_by`, `author_id`, `nurse_id` or `invited_by` as a colleague.
  - The update/delete policies on `medication_doses` and `vital_readings` are not author-scoped, and the `UPDATE ... WITH CHECK` pins neither the author column nor `patient_id`. A nurse can rewrite who recorded a dose after the fact, or move a row to another patient they also nurse.
  - The app's own `record()` upsert (`medicacion.tsx:160–170`) overwrites another nurse's dose through `ON CONFLICT DO UPDATE`. The "only my own record" rule exists only in the UI (`medicacion.tsx:143`).
  - Only an insider can do this, but it weakens the medication audit trail the family relies on (arguably major for clinical audit).
- **Fix:** add `<author> = (select auth.uid())` to the insert checks and to the update/delete rules where only the author may undo. Pin `patient_id` on update.

### RLS-9 Minor: family can read every invite code, and nurses can mint nurse invites
- **Where:** `0002_rls.sql:73–76`, and the app insert at `nurse/(tabs)/perfil.tsx:92`.
- **Reasoning:**
  - `invites_read` uses `is_member`, so family sees every code and any invitee `email`. `invites_insert` doesn't constrain `role`, so any nurse can mint a `nurse` invite, through the API if not the UI.
  - A family member can hand a nurse-role code to another account, which joins with full write access. `redeem_invite` copies `inv.role`, and a `doctor` role has no write policy, so only nurse codes escalate.
  - Family-role codes certainly exist. Family can pass them on, so a third party gets read access to the patient's health data without the nurse's say. Nothing binds a code to an email, and the only way to revoke access is the service role (RLS-15).
  - This app only mints `family` codes. Whether nurse codes exist live is A-4.
- **Fix:** limit `invites_read` to nurses (or to `invited_by = auth.uid()`), and add `role = 'family'` to the insert check unless nurse invites are a feature.

### RLS-10 Nit: 0004 builds its unique index without a duplicate check
- **Where:** `0004_vital_readings_unique.sql:4`.
- **Reasoning:**
  - The non-concurrent `create unique index` blocks writes to `vital_readings` while it builds, and aborts if `(control_id, kind)` pairs are duplicated.
  - Such duplicates could exist from builds between `ad2c61e` (outbox) and `a5b2c30` (reading client ids), which replayed readings without a client id. Whether they do is live state.
  - The file is atomic, so a failure is visible and its `drop index` rolls back too. Since `a5b2c30` a replay already hits the primary key, so 0004 is defence in depth.
- **Fix:** add a pre-check, or dedupe first.

### RLS-11 Minor: 0005 replaces vela-web's undo policies on assumption
- **Where:** `0005_rls_perf.sql:27–38` and `:41`.
- **Reasoning:**
  - `vitals_undo` and `events_undo` are recreated from a hand-written predicate with default roles; only their names are checked.
  - `handoff_undo` is dropped as "identical". Any widening relative to a stricter vela-web `handoff_undo` already happened in 0003:153–154, because the permissive `handoff_delete` ORs with it. 0005 only removes the redundant policy.
  - A safer rewrite reads `pg_policies.qual` and swaps only `auth.uid()` for `(select auth.uid())`. A-1 covers whether vela-web's originals actually differ.

### RLS-12 Minor: `messages_send` lets the sender set `created_at`
- **Where:** `0002_rls.sql:70` and `0005_rls_perf.sql:18–20`.
- **Reasoning:**
  - Any member, family included, can insert a message with any `created_at`, and the thread is ordered by it (0001:118).
  - Backdating a message in a care thread ("I warned you at 08:00") is an integrity problem, not a cosmetic one.
  - `read_at` doesn't matter here: nothing in the app reads or writes it, and `messages` has no UPDATE policy.
- **Fix:** a trigger that sets `created_at = now()`. A column-level grant only works after revoking the table-level `INSERT` that Supabase's default privileges give `anon`/`authenticated`.

### RLS-13 Nit: `profiles_self FOR ALL` allows deleting one's own profile row
- **Where:** `0002_rls.sql:31–33` and `0005_rls_perf.sql:10–12`.
- **Reasoning:**
  - A crafted API `DELETE` cascades memberships, push tokens and messages and nulls authorship, while `auth.users` stays.
  - Only the 0001:111–113 trigger creates profiles, and the app never inserts one, so the user stays stranded until they `POST` their own profile back.
  - Only the caller is affected.
- **Fix:** split the policy into `select` + `update`.

### RLS-14 Minor: family can burn pending invite codes, and a code is not single-use under concurrency
- **Where:** `0002_rls.sql:73–74` (`invites_read`), together with `:85–90`.
- **Reasoning:**
  - **Burning codes:** `redeem_invite`'s membership insert does nothing for an existing member (`on conflict do nothing`), but `update invites set accepted_at = now()` runs anyway. A family member who reads a pending code (RLS-9) can consume it, so the relative or nurse it was meant for can't join. This is the family write on `invites` that §1 lists.
  - **Concurrency:** the lookup takes no `for update`, and the update has no `accepted_at is null` predicate. Two accounts redeeming the same code at once both pass and both join.
- **Fix:** `update ... where id = inv.id and accepted_at is null returning`, and raise when nothing was updated or when the caller is already a member.

### RLS-15 Minor: access can't be withdrawn, and deleting the only nurse leaves a patient without one
- **Where:**
  - `0002_rls.sql:44–46`: `care_memberships` is select-only.
  - `0002_rls.sql:73–76`: `invites` allows select and insert only.
  - `0001_schema.sql:28`: membership cascade.
  - `delete-account/index.ts:23`.
- **Reasoning:**
  - No policy or RPC lets a nurse remove a family member or revoke a leaked code, so a joined relative keeps reading health data indefinitely.
  - If a patient's only nurse deletes their account, the cascade removes the last nurse membership. Only nurses can invite, and no RPC adds a nurse to an existing patient, so the patient becomes read-only for good.
  - Recovery in both cases needs service-role SQL. vela-web might provide an RPC for this.
- **Fix:** a nurse-only RPC to revoke a membership or invite, and a check or warning in delete-account when the caller is the last nurse.

### RLS-16 Nit: display-name impersonation through a self-writable profile
- **Where:** `0002_rls.sql:31–33` / `0005_rls_perf.sql:10–12`, `0001:107` and `0003:143`.
- **Reasoning:**
  - Any member can set `full_name` to anything, for example "Enfermera Ana", at sign-up (from user metadata) or later.
  - Co-members see that name through `care_team` and as the message sender's name.
  - Roles still come from the membership, so this gives no extra access.

### RLS-17 Nit: the delete-account deploy instruction names a secret the CLI refuses
- **Where:** `supabase/functions/delete-account/index.ts:3`.
- **Reasoning:** the CLI rejects `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`, because names may not start with `SUPABASE_`. The key is injected into Edge Functions automatically, so the function works anyway, but the instruction misleads operators.

## 5. Ambiguous: depends on vela-web or the live project

For each item below, there is a query to settle it on the live project. I did not run any of them.

- **A-1:** vela-web's original `vitals_undo`, `events_undo` and `handoff_undo`. They are not in the spec, and RLS-11 is only harmful if they differ.
  ```sql
  select * from pg_policies where policyname like '%undo%';
  ```
- **A-2:** 0005's split loop (`:49–70`) creates permissive nurse insert/update/delete policies on `medications` and `medication_plans`.
  - For `medications`, 0002:56 already granted the same access.
  - For `medication_plans`, the spec's `plans_write` is the same (spec:63–64).
  - The new policies OR with any narrower vela-web policy whatever its name, so only a RESTRICTIVE vela-web policy would keep a narrower rule. No family write results.
- **A-3:** FK constraint names. A NO ACTION or RESTRICT FK to `profiles` under a non-default name would survive 0003's `drop constraint if exists <default name>`. The A-6 query (`confdeltype in ('a','r')`) also catches this.
- **A-4:** whether nurse-role invites exist on the live project. RLS-9's escalation needs one.
  ```sql
  select role, count(*) from invites where accepted_at is null group by 1;
  ```
- **A-5:** policies that vela-web adds to shared tables. 0005:27–44 shows that it does, for example a `messages` UPDATE for `read_at` would be a family write. "No family write on clinical data" is proven only for 0001–0005. Settle it with `pg_policies` filtered to `cmd <> 'SELECT'`.
- **A-6:** delete-account blockers outside this repo: other vela-web tables, author FKs or triggers referencing `profiles`/`auth.users`, and `storage.objects.owner`, if vela-web uploads files and the project's storage schema still has that FK.
  ```sql
  select conrelid::regclass, conname, confdeltype
  from pg_constraint
  where confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
    and confdeltype in ('a', 'r');
  ```
  Also check `pg_trigger` on the referencing tables.
- **A-7:** `care_team` is dropped and recreated with a wider return type (0003:139–150).
  - If vela-web's migration that defines it is re-run afterwards with `create or replace` and the old type, it fails (42P13).
  - If it uses drop+create, the shift columns disappear and the revoke from `anon` is lost. Access stays gated by `is_member`.

## What I did not find

- A family write path on clinical data, in this repo's policies.
- A way to reach another patient's rows through `care_team` or `set_my_shift`.
- A RESTRICT constraint, trigger or policy in 0001–0005 that blocks account deletion.
