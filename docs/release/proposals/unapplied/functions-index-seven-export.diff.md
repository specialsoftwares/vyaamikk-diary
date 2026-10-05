# Unapplied — seven GRIN exports from `functions/src/index.ts`

Status: **proposal only**. Do not apply in this packaging slice.
`functions/src/index.ts` must keep GRIN exports absent until a later owner
authorization. Isolation tests assert the names are not present.

Authoritative composition after this slice: `createProductionGrinCallables`
in `functions/src/goodsEvidence/productionCompose.ts`. Do not export the
fail-closed `handleGrin*` stubs as a working backend.

Production JS entry remains `functions/lib/index.js` after `npm --prefix
functions run build`. Do not change `functions/package.json` `"main"` or add
`rootDir` to `functions/tsconfig.json`.

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
