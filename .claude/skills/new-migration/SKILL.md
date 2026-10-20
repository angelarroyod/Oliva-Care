---
name: new-migration
description: Write the next numbered Supabase migration for Tend, check it against the project's RLS rules, apply it through the dashboard SQL Editor and verify it with the advisors.
disable-model-invocation: true
argument-hint: <what the migration should do>
---

# New migration

Task: $ARGUMENTS

The live project is shared with vela-web, and the Supabase MCP `apply_migration` always comes back `declined` in this app. Every mobile migration goes through the SQL Editor, so it never shows up in `list_migrations`. Check the tables, not the history.

## 1. Number and name

- Next number = highest `NNNN_` in `supabase/migrations/` + 1, padded to 4 digits.
- File: `supabase/migrations/NNNN_<snake_slug>.sql`.
- Header comment: what it does, what it runs after, whether it's idempotent, and what must be re-run after it (see 0005).

## 2. Write it

Wrap it in `begin; … commit;` and make it idempotent (`if not exists`, `drop policy if exists` before `create policy`, `create or replace`). Read `0002_rls.sql`, `0003_care_features.sql` and `0005_rls_perf.sql` for the house style before writing anything.

Self-check before going on. Each item is something the advisors flagged in the past or a rule of this schema:

- [ ] Every new table: `enable row level security`; read = `public.is_member(patient_id)`; write = nurse members only. **Family is read-only by RLS.**
- [ ] Policies use `(select auth.uid())`, never bare `auth.uid()` (auth_rls_initplan).
- [ ] Separate `insert` / `update` / `delete` policies. No overlapping permissive policies for the same role and action (multiple_permissive_policies).
- [ ] An index on every new foreign key column (unindexed_foreign_keys).
- [ ] Author/profile FK columns use `on delete set null`, so `delete-account` never gets blocked.
- [ ] New table added to the `supabase_realtime` publication (guarded, so a re-run doesn't fail).
- [ ] Offline replay: inserts accept a client-sent `id`; anything upserted has the unique constraint its `on_conflict` uses.
- [ ] No legacy table vela-web writes (`vitals`, `medications`, `medication_plans`, `patients.conditions`, `invites`) is dropped, narrowed, or left with tighter RLS.
- [ ] If it recreates policies that 0005 rewrote, say in the header that 0005 must be re-run after it.

Show the file to the user and wait for their OK before applying.

## 3. Baseline

Run `get_advisors` (security and performance) **before** applying, so new warnings can be told apart from the known ones. Known and accepted: leaked-password protection off, SECURITY DEFINER RPCs callable by `authenticated`, unindexed `patient_id` FKs on legacy `invites`/`medications`/`vitals`.

## 4. Apply through the SQL Editor (built-in browser)

1. The project ref is in `.mcp.json` (`project_ref=` in the URL). Open `https://supabase.com/dashboard/project/<ref>/sql/new`. The user signs in themselves; never type their credentials.
2. Ctrl+V doesn't reach the page. Set the editor text with `javascript_tool`:
   `monaco.editor.getModels()[0].setValue(\`…file contents…\`)`. Escape backticks and `${` inside the SQL.
3. Check integrity before running. In the page, compute the SHA-256 of `monaco.editor.getModels()[0].getValue(1)` (`crypto.subtle.digest`). Locally, compute `sha256sum supabase/migrations/NNNN_*.sql`. They must match. If CRLF/LF is the only difference, normalize and say so.
4. Press Run **only after the user has authorized this migration in chat**. A "Potential issue detected" dialog shows up for any `drop … if exists`; confirm it under the same authorization.
5. Never route DDL through `execute_sql` to get around this flow.

## 5. Verify

- `execute_sql` (read-only): the new tables, columns, policies and indexes exist (`pg_policies`, `pg_indexes`, `information_schema`).
- `get_advisors` again and compare with the baseline. Any new warning gets fixed in this file (re-apply, it's idempotent) or explained to the user.
- `npm run typecheck` and `npx jest --testPathIgnorePatterns '/node_modules/' '<rootDir>/.claude/'`, if app types or queries changed. Not while `npm run web` is bundling (random 5 s timeouts).

## 6. Record

- Update the auto-memory `live-supabase-schema-state.md`: the migration is live as of today's date, applied via the SQL Editor, plus any advisor items left on purpose.
- Add the file to the migration list in `README.md` (Run it → Supabase) and in the project layout.
- Don't commit unless the user asks.

## Gotchas

- `--testPathIgnorePatterns` on the CLI **replaces** the default `/node_modules/`, so pass both patterns.
- `.mcp.json` is gitignored (it holds the project ref). Fresh clone or worktree without it → ask the user for the ref; never guess it.
- Don't retry `apply_migration` after a `declined`; it never succeeds here (see step 4).
