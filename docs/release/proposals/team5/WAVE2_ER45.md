# Wave 2 ER-4 / ER-5 (Team 5)

AI QA role. **Wave 2 is not accepted.** G6 / device / billing / public release stay not Done. Forbidden matrix statuses remain unused: `complete` / `accepted` / `pass` / `done` / `approved`.

`runIds.ts` is ID-presence only. It is **not** CS workflow evidence. `tools/grin-acceptance/scenarios/cs01-*.test.ts` remains a stub, not a CS-01 pass.

Combined ancestry for this work: merge of `origin/integration/grin-g1-g5-source` at `3229b67e29ed25a58f73fe20bd7735c4e499f11a` (includes Team 3 CS-01 merge `9982f76`).

## ER-4 — v9→v10 startup with GRIN off

File: `tools/grin-acceptance/startup/v9-v10-grin-off.sqliteHost.test.ts`

- `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` unset / not `"1"`
- `isGoodsEvidenceEnabled()` false
- v9 HostSqlite (`schema_version` 9, diary `entries_local` row, no `grin_*` tables) migrated with the same sequence as `src/localDb/init.ts` (`migrateToV10` + repair missing `grin_local_receipts` + `schema_version` 10)
- GRIN tables present; diary row preserved; flag still off
- Label **SQLITE_HOST**. Prints `NATIVE_DEVICE=not_claimed`
- Does **not** edit `migrateGrin.ts` / `outbox.ts`. Not a duplicate of Team 3 `migrateGrin.v9Startup.sqliteHost.test.ts` (that file is T3-owned). Not a duplicate CS-01.

## ER-5 — CS-01…CS-11

| ID | Executed? | Labels | Still open |
|---|---|---|---|
| CS-01 | **Yes** (Team 3 `npm run test:grin-interop`; not duplicated) | SQLITE_HOST+INJECTED_PORT (`INJECTED_SOURCE=team1:serverPort.ts`) | NATIVE_DEVICE process-death (DEV-01); FIRESTORE_EMULATOR lost-network reconnect |
| CS-02 | **Yes** (G2 orphan after lost blob) | INJECTED_PORT | STORAGE_EMULATOR; G1 `linkVerifiedEvidence`; no second verified object on emulator bytes |
| CS-03 | **Yes** (outbox owner isolation) | SQLITE_HOST | Storage/export/UI; NATIVE_DEVICE account-switch (DEV-03) |
| CS-04 | **Yes** (distinct serials + identical-command replay on injected store) | INJECTED_PORT | FIRESTORE_EMULATOR concurrent barriers unless `FIRESTORE_EMULATOR_HOST` is set for `cs04-concurrent-serials.emulator.test.ts` |
| CS-05 | **Yes** (`version_conflict` + digest replay) | INJECTED_PORT | NATIVE_DEVICE / production callable |
| CS-06 | **Yes** (return qty + original snapshot unchanged) | INJECTED_PORT | NATIVE_DEVICE |
| CS-07 | **Yes** (pack incomplete without original; derivative reserve denied pre-original) | PURE_DOMAIN+INJECTED_PORT | STORAGE_EMULATOR generation/tamper; full pack export |
| CS-08 | **Yes** (domain cancellation; unknown `goodsMoved` retained) | PURE_DOMAIN | Live GST/EWB portal (never invented) |
| CS-09 | **Yes** (unknown_incomplete / ITC `not_determined`) | PURE_DOMAIN | Live 2B/GST portal (never invented) |
| CS-10 | **Yes** (register + replay/reconcile same issued number) | INJECTED_PORT | FIRESTORE_EMULATOR lost-response; outbox ambiguous-network reconcile; Functions stay unexported |
| CS-11 | **Yes** (goodsEvidence isolation contract only) | PURE_DOMAIN | REG-* product suites; MOUNTED_REACT_INERT_NATIVE; Play |

## Holds

No main merge, deploy, EAS, Play, billing, flags, `versionCode`, Functions export, or production admission.
