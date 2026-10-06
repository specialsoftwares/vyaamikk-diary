# Helper pin update — applied after T1 + T5 review

Coordinator applied the one-line `PINNED_APP_SHA` change **after**:

- Team 1 `REVIEW_AFTER_S1_S2.md` SOURCE PASS at `520f9f9` (`80b802f`)
- Team 5 `S1_S2_POST_FIX.md` INJECTED + named G2 EMULATOR PASS (`1e33894`)

Do **not** set `GRIN_OPS_PINNED_SHA`, fixtures, HTTP stubs, or
`GRIN_OPS_ALLOW_LIVE=1`. Live mode still rejects those overrides (ops-guard
test “live mode rejects source-pin override before mutation”).

Applied constant:

```js
export const PINNED_APP_SHA = "520f9f98bc952fd7f30a907da9e85774629a69c0";
```

Do **not** pin `b845e8a`. Empty vs `5d5df3d` is **not** the goal.

Ops-guard **34/34** re-run on this helper after the constant change
(`unset GRIN_OPS_ALLOW_LIVE GRIN_OPS_PINNED_SHA PINNED_APP_SHA`). The
previous verified fail-closed bytes remain `228a8f58…`. This pin-apply
commit is a **candidate** ops-guard successor only; A3 (`gate-off-initial`)
stays **HOLD** until the owner authorizes live Functions. Isolated
Firestore A1 does not wait on Functions deploy.

```diff
--- a/docs/release/packets/grin-ops/grin-functions-op.mjs
+++ b/docs/release/packets/grin-ops/grin-functions-op.mjs
@@ -24,7 +24,7 @@ import { createHash } from "node:crypto";
 
 const require = createRequire(import.meta.url);
 
-export const PINNED_APP_SHA = "5d5df3d54df08953bfb26db39a9b7f5e3d67ed47";
+export const PINNED_APP_SHA = "520f9f98bc952fd7f30a907da9e85774629a69c0";
 export const PROJECT_ID = "vyaamikk-diary";
```
