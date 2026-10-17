# Team 1 proposal: additional undeployed callable names (F2 / F4)

Coordinator-owned `functions/src/index.ts`. Do not apply in this Team 1 commit.
GRIN stays undeployed. Live Rules / IAM / secrets are unchanged.

Wave 2 application findings F2 (authorized confirmed retrieve) and F4 (mobile
JS transport) add two callable **names**. They are implemented in undeployed
composition (`functions/src/goodsEvidence/composed.ts` + fail-closed
`callables.ts`) and the mobile-safe JS client (`src/services/grin/transport`).
They are **not** exported from `functions/src/index.ts`.

## Names (do not export yet)

Existing (still HOLD):

- `grinRegisterGoodsReceipt`
- `grinReconcileCommand`
- `grinMutateGoodsReceipt`

New:

- `grinReadGoodsReceipt` — authorized confirmed retrieve
  (`{ ledgerId, receiptId }` → `GrinReceiptReadResult`). Identity from
  `request.auth.uid` only. Foreign callers `forbidden`. Missing authorized
  receipt `not_found`.
- `grinUploadEvidence` — mobile JS evidence callable **client** only.
  Team 2 owns Storage. The JS client is fail-closed when this name is
  unexported (`originalDurable: false`, identity fields null). Do not treat
  this proposal as a Storage adapter.

Suggested wrapping remains `createComposedGrinCallables` with an injected
adapter. Env gate is still exactly:

```ts
process.env.GRIN_GOODS_EVIDENCE_FUNCTIONS === "true"
```

Any other value, or an unbound adapter, is deny.

Do not enable `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED`. Do not edit live
`firestore.rules` / `storage.rules`. Purchase-entry flags stay `"0"`.
