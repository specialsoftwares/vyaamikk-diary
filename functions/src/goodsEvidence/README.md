# functions/src/goodsEvidence — packaging boundary (undeployed)

Team 1. Generated domain files come from `src/goodsEvidence` via
`tools/goods-evidence-emulator/packageFunctionsGoodsEvidence.ts`.
Do not hand-duplicate canonical JSON, validation, or command rules.

- Not exported from `functions/src/index.ts` in this slice.
- Production entrypoint remains `functions/lib/index.js`.
- Callables stay fail-closed: they only proceed if `GRIN_GOODS_EVIDENCE_FUNCTIONS`
  is the string `"true"`. Default deny. Even when that env is set, this slice does
  not wire the emulator adapter to live Firestore.
- No React, Expo, `@/config`, localDb, or client hash helpers. Hashing uses Node `crypto`.
- Do not change `ensureAccountDeletionJob` / `retireIdentity` / `completeAccountDeletion`
  / `scheduledDeletionCleanup`. GRIN records are owner-scoped under `users/{uid}/…`.
  Retention of GRIN documents and Storage objects after `pending_deletion` is an
  **unresolved policy dependency**.
