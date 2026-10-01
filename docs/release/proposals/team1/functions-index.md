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

```ts
/** GRIN goods-evidence callables: exported for build, production-disabled (fail-closed). */
export {
  handleGrinRegister,
  handleGrinReconcile,
  handleGrinMutation,
} from "./goodsEvidence/callables";
```

If wrapping as Cloud Functions v2 `onCall`, keep the same gate **inside** the
callable and default-deny. Example:

```ts
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { grinFunctionsEnabled, handleGrinRegister } from "./goodsEvidence/callables";

export const grinRegisterGoodsReceipt = onCall({ region: "asia-south1" }, async (request) => {
  const result = await handleGrinRegister(request.auth?.uid ?? null, request.data);
  if (!result.ok) {
    if (result.code === "unauthenticated") throw new HttpsError("unauthenticated", "denied");
    throw new HttpsError("failed-precondition", "denied");
  }
  return result;
});
```

`grinFunctionsEnabled()` is true only for the string `"true"`. Handlers in this
slice still return `policy_denied` even then because the emulator adapter is not
wired to live Admin Firestore here.

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
