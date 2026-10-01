# Team 2 proposed scripts and typecheck exclude

Coordinator-owned: `package.json`, root `tsconfig.json`. Team 2 does not merge these without coordinator review.

## Proposed `package.json` scripts

```
"typecheck:goods-evidence-g2": "tsc --noEmit -p tools/goods-evidence-storage/tsconfig.json",
"test:goods-evidence-g2-unit": "npx --yes tsx tools/goods-evidence-storage/domain.unit.test.ts && npx --yes tsx tools/goods-evidence-storage/injected.unit.test.ts && npx --yes tsx tools/goods-evidence-storage/isolation.contract.test.ts",
"test:goods-evidence-g2-emulator": "firebase emulators:exec --only firestore,storage --project demo-vyaamikk-grin-g2 --config tools/goods-evidence-storage/firebase.json \"npx --yes tsx tools/goods-evidence-storage/storage.emulator.test.ts && npx --yes tsx tools/goods-evidence-storage/rules.emulator.test.ts\""
```

Ports: Firestore **8091**, Storage **9200**. Do not reuse Team 1 **8090** / G1 **8088** / default **8080**/**9199**.

## Proposed root `tsconfig.json` exclude

Add `"tools/goods-evidence-storage"` next to `"tools/goods-evidence-emulator"` so root `tsc` does not typecheck the emulator harness.

This branch includes that exclude so `npm run typecheck` stays green; coordinator should keep it on combine.

## Not proposed

- Enabling `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED`
- Wiring `functions/src/index.ts`
- Editing live `storage.rules`
- `ci:verify` / deploy / EAS / Play / versionCode
