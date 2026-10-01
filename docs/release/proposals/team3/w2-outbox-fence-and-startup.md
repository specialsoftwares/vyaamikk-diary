# Team 3 proposal — W2 outbox fence, category persist, production startup tests

Coordinator-owned: `package.json` / `package-lock.json`. Team 3 does not apply those edits here. Do not edit `src/localDb/init.ts` or `src/localDb/applyPendingMigrations.ts`.

Label: **SQLITE_HOST**. Not NATIVE_DEVICE.

## Scripts (already on combined; keep and extend)

`test:grin-outbox` already runs isolation + `outbox.sqliteHost.test.ts` + `migrateGrin.v9Startup.sqliteHost.test.ts`. W2-02/W2-01/W2-03 cases live in `outbox.sqliteHost.test.ts` so the existing script covers them.

Keep:

```json
"test:grin-outbox": "npx --yes tsx src/services/grin/outbox/outbox.isolation.contract.test.ts && npx --yes tsx src/services/grin/outbox/outbox.sqliteHost.test.ts && npx --yes tsx src/localDb/migrateGrin.v9Startup.sqliteHost.test.ts",
"test:grin-interop": "npx --yes tsx tools/grin-interop/isolation.contract.test.ts && npx --yes tsx tools/grin-interop/cs01-offline-restart-register.sqliteHost.test.ts"
```

## W2-05

`src/localDb/migrateGrin.v9Startup.sqliteHost.test.ts` now calls `initializeLocalDatabase()` after `setLocalDatabaseForTests` / `resetLocalDatabaseInitStateForStartup`, or `applyPendingLocalMigrations(db)` — the production orchestrator, not a copied `applyInitV10Sequence`.

Team 5 `tools/grin-acceptance/startup/v9-v10-grin-off.sqliteHost.test.ts` still copies the old v10 slice. Team 3 did not edit that T5 file. T5 should switch to the same orchestrator.

## Additive v10 columns (no DB_VERSION bump)

`migrateToV10` ALTERs `grin_local_evidence_files.category` and `grin_outbox_commands.lease_attempt_id` when missing. `grinV10TablesPresent` treats a missing category column (and missing required indexes / lease_attempt_id) as incomplete so coordinator re-runs `migrateToV10`.

## Not proposed

- Editing `src/localDb/init.ts` / `applyPendingMigrations.ts`
- Editing Team 2 `tools/goods-evidence-storage/evidencePort.ts` (T2 must stop defaulting missing original category to invoice and must return structured identity)
- Claiming `NATIVE_DEVICE`
- Enabling `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED`
- Deploy / EAS / Play / billing / `versionCode` / main merge
