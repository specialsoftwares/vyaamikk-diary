# Team 3 proposal — `test:grin-interop`

Coordinator-owned: `package.json` / `package-lock.json` / root `tsconfig.json`. Team 3 does not apply those edits here.

Wave 2 CS-01 lives under `tools/grin-interop/**` (Team 3). It opens **SQLITE_HOST** SQLite and an **INJECTED_PORT** G1 adapter (`GoodsEvidenceRegisterAdapter` via injected store, or Team 1 `createInjectedGrinServerPort` when that factory is present). It does **not** claim `NATIVE_DEVICE`.

## Proposed `package.json` script

```json
"test:grin-interop": "npx --yes tsx tools/grin-interop/isolation.contract.test.ts && npx --yes tsx tools/grin-interop/cs01-offline-restart-register.sqliteHost.test.ts && npx --yes tsx tools/grin-interop/f2-register-amend-confirm.sqliteHost.test.ts"
```

F2 joined test: `tools/grin-interop/f2-register-amend-confirm.sqliteHost.test.ts` (SQLITE_HOST + INJECTED). Emulator variant only when `FIRESTORE_EMULATOR_HOST` is set; unset logs `EMULATOR_VARIANT=not_run` and is not counted as pass.

Run today with `npx tsx` on those files. Do not add the script until coordinator owns the lockfile change.

## Proposed root `tsconfig.json` exclude

Add `"tools/grin-interop"` next to `"tools/goods-evidence-emulator"` so root `tsc` does not typecheck the G1 wrap through the interop tests. The suite runs with `tsx`.

## Not proposed

- Editing root `package.json` on this branch
- Claiming `NATIVE_DEVICE` / process-death
- Importing `firebase-admin` into `src/services`
- Enabling `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED`
- Functions export / deploy / EAS / Play / `versionCode`
