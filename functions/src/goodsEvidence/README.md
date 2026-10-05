# functions/src/goodsEvidence — packaging boundary (undeployed)

Team 1. Generated files come from `packageFunctionsGoodsEvidence.ts`.
Do not hand-duplicate canonical JSON, validation, command rules, or adapters.

Authoritative sources:

- Domain: `src/goodsEvidence`
- Adapters: `tools/goods-evidence-emulator` (G1) and `tools/goods-evidence-storage` (G2)
- Hand-written here: `callables.ts`, `composed.ts`, `productionCompose.ts`

- Not exported from `functions/src/index.ts` in this slice.
- Production entrypoint remains `functions/lib/index.js`.
- `callables.ts` stays fail-closed even when `GRIN_GOODS_EVIDENCE_FUNCTIONS`
  is `"true"` because no adapter is bound there.
- `composed.ts` is the callable factory. It injects adapters; it does not
  import `tools/` (that would lift `rootDir`).
- `productionCompose.ts` binds Admin Firestore/Storage to the packaged G1/G2
  adapters. Isolated Functions-emulator entry re-exports
  `createProductionGrinCallables`. Still not `index.ts`.
- Owner identity is `request.auth.uid`. Client uid, digest, and claimed hash
  are not authority. `grinUploadEvidence` must not succeed without hashing
  stored bytes.
- Isolated Functions-emulator entrypoint: `tools/goods-evidence-emulator/functions-entry/**`.
  Do not deploy it as production.
- No React, Expo, `@/config`, localDb, or client hash helpers.
- Do not change account-deletion jobs. GRIN retention after `pending_deletion`
  remains an unresolved policy dependency.
