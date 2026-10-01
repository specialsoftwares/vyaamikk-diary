# Team 1 proposal: `functions/src/index.ts` fail-closed GRIN exports

Coordinator-owned. Do not apply in this Team 1 commit. GRIN stays undeployed.

Production entrypoint must remain `functions/lib/index.js`. Do not lift `rootDir`
in `functions/tsconfig.json`. Team 1 generated `functions/src/goodsEvidence/**`
from `src/goodsEvidence`; compiling those files must not move `lib/index.js`.

## Env gate

Callables must remain uninvoked until this export lands, and fail-closed after:

```ts
process.env.GRIN_GOODS_EVIDENCE_FUNCTIONS === "true"
```

Any other value, including `"1"`, `"TRUE"`, missing, or empty, is deny.

## Suggested export (do not add until coordinator review)

Prefer wrapping `createComposedGrinCallables` with an injected adapter — not
the fail-closed `handleGrin*` stubs, and not a live Admin Firestore wiring in
this programme. Suggested names (do not export yet):

- `grinRegisterGoodsReceipt`
- `grinReconcileCommand`
- `grinMutateGoodsReceipt`

If wrapping as Cloud Functions v2 `onCall`, take identity from `request.auth.uid`
only. Example:

```ts
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createComposedGrinCallables } from "./goodsEvidence/composed";

const composed = createComposedGrinCallables({ adapter /* injected in tests/emulator only */ });

export const grinRegisterGoodsReceipt = onCall({ region: "asia-south1" }, async (request) => {
  const result = await composed.register({ auth: request.auth ?? null, data: request.data });
  if (!result.ok) {
    if (result.code === "unauthenticated") throw new HttpsError("unauthenticated", "denied");
    throw new HttpsError("failed-precondition", "denied");
  }
  return result;
});
```

`grinFunctionsEnabled()` is true only for the string `"true"`. `callables.ts`
handlers still return `policy_denied` even then because they do not bind an
adapter. Tests/emulator inject `GoodsEvidenceRegisterAdapter` through
`composed.ts`. Do not import `tools/goods-evidence-emulator` from this
entrypoint (tsc `rootDir` would move `lib/index.js`).

Do not enable `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED`. Do not remove the store-runtime block.

## Auth / deletion (do not change existing jobs)

Existing identity and deletion exports stay as they are:

- `ensureAccountDeletionJob`
- `retireIdentity`
- `completeAccountDeletion`
- `scheduledDeletionCleanup`

GRIN documents are owner-scoped under `users/{uid}/…`. This programme does not
alter deletion jobs. Retention of GRIN records and Storage objects after
`pending_deletion` / `retireIdentity` is an **unresolved policy dependency**.
There is no pending-deletion replay exception on GRIN commands.
