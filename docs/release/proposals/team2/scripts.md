# Team 2 proposed scripts and typecheck exclude

Coordinator-owned: `package.json`, root `tsconfig.json`. Team 2 does not merge these without coordinator review.

## Proposed `package.json` scripts

```
"typecheck:goods-evidence-g2": "tsc --noEmit -p tools/goods-evidence-storage/tsconfig.json",
"test:goods-evidence-g2-unit": "npx --yes tsx tools/goods-evidence-storage/domain.unit.test.ts && npx --yes tsx tools/goods-evidence-storage/storageQuota.unit.test.ts && npx --yes tsx tools/goods-evidence-storage/injected.unit.test.ts && npx --yes tsx tools/goods-evidence-storage/pack.injected.test.ts && npx --yes tsx tools/goods-evidence-storage/isolation.contract.test.ts",

"test:goods-evidence-g2-emulator": "firebase emulators:exec --only firestore,storage --project demo-vyaamikk-grin-g2 --config tools/goods-evidence-storage/firebase.json \"npx --yes tsx tools/goods-evidence-storage/storage.emulator.test.ts && npx --yes tsx tools/goods-evidence-storage/storageQuota.emulator.test.ts && npx --yes tsx tools/goods-evidence-storage/rules.emulator.test.ts\""
```

`injected.unit.test.ts` covers `createInjectedGrinEvidencePort` (INJECTED outbox port), W2-03 evidence identity/category replay, ER-2 post-await authorize, stale lifecycle fencing, and retained retrieve when `newCommands=deny`.

`pack.injected.test.ts` is the focused F3 retrieve + link + pack-input assembly test (path A missing evidence; path B Wave-1 originals; wrong-receipt/corrupt stay incomplete).

`rules.emulator.test.ts` uses the **client Storage SDK** against isolated Rules (not Admin SDK) for W2-04: reservation upload, unreserved/wrong-owner/invalid-account/retired-ledger deny, retained reads after uploaded_unverified/verified/linked, newCommands stop vs retained reads, overwrite/delete deny, derivative reservations, client metadata clobber deny.

Ports: Firestore **8091**, Storage **9200**. Do not reuse Team 1 **8090** / G1 **8088** / default **8080**/**9199**.

## Proposed root `tsconfig.json` exclude

Add `"tools/goods-evidence-storage"` next to `"tools/goods-evidence-emulator"` so root `tsc` does not typecheck the emulator harness.

This branch includes that exclude so `npm run typecheck` stays green; coordinator should keep it on combine.

## Additional Team 2 focused tests (run via `npx tsx`; coordinator may add scripts)

```
"test:grin-t2-quota": "npx --yes tsx tools/goods-evidence-emulator/quota.injected.unit.test.ts",
"test:grin-t2-storage-quota": "npx --yes tsx tools/goods-evidence-storage/storageQuota.unit.test.ts && npx --yes tsx tools/goods-evidence-storage/storageQuota.injected.unit.test.ts",
"test:grin-t2-storage-quota-emulator": "firebase emulators:exec --only firestore,storage --project demo-vyaamikk-grin-g2 --config tools/goods-evidence-storage/firebase.json \"npx --yes tsx tools/goods-evidence-storage/storageQuota.emulator.test.ts\"",
"test:grin-t2-cleanup": "npx --yes tsx functions/src/deletion/grinCleanup.unit.test.ts",
"test:grin-t2-lifecycle": "npx --yes tsx src/goodsEvidence/entitlementLifecycle.test.ts",
"test:grin-t2-export": "npx --yes tsx src/services/grin/export/receiptAuditExport.test.ts"
```

Do not edit root `package.json` from this worktree. Existing G1/G2/deletion/products/usageTransition scripts still apply.

## Not proposed

- Enabling `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED`
- Wiring `functions/src/index.ts`
- Editing live `storage.rules`
- `ci:verify` / deploy / EAS / Play / versionCode
