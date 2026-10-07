# Team 1 proposal: package.json scripts

Coordinator-owned. Team 1 did not edit `package.json` / `package-lock.json`.

New files are runnable with `npx tsx` today. Please add them to the existing
G1 command lists (do not replace or drop current files).

Wave 2 W2-06 one-liners:

- `npx --yes tsx tools/goods-evidence-emulator/composed.injected.unit.test.ts`
- `npx --yes tsx src/services/grin/transport/firebaseTransport.unit.test.ts`
- `npx --yes tsx src/services/grin/transport/isolation.contract.test.ts`

## `test:goods-evidence-g1-unit`

Append:

- `npx --yes tsx tools/goods-evidence-emulator/composed.injected.unit.test.ts`
- `npx --yes tsx src/services/grin/transport/firebaseTransport.unit.test.ts`
- `npx --yes tsx src/services/grin/transport/isolation.contract.test.ts`

Keep the existing mutations / packaging / serverPort unit files.

## `test:goods-evidence-g1-emulator`

Inside the existing `firebase emulators:exec` string, append:

- `npx --yes tsx tools/goods-evidence-emulator/composed.emulator.test.ts`

Keep the G1 Firestore emulator config on port **8088** for these tests.
A later unified config may use Team 1 port **8090**; do not fight 8088 while
existing G1 tests use it.

## Optional packaging script

```json
"package:goods-evidence-functions": "npx --yes tsx tools/goods-evidence-emulator/packageFunctionsGoodsEvidence.ts"
```

Regenerates `functions/src/goodsEvidence/**` domain copies from `src/goodsEvidence`.
Keeps `callables.ts`, `composed.ts`, and `README.md`. Does not deploy. Does not
edit `functions/src/index.ts` or `functions/tsconfig.json`.
