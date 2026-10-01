# Team 3 — F2 confirmed projection (additive v10, no DB_VERSION bump)

Label: **SQLITE_HOST** + **INJECTED**. Not NATIVE_DEVICE. `DB_VERSION` stays **10**.

## Schema

Additive columns on `grin_local_receipts` (CREATE for new files; `ALTER TABLE ... ADD COLUMN` via `tableHasColumn` for existing v10 files):

- `confirmed_event_version`
- `confirmed_head_hash`
- `confirmed_original_json`
- `confirmed_events_json`
- `confirmed_effective_json`

`grinV10TablesPresent` is incomplete until those columns exist so `applyPendingLocalMigrations` re-runs `migrateToV10`. Coordinator does **not** bump `DB_VERSION`.

Confirmed projection is distinct from pending `grin_outbox_commands`. Queued EWB/return rows are not confirmed history (`listCommandsForReceipt` vs `getConfirmedProjection`).

## Outbox API

- `persistConfirmedProjection(session, confirmed)` — validates `eventVersion` is a positive integer and that hashes/original/events/effective JSON-parse. Bound to the session owner. Throws `invalid_confirmed_projection` / `session_retired`.
- `getConfirmedProjection(ownerUid, ledgerId, receiptId)` — `GrinConfirmedProjection | null`. Null means T4 must not submit (`GRIN_NO_CONFIRMED_VERSION`).
- After successful register/mutate/reconcile, if `server.readReceipt` exists, outbox calls it, validates, and writes confirmation in the **same fenced sqlite transaction** as issued/attempt completion. If `readReceipt` is absent, confirmation stays null (do not invent).
- Replay / lost-response: same `eventVersion` does not overwrite a stored projection (no double-apply of a different body). A strictly greater `eventVersion` advances.
- Sequential mutations: do not dispatch mutation N+1 while N is `queued` / `dispatching` / `failed_retryable` (`skipped: predecessor_inflight`). `version_conflict` stays `conflicted`; frozen digest/commandId are not rebased.
- `persistMutationAndQueue` still does not rewrite the register `payload_json`.

## Joined test

`tools/grin-interop/f2-register-amend-confirm.sqliteHost.test.ts`

Team 4 `GrinApplicationRepository.createQueued` + Team 1 INJECTED adapter (`tools/goods-evidence-emulator`, allowed in this host test only) + Team 3 outbox.

Repo.amend in this test rewrites T4's hardcoded `expectedVersion: 0` to `confirmed.eventVersion` in the host file. Production T4 must call `getConfirmedProjection` itself. Do not treat that shim as a T4 fix.

## Proposed `package.json` (coordinator-owned)

```json
"test:grin-interop": "npx --yes tsx tools/grin-interop/isolation.contract.test.ts && npx --yes tsx tools/grin-interop/cs01-offline-restart-register.sqliteHost.test.ts && npx --yes tsx tools/grin-interop/f2-register-amend-confirm.sqliteHost.test.ts"
```

 Firestore emulator variant runs only when `FIRESTORE_EMULATOR_HOST` is set. Unset is `EMULATOR_VARIANT=not_run`, not a skip-as-pass. SQLITE_HOST+INJECTED is the required pass.

## Unresolved (do not invent)

- GRIN pricing / ordinary-record quota
- Retention/deletion of GRIN after account deletion
