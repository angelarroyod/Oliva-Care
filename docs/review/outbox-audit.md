# Offline outbox audit: `src/lib/db.ts`

This audit of the offline outbox covers `mutate`, `flush`, `send`, `unqueue`, `lastQueued`/`saved` and `pendingWrites`, and every call site of those functions. It was done at commit `cadbcbb`.

Each bug has a failing test in `__tests__/outbox-audit.test.ts`, tagged with its id (`[OB-n …]`). The tests drive the real module with real supabase-js builders against a small in-memory PostgREST in the same file. The fake server models unique keys, upsert with `merge-duplicates`, `eq` filters, and requests that can be held, dropped, or committed with their response lost. Each test asserts what the server ends up holding, not the shape of the requests.

Three control tests in the same file pass. They show that the fake server behaves like PostgREST and that the parts of the outbox they cover work:
- A lost response followed by a resend is counted as sent and stored once.
- Queued writes keep their order across a dropped connection.
- An undo made while the write is still queued keeps it off the server.

**No source file was changed.** The fixes below are proposals only.

| Category | Result |
|---|---|
| 1. Non-idempotent replays | **No independent bug.** Every queued write is idempotent by itself: inserts carry a client id (`messages`, `shift_handoffs`, `care_events`, `medication_schedules`, `vital_readings`) or a natural unique key (`patient_conditions` PK, `invites.code`). Updates and the `set_my_shift` RPC set absolute values, and doses upsert on `(schedule_id, scheduled_for)`. A write can be applied twice with a different effect only through the ordering bugs OB-1 and OB-3. Related: OB-5 sends a write under another account's identity. |
| 2. Ordering | **OB-1** |
| 3. 23505 handling | **OB-2**, where a 23505 is wrongly read as success. The reverse case (a 23505 that means the write already succeeded, shown as a failure) **cannot be reached today**, because the online path never resends the same client id. |
| 4. Undo-before-send races | **OB-3**, **OB-4** |
| Other | **OB-5** (replay under a different account) |

## OB-1 Ordering: online writes overtake queued ones after a flush stops

- **Where:** `src/lib/db.ts:129`, together with `:180–185` and `src/components/Offline.tsx:29–36`.
- **Test:** `[OB-1 ordering] an online edit made after a flush stopped on a server error is not overwritten by the older queued edit`. It fails with `[[60,100]]` stored where `[[50,90]]` was expected.

**Bug:**
- `mutate()` only waits for a flush that is already running (`await flushing`).
- `flush()` stops at the first `'retry'`: a 5xx, a 401, a network drop, or no session. It then leaves the rest of the queue in place, and nothing flushes again while NetInfo stays "online", because `OfflineSync` only reacts to NetInfo changes.
- From then on every online write goes straight to the server ahead of the older queued ones. When the queue finally goes out, those stale writes land last.
- The test shows this with a stale `vital_plans` range overwriting a newer edit. The same mechanism lets:
  - a dose recorded online on a schedule that is still queued fail with 23503;
  - an online undo be undone by its queued record (see OB-3).
- The same overtaking happens at a cold start with a stored queue, before NetInfo's first event triggers a flush.

**Proposed fix:**
- Keep one queue. In `mutate()`, after `await ready()`, if `outbox.length > 0` queue the new write too (when `toRequest(p)` succeeds) and call `void flush()`, instead of sending it directly.
- Retry a stopped flush with a short backoff, and also when the app returns to the foreground.

## OB-2 23505: any unique violation counts as "already sent"

- **Where:** `src/lib/db.ts:167–168`.
- **Test:** `[OB-2 23505] a queued invite whose code already belongs to another invite is not counted as sent`. `flush()` reports `{ sent: 1 }` although the server has no invite for the patient.

**Bug:**
- `send()` treats every 23505 as a resend whose first response was lost. That is only true when the conflict is on the write's own client key.
- `invites` inserts have no client id (`nurse/(tabs)/perfil.tsx:91–94`) and `code` is unique. So an offline-created code that collides with an existing invite is dropped from the queue as "sent".
- Meanwhile the nurse keeps showing the family a code that belongs to someone else's invite, and the toast says it was sent.
- Likelihood is low: 31⁶ codes. The impact is a family member joining the wrong patient while that other invite is still open.
- Every other queued insert either has a client id or is benign on a natural-key conflict (`patient_conditions`: the condition is already there).

**Proposed fix:**
- Count a 23505 as sent only when the violated constraint is the table's primary key, using `details`/`message`, which names `<table>_pkey`. Give `invites` a client `id`. Treat other 23505s as `failed`, so they are reported.
- Alternatively, don't create invite codes while offline: a code that doesn't exist on the server yet can't be redeemed anyway.

## OB-3 Undo race: undo while the record is in flight, then the send fails

- **Where:** `src/lib/db.ts:143–149` together with `:129` and `:180–185`. Callers: `nurse/(tabs)/relevo.tsx:67–70`, `nurse/(tabs)/signos.tsx:102–104`, `nurse/medicacion.tsx:177–178`.
- **Test:** `[OB-3 undo race] undo tapped while the record is being sent, whose response is then lost, still removes it`. The handoff `h1` is back on the server after "Deshacer" reported success.

**Bug:**
1. While `flush()` is sending the record, `unqueue(id)` returns `false` (`id === inFlight`), so the caller runs the compensating write through `mutate()`.
2. That waits for the running flush. If the send ends in `'retry'` (dropped connection, lost response, 5xx or 401), the flush stops with the record **still queued**.
3. The compensating `DELETE`/`UPDATE` then goes to the server first, as a no-op or by removing the committed row.
4. The next flush sends the record again.

The server ends up holding the handoff, the "Dada" or the vitals control that the nurse undid. When the first send had committed and lost its response, the record is applied twice and the second application reverses the undo. This is the "applied twice with a different effect" case from category 1.

**Proposed fix:** order the compensating write after the record.
- The OB-1 fix does this on its own: with the record still queued, `mutate()` queues the compensation behind it.
- Alternatively, `unqueue()` can wait for the in-flight send and retry the removal when the send ended in `'retry'`. The compensating write is still needed if the response was lost, so the OB-1 approach is the safer one.

## OB-4 Undo race: `lastQueued()` is a module global

- **Where:** `src/lib/db.ts:47`, `:118–122` and `:137–139`. Callers read it after `await mutate(...)` in `nurse/medicacion.tsx:177`, `nurse/(tabs)/signos.tsx:98`, `nurse/(tabs)/relevo.tsx:66` and `family/(tabs)/mensajes.tsx:53`, and through `saved()`.
- **Test:** `[OB-4 undo race] the undo of a write that went to the server does not take a different queued write out of the outbox`. `unqueue()` removes the other write and the outbox goes from 1 to 0.

**Bug:**
- `lastId` is reset by every `mutate()` and set by the last one that queued.
- Suppose a "Dada" sent online hangs on a weak signal, the connection drops, and the nurse saves a vitals control on Signos, which is queued. The toast is global, and `busy` only blocks the Medicación buttons.
- When the slow "Dada" returns, its caller reads the control's id. Its toast then says "Guardado en el teléfono…" although it was sent.
- Its "Deshacer" unqueues the **vitals control**, which is silently lost, and never compensates the dose, which stays "Dada" on the server.

**Proposed fix:**
- Return the queued id from the call itself, for example `mutate()` resolving to `{ error, queued }` or accepting an `onQueued(id)` callback.
- Drop the module-global `lastId`, `lastQueued()` and the global-reading `saved()`.

## OB-5 Replay identity: writes queued by one account are sent with the next account's session

- **Where:** `src/lib/db.ts:43`, `:151–154` and `:57`. No sign-out path clears or scopes the queue.
- **Test:** `[OB-5 replay identity] writes queued by one account are not sent with the next account's session`. A `POST /messages` goes out with `Bearer tok-rosa`.

**Bug:**
- The outbox is one global SecureStore key. `send()` attaches whatever session exists at flush time, and a missing session keeps the entries "for later".
- If Carmen's session ends with writes still queued and Rosa signs in on the same phone, Carmen's writes go out as Rosa.
- Under RLS this goes one of two ways:
  - they are rejected (403), dropped as "failed", and Rosa is told N records could not be sent;
  - they are accepted, carrying `recorded_by`/`sender_id` values of Carmen's under Rosa's request. A message with `sender_id = carmen` fails `messages_send`, while a dose upsert with `recorded_by = carmen` succeeds.

**Proposed fix:**
- Store the queuing user's id on each entry, or key the outbox per user (`tend.outbox.<uid>`), and only send entries that match the current session.
- Warn before signing out with pending writes.

## Not counted as bugs: related notes

- A write that fails with a network error while NetInfo still says "online" (weak signal) is **not** queued (`db.ts:119`). The raw error is shown, and the screens' retry paths create new client ids (`signos.tsx:80`, `mensajes.tsx:49`, `relevo.tsx:54`), so a lost-response retry duplicates the record. This is a design choice in `mutate()` rather than one of the four categories. It is listed in the Task 1 review.
- `persist()` is fire-and-forget (`db.ts:57`). Successive SecureStore writes are issued in order, and nothing here shows them landing out of order.
