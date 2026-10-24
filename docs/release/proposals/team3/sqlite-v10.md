# Team 3 proposal — SQLite v10 GRIN outbox

Coordinator owns `src/localDb/init.ts` and `src/localDb/schema.ts`. Team 3 owns `src/localDb/migrateGrin.ts` and `src/services/grin/outbox/**`.

Do not merge to main. Do not bump `versionCode`. GRIN stays default-off. Diary save behaviour is unchanged: v10 only **adds** GRIN tables.

## Wire-up (one call)

`src/localDb/migrateGrin.ts` exports `migrateToV10`. Coordinator applies:

### `src/localDb/schema.ts`

```ts
export const DB_VERSION = 10;
```

Append a comment that v10 is GRIN outbox tables only (no diary column changes).

### `src/localDb/init.ts`

```ts
import { migrateToV10 } from "./migrateGrin";
```

After the existing `if (version < 9) { migrateToV9(...); version = 9; }` block:

```ts
if (version < 10) {
  migrateToV10(database);
  version = 10;
}
```

Repair path with the other version repairs:

```ts
if (version >= 10 && !tableExists(database, "grin_local_receipts")) {
  migrateToV10(database);
}
```

`migrateToV10` does **not** write `meta.schema_version`. Init continues to persist `DB_VERSION` after migrations.

### `src/localDb/testHarness.ts` (optional later)

Node diary tests use MemorySqlite and today stop at v9. Do not add `migrateToV10` there until MemorySqlite callers are ready. v10 DDL uses single-column primary keys so MemorySqlite `CREATE TABLE` parsing remains viable.

## Tables

| Table | Role |
|---|---|
| `grin_local_receipts` | Owner-scoped local receipt + `OutboxLocalState`. `issued_number` and `server_registered_at_utc` stay NULL until a server result. |
| `grin_outbox_commands` | Frozen `commandId` + digest + payload, lease/generation, attempts. |
| `grin_owner_runtime` | `dispatch_generation`, session active flag, retirement hold. |
| `grin_local_evidence_files` | Local originals / thumbnails / metadata. `original_durable` is independent of derivative uploads. |

Unique indexes: `(owner_uid, ledger_id, receipt_id)`, `(owner_uid, ledger_id, command_id)`, evidence `(owner_uid, ledger_id, evidence_id, role)`.

## Durable original upload (do not weaken)

A local **original** may set `retain_local = 0` only when `role = original` **and** `original_durable = 1` (server verified original bytes at a storage generation). Thumbnail or metadata upload success must not delete or un-retain the original.

Constant: `DURABLE_ORIGINAL_UPLOAD_CONDITION` in `src/services/grin/outbox/types.ts`.

## Account retirement

Unresolved programme policy: do not change deletion jobs / `retireIdentity`. Local Wave 1:

- `applyAccountRetirementHold(uid)` sets `retirement_hold` and **deletes nothing**.
- `purgeOwnerLocalGrin(uid)` refuses with `unsync_evidence_retained` when any unsynchronised receipt or undurable original remains.

## Ports (FAKE / INJECTED)

`GrinServerCommandPort` / `GrinEvidenceUploadPort` are labelled `FAKE` or `INJECTED`. The app outbox must not import `firebase-admin` or `tools/goods-evidence-emulator`.

Ambiguous network: persist `dispatching`, then `reconcile({ ledgerId, commandId })` before minting a new command.

## SQLITE_HOST vs NATIVE_DEVICE

Host tests open a **file-backed real SQLite** via Python `sqlite3` (`SQLITE_HOST`). That is not `NATIVE_DEVICE` process-death proof. Device expo-sqlite wiring is coordinator + app boot after this proposal.

## Proposed `package.json` scripts (coordinator-owned; do not apply here)

```json
"test:grin-outbox": "npx --yes tsx src/services/grin/outbox/outbox.isolation.contract.test.ts && npx --yes tsx src/services/grin/outbox/outbox.sqliteHost.test.ts"
```

Run today with `npx tsx` on those files. Do not add the script until coordinator owns the lockfile change.

## Ordinary diary

v10 does not alter `entries_local`, `sync_queue`, or form drafts. v9 → v10 tests keep existing diary rows.
