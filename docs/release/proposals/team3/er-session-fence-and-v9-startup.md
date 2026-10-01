# Team 3 proposal — ER-1 tests and ER-4 v9 startup script

Coordinator-owned: `package.json` / `package-lock.json`. Team 3 does not apply those edits here. Do not edit `src/localDb/init.ts`.

## ER-1

Same-owner `endOwnerSession` and lease steal during in-flight register/mutate are covered in `src/services/grin/outbox/outbox.sqliteHost.test.ts` (already invoked by `test:grin-outbox`). **SQLITE_HOST**. Not NATIVE_DEVICE.

## ER-4 (Team 3 half)

New file `src/localDb/migrateGrin.v9Startup.sqliteHost.test.ts` walks a v9 HostSqlite file through the **same v10 steps** init.ts uses (`version < 10` migrate, `version >= 10 && !grin_local_receipts` repair, write `schema_version` 10). GRIN flag unset / not `"1"`; tables still created. Does not enable the flag.

## Proposed `package.json` addition

Keep `test:grin-outbox` and append:

```json
"test:grin-outbox": "npx --yes tsx src/services/grin/outbox/outbox.isolation.contract.test.ts && npx --yes tsx src/services/grin/outbox/outbox.sqliteHost.test.ts && npx --yes tsx src/localDb/migrateGrin.v9Startup.sqliteHost.test.ts"
```

See also `docs/release/proposals/team3/test-grin-interop.md` for `test:grin-interop`.

## Not proposed

- Editing `src/localDb/init.ts`
- Claiming `NATIVE_DEVICE`
- Enabling `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED`
- Deploy / EAS / Play / billing / `versionCode`
