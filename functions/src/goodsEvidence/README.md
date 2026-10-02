# functions/src/goodsEvidence — packaging boundary (undeployed)

Team 1. Generated domain files come from `src/goodsEvidence` via
`tools/goods-evidence-emulator/packageFunctionsGoodsEvidence.ts`.
Do not hand-duplicate canonical JSON, validation, or command rules.

- Not exported from `functions/src/index.ts` in this slice.
- Production entrypoint remains `functions/lib/index.js`.
- `callables.ts` stays fail-closed even when `GRIN_GOODS_EVIDENCE_FUNCTIONS`
  is `"true"` because no adapter is bound there.
- `composed.ts` is tests/emulator composition: when the env is exactly
  `"true"` **and** `GoodsEvidenceRegisterAdapter` is injected, register /
  reconcile / mutate / readReceipt run. Evidence reserve / beginUpload /
  uploadEvidence inject the G2 adapter surface. Owner identity is
  `request.auth.uid` / `AuthData.uid`. Client uid, digest, and claimed hash
  are not authority. `grinUploadEvidence` must not succeed without hashing
  stored bytes. Any other env value, or an unbound adapter, is deny.
- Isolated Functions-emulator entrypoint: `tools/goods-evidence-emulator/functions-entry/**`.
  It is not this package's `index.ts` and must not be deployed from production.
- No React, Expo, `@/config`, localDb, or client hash helpers. Hashing uses Node `crypto`.
- Do not change `ensureAccountDeletionJob` / `retireIdentity` / `completeAccountDeletion`
  / `scheduledDeletionCleanup`. GRIN records are owner-scoped under `users/{uid}/…`.
  Retention of GRIN documents and Storage objects after `pending_deletion` is an
  **unresolved policy dependency**.
