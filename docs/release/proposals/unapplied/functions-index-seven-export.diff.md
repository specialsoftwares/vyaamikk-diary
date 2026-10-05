# Applied (lazy) — seven GRIN exports from `functions/src/index.ts`

Status: **applied via lazy `productionExports.ts`**, not the eager diff below.
Owner authorized source wiring on 2026-10-05. Do **not** apply the eager
`createProductionGrinCallables()` at index module load — that would resolve
Admin project/bucket during identity/billing discovery.

Exact production names are re-exported from
`functions/src/goodsEvidence/productionExports.ts`. Composition loads
`./productionCompose` only on the first GRIN invocation. A
`GrinAdminConfigError` returns `{ ok: false, code: "policy_denied", detail: "denied" }`
and does not guess a project or bucket.

Do not export the fail-closed `handleGrin*` stubs as a working backend.
Do not export `grinBeginEvidence`.

Production JS entry remains `functions/lib/index.js`. Do not change
`functions/package.json` `"main"` or add `rootDir` to `functions/tsconfig.json`.

The eager diff below is retained as the rejected cold-start shape.

## Exact diff (unapplied)

```diff
--- a/functions/src/index.ts
+++ b/functions/src/index.ts
@@ -77,3 +77,36 @@ export { prepareIOSBillingAccount } from "./billing/callables/prepareIOSBillingA
 export { validateAndActivateIOS } from "./billing/callables/validateAndActivateIOS";
 export { appStoreServerNotificationsV2 } from "./billing/callables/appStoreServerNotificationsV2";
 
+import { onCall, type CallableRequest } from "firebase-functions/v2/https";
+import { createProductionGrinCallables } from "./goodsEvidence/productionCompose";
+
+const grin = createProductionGrinCallables();
+
+function wrapGrin(
+  run: (request: { auth: { uid: string } | null; data: unknown }) => Promise<unknown>
+) {
+  return onCall({ region: "asia-south1" }, async (request: CallableRequest) => {
+    const auth = request.auth?.uid ? { uid: request.auth.uid } : null;
+    return run({ auth, data: request.data });
+  });
+}
+
+export const grinRegisterGoodsReceipt = wrapGrin((request) => grin.register(request));
+export const grinReconcileCommand = wrapGrin((request) => grin.reconcile(request));
+export const grinMutateGoodsReceipt = wrapGrin((request) => grin.mutate(request));
+export const grinReadGoodsReceipt = wrapGrin((request) => grin.readReceipt(request));
+export const grinReserveEvidence = wrapGrin((request) => grin.reserveEvidence(request));
+export const grinBeginEvidenceUpload = wrapGrin((request) => grin.beginEvidenceUpload(request));
+export const grinUploadEvidence = wrapGrin((request) => grin.uploadEvidence(request));
```

Names are the contract. Do not export `grinBeginEvidence`.

After apply, set `GRIN_GOODS_EVIDENCE_FUNCTIONS=true` only on those seven
function instances (separate approval). Any other value, including `"1"` and
`"TRUE"`, remains deny. First live deploy of the export should leave the env
unset so the callables exist and fail closed.

Do not deploy `tools/goods-evidence-emulator/functions-entry`.
