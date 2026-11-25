# Offline outbox audit: `src/lib/db.ts`

> **Status (2026-11-25): all 13 findings are fixed** and their tests in `__tests__/outbox-audit.test.ts` pass. In short: queued entries carry their owner's user id and only go out with that account's session (OB-5); a write made while anything is queued or being sent queues behind it, and `OfflineSync` re-flushes with backoff and on AppState `active` (OB-1, OB-3, OB-11, OB-12); an attempt that may have reached the server marks its entry `maybeSent`, which `unqueue()` refuses and which is the only case where a 23505 counts as sent (OB-2, OB-6); an online write whose fetch threw is queued for the idempotent resend (OB-8, OB-13); a queued dose is checked against the server's row before it's sent (OB-7, with a one-round-trip gap left until a `record_dose` RPC exists); `sent` overlays are only dropped after a successful refetch (OB-9); entry ids are a counter (OB-10); and `lastQueued()` is set when each `mutate()` returns (OB-4). The OB-8 test was rewritten for the fixed behaviour, because its first assertion expected the old error. The two notes under "Outside `db.ts`" are still open. The text below is the audit as written.

This audit of the offline outbox covers `mutate`, `flush`, `send`, `unqueue`, `lastQueued`/`saved` and `pendingWrites`, plus every caller of those functions. It was done at commit `cadbcbb`.

Every bug below has a failing test in `__tests__/outbox-audit.test.ts`, tagged with its id (`[OB-n …]`). The tests drive the real module with real supabase-js builders against a small in-memory PostgREST that lives in the same file. That fake server models:
- unique keys
- upsert with `merge-duplicates`
- `eq` filters
- requests that can be held, dropped, or committed with their response lost

OB-9 also runs the real `useLiveList`. Each test asserts what the server or the screen ends up showing, not the shape of the requests.

Three control tests pass. They show that the fake server behaves like PostgREST and that the parts of the outbox they cover work:
- A lost response followed by a resend is counted as sent and stored once.
- The queue keeps its order across a dropped connection.
- An undo while the write is still queued keeps it off the server.

**No source file was changed.** The fixes are proposals only.

I wrote OB-1 to OB-5 first. An adversarial pass then confirmed all five, refuted my two "no bug" claims, and found OB-6 to OB-13. Every one was then reproduced with a failing test before being listed here.

## Summary by category

| Category | Findings |
|---|---|
| 1. Non-idempotent replays | **OB-6**: after a send ends in `retry`, the outbox can't tell "maybe committed" from "never sent", so an undo unqueues a write the server already has. **OB-7**: a queued absolute write replays over another nurse's newer record. **OB-13**: an online write whose response is lost is handed back as failed. The screens then resend it with new client ids, so it is stored twice. Each queued request is idempotent *on its own*: client ids, natural keys, absolute updates. My original "no independent bug" claim was wrong. |
| 2. Ordering | **OB-1**: online writes overtake queued ones after a flush stops. **OB-12**: `mutate()` decides online or offline before waiting for the flush. **OB-11**: one hung queued send blocks every later online save. |
| 3. 23505 handling | **OB-2**: any 23505 counts as "already sent", even a conflict with someone else's row. **OB-8**, the reverse: an online retry whose first attempt landed gets a 23505 that is reported as a failure. |
| 4. Undo-before-send races | **OB-3**: undo while the record is in flight, then the send fails. **OB-4**: `lastQueued()` is a module global. **OB-6**: undo after a send whose response was lost. |
| Other | **OB-5**: replay under another account. **OB-9**: the "sent" overlay is cleared even when the refetch failed. **OB-10**: same-millisecond entry ids collide. |

| Severity | Findings |
|---|---|
| Blocker | OB-5 |
| Major | OB-1, OB-6, OB-7, OB-9, OB-13 |
| Minor | OB-2, OB-3 (the dose path could be argued major), OB-4, OB-8, OB-10, OB-11, OB-12 |

## Findings

### OB-1 Ordering (major): online writes overtake queued ones after a flush stops
- **Where:** `db.ts:129`, together with `:180–185` and `components/Offline.tsx:29–36`.
- **Test:** `[OB-1 ordering]`. A stale `vital_plans` range `[[60,100]]` overwrites the newer `[[50,90]]`.

**What happens:**
- `mutate()` only waits for a flush that is already running.
- `flush()` stops at the first `retry` (5xx, 401, a network drop, or no session) and leaves the queue in place.
- Nothing flushes again while NetInfo stays "online". `OfflineSync` only reacts to NetInfo changes, and there is no timer and no AppState hook.
- On iOS a reconnect emits two events (reachable `null`, then `true`), so a network failure on the first flush gets one second chance. A failure after reachability is confirmed (a 503/401, a failed token refresh, Android's single VALIDATED event) leaves the queue stuck until the next network change or restart.
- **The stall is invisible.** The banner only shows offline, and the reconnect toast only shows when something was sent or failed. So doses, controls and handoffs recorded offline stay on the phone while the app looks online, and other caregivers don't see them.
- Every online write in that window reaches the server ahead of the older queued ones. When the queue finally goes out, the stale writes land last.

**Proposed fix:**
1. In `mutate()`, compute `toRequest(p)` whatever the online state, then `await flushing`.
2. If the outbox is still non-empty, `await flush()` once more.
3. If it is *still* non-empty, queue this write behind it instead of sending it.
4. Also re-flush with backoff (5 s → 60 s) after a `retry` while online, and on AppState `active`.

This one change also fixes OB-3, OB-11 (with a send timeout) and OB-12.

### OB-2 23505 (minor): any unique violation counts as "already sent"
- **Where:** `db.ts:167–168`, and the caller `nurse/(tabs)/perfil.tsx:87–97`.
- **Test:** `[OB-2 23505]`. `flush()` reports `{ sent: 1 }` while the server has no invite for the patient.

**What happens:**
- `send()` treats every 23505 as a resend whose response was lost. That is only true for the write's own key.
- `invites` inserts carry no client id, and `code` is unique.
- So an invite code created offline that collides with an existing invite is dropped as "sent". Meanwhile `perfil` already shows the code as ready to share.
- If the colliding invite is still open, a family member redeeming it joins **another patient's** care team. That is a privacy breach, though the odds are tiny: there are 31⁶ possible codes.
- Online, the same collision shows an alert and the next tap generates a new code.

**Proposed fix:**
- Make invite creation online-only: show "Necesitas conexión para crear el código". This also stops a code being shared before it exists on the server.
- In `send()`, count a 23505 as sent only when PostgREST's `details` names the entry's own key (`Key (id)=`, `(control_id, kind)`, `(patient_id, condition)`). Otherwise count it as `failed`.

### OB-3 Undo race (minor): undo while the record is in flight, then the send fails
- **Where:** `db.ts:143–149` together with `:129`. Callers: `relevo.tsx:67–70`, `signos.tsx:102–104`, `medicacion.tsx:177–178`.
- **Test:** `[OB-3 undo race]`. Handoff `h1` is back on the server after "Deshacer" reported success.

**What happens:**
- The connection returns within the toast's 7 seconds, and the nurse taps Deshacer while `flush()` is sending the record.
- `unqueue()` returns `false`, so the compensating write runs online after the flush. Since the send ended in `retry`, the record is still queued.
- The compensating write goes first (a no-op, or a delete of the committed row), and the record is sent again.
- Drop-before-commit, a lost response and a 503 all reproduce it.
- On the dose path the compensating `PATCH ... eq('recorded_by', me)` matches nothing and returns no error, so the dose ends up "given" although the nurse undid it.

**Proposed fix:** the OB-1 change, so the compensating write is queued behind its record. Don't try to cancel an in-flight request: after a lost response the client can't know whether it was committed.

### OB-4 Undo race (minor): `lastQueued()` is a module global
- **Where:** `db.ts:47`, `:118–122` and `:137–139`. Callers read it after `await mutate()` in `medicacion.tsx:177`, `signos.tsx:98`, `relevo.tsx:66` and `mensajes.tsx:53`, and also through `saved()`.
- **Test:** `[OB-4 undo race]`. The "Dada" undo unqueues the vitals control, taking the outbox from 1 to 0.

**What happens:**
1. A "Dada" sent online hangs on a weak link. On Android, RN fetch has no timeout.
2. NetInfo flips to offline, and the nurse saves a control on Signos, which is queued. The `busy` flag is per screen, and the toast is global.
3. When "Dada" returns, its caller reads the control's id. Its toast then says "Guardado en el teléfono…".
4. Its "Deshacer" removes the **control** from the outbox, so the control is lost silently, and never resets the dose.

**Proposed fix:** return the queued id from the write itself. For example, `write()` resolves to `{ error, queued }`, with `mutate = async (...a) => (await write(...a)).error` kept for other callers. Then drop the module-global `lastId`.

### OB-5 Replay identity (blocker): writes queued by one account are sent with the next account's session
- **Where:** `db.ts:43`, `:57` and `:151–154`. No sign-out or account-deletion path clears or scopes the queue: `AuthProvider.signOut`, `settings` `leave`/`deleteAccount` and `onboarding` `leave` all leave it.
- **Test:** `[OB-5 replay identity]`. Carmen's message goes out with `Bearer tok-rosa`.

**What happens:** this hits a shared device, such as a tablet in the patient's home used by rotating nurses.
- **If Rosa is a nurse of the same patient:** Carmen's records are written under Rosa's authority but credited to Carmen. RLS never checks author columns (RLS-8 in the RLS review). Her queued `set_my_shift` runs as Rosa and overwrites **Rosa's** shift window.
- **Otherwise:**
  - Carmen's inserts are rejected and dropped as "failed", and only Rosa sees "No se pudieron enviar N registros".
  - Her PATCHes ("Dejar de dar", dose undo) touch 0 rows, return 2xx, are counted as sent, and are lost without notice. A stopped medication stays active, and an undone dose stays given.
- The queued health data also stays in SecureStore after sign-out and after account deletion.

**Proposed fix:**
- Stamp each entry with the queuing user's id. In `send()`, keep (`retry`) entries whose owner isn't the current session user, or key storage per user (`tend.outbox.<uid>`).
- Warn before signing out with pending writes, and clear the queue on account deletion.

### OB-6 Replay / undo (major): undo after a send that reached the server but lost its response
- **Where:** `db.ts:143–145` (`unqueue`) with `:184–185` (on `retry` the entry stays queued and `inFlight` resets).
- **Test:** `[OB-6 replay / undo]`. The dose is still `given` on the server after the undo.

**What happens:**
- The server commits the queued write, but its answer is lost, or a 502/504 comes back after the commit. `send()` returns `retry`.
- `flush()` returns `{0,0}`, so no reconnect toast replaces the 7-second "Deshacer".
- The nurse taps it. `unqueue()` returns **true**, because the entry is queued and not in flight, so the caller skips its compensating write. Nothing ever undoes the copy the server already has.
- This is a different branch from OB-3, where `unqueue()` returns `false`. Fixing OB-3 alone does not cover it.

**Proposed fix:**
- Mark entries whose request may have reached the server: when fetch threw after sending, or on a 5xx, set `maybeSent = true` and persist it.
- `unqueue()` must refuse `maybeSent` entries, and the caller's compensating write is then queued behind them, as in OB-1.

### OB-7 Replay (major): a queued dose overwrites what another nurse recorded meanwhile
- **Where:** `db.ts:151–169`, where `send()` has no precondition. Also `medicacion.tsx:160–173`, a `merge-duplicates` upsert.
- **Test:** `[OB-7 replay]`. Rosa's `skipped / refused` becomes Carmen's `given`, and `flush()` says `{ sent: 1 }`.

**What happens:**
- Online, `takenBy()` in `medicacion.tsx` refuses to record a dose someone else already recorded. Its own comment says the remaining gap is only "realtime latency".
- Through the outbox that guard is skipped, and the gap lasts the whole offline period.
- If both nurses gave the dose, the record shows one administration and the double dose is hidden.
- Full-row `vital_plans` upserts can overwrite newer edits from another device in the same way.

**Proposed fix:** a conditional write for doses. A `record_dose` RPC that updates only `where status in ('pending','unrecorded')` and otherwise reports a conflict, which `flush()` counts as failed with a message. That is the `ponytail` note's own plan. Plan edits could compare `updated_at`.

### OB-8 23505, reverse direction (minor): an online retry of a write that already landed is reported as failed
- **Where:** `db.ts:129–132` (the online path returns the raw error), and the caller `app/(app)/plan.tsx:97–108`.
- **Test:** `[OB-8 23505]`. The retry returns `duplicate key value violates unique constraint …`.

**What happens:**
1. `addCondition` inserts `patient_conditions` (natural key `patient_id, condition`). The insert commits, but its response is lost, so `mutate()` returns a network error.
2. The vital-plan upsert is skipped, and the sheet stays open.
3. The nurse retries, and gets a 23505 shown as "No se pudo guardar".
4. The condition is now on the server **without** its plan rows. For example, diabetes is added but glucose is not.
5. The picker marks the condition "Ya está en su plan", so there is no way to add the missing rows.

**Proposed fix:** write the condition with `upsert(..., { onConflict: 'patient_id,condition', ignoreDuplicates: true })`, and/or treat a 23505 on the statement's own key as success in `mutate()`'s online path.

### OB-9 Sent overlay (major): an offline "Dada" flips back to pending when the post-send refetch fails
- **Where:** `db.ts:200–206`, where `sent` is cleared once `invalidate()` settles, whatever the outcome. Also `features/care/useLiveList.ts:89–92`, where a failed fetch quietly keeps the old rows.
- **Test:** `[OB-9 sent overlay]`. The server has `given`, but the list shows `pending`.

**What happens:**
- A short reconnect lets `flush()` send the upsert, then the connection drops before the refetch answers.
- `invalidate()` still settles, so `sent` is cleared. The list falls back to the old server rows and shows the dose as pending or "sin registrar" for the rest of the offline period.
- That breaks the module's own promise that "an offline 'Dada' never flips back to pending" (`db.ts:200–201`).
- Another nurse on the same device may give the dose again. Messages vanish (and are resent with a new id), and handoffs can be handed over twice.

**Proposed fix:** have list refetches report success: `fetchRows` resolves to a boolean, or throws on error. Drop an entry from `sent` only when every table it touched refetched successfully.

### OB-10 Entry ids (minor): two writes queued in the same millisecond can share an id, and one is lost
- **Where:** `db.ts:121` (`Date.now() + Math.random()`), with `:192` and `:145`, both of which filter by id.
- **Test:** `[OB-10 entry ids]`. With forced same-millisecond ids, only 1 of 2 writes is sent and the plan row is never stored.

**What happens:**
- Near 1.76e12 a double keeps only 2⁻¹² of the fraction, so a same-millisecond pair collides about once in 4,096.
- `plan.tsx` queues a condition insert and its plan upsert back to back, and the verifier saw 132 of 200 such pairs fall in the same millisecond.
- After sending the first entry, `flush()` removes both. The reconnect toast says "Se envió 1 registro" although the banner showed 2 pending. A diabetic patient's glucose plan rows would be silently missing.

**Proposed fix:** use an integer counter or a UUID for entry ids, and keep the queued time in a separate field.

### OB-11 Hung send (minor): one queued request that never answers freezes every later online save
- **Where:** `db.ts:129` (`await flushing`) and `:156–163` (fetch with no timeout or abort).
- **Test:** `[OB-11 hung send]`. An online save is still waiting after 200 ms behind a hung send.

**What happens:**
- Android's OkHttp client is built with 0 (infinite) timeouts.
- If the head of the queue never answers, `flushing` never settles, so every online `mutate()` waits. The screens' `busy` flags then keep save buttons disabled until the app restarts.

**Proposed fix:** an `AbortController` timeout on `send()` that counts as `retry`, plus the OB-1 change so new writes queue behind the stalled one.

### OB-12 Online check (minor): a write made during a flush fails instead of being queued
- **Where:** `db.ts:119`, which decides online or offline at call time, and `:129–130`, which sends after waiting.
- **Test:** `[OB-12 online check]`. The save returns `TypeError: Network request failed`, and the outbox is empty.

**What happens:** while a flush runs, `mutate()` sees "online" and waits. The connection drops. When the flush ends, `mutate()` runs the request online anyway and shows the error, where an offline save at that moment would have been kept on the phone.

**Proposed fix:** decide after `await flushing`, using `toRequest(p)` computed up front. This is part of the OB-1 change.

### OB-13 Lost response online (major): a write that may have reached the server is handed back as failed
- **Where:** `db.ts:119` and `:129–132`. Writes are queued only when NetInfo already says offline. Callers retry with new client ids: `signos.tsx:80–85`, `pauta-nueva.tsx:57`, `relevo.tsx:54`, `inicio.tsx:63`, `mensajes.tsx:49`.
- **Test:** `[OB-13 lost response online]`. `mutate()` returns the network error, and nothing is kept.

**What happens:**
- On a weak signal the request commits, but the answer never arrives. postgrest-js never retries a POST.
- The screen shows the error. The nurse taps "Reintentar" (or saves again), and the new client ids create a **second** copy:
  - a duplicate vitals control, with the family alerted twice
  - a duplicate medication schedule, with duplicate dose cards and a double-dose risk
  - a duplicate handoff, doctor call or message
- The outbox exists to make this replay idempotent, but it is skipped for online writes.

**Proposed fix:** when the online request fails with status 0 (fetch threw) and `toRequest(p)` is available, queue it with `maybeSent`. The outbox's idempotent replay, and the OB-2 23505 rule, then settle it. Alternatively, keep the client id per draft in the screens and reuse it on retry.

## Outside `db.ts` (found by the same pass; not tested here)

- **`app/(app)/plan.tsx:112–125`:** the undo always queues compensating deletes by natural key. Those deletes run even when the original insert was rejected or hit a 23505, so they can delete another nurse's condition and plan rows. It's a narrow case: the same condition added concurrently, plus an undo within 7 s. **Minor.**
- **`components/Offline.tsx:35` with `Toast.tsx:24–28`:** the reconnect toast replaces the "Deshacer" toast of a write saved seconds earlier. The record is then on the server with no other UI to remove a handoff or control. **Minor.**
