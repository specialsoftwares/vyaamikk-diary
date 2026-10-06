# Proposed helper pin update — AFTER S1/S2 (unapplied)

**Do not apply this patch now.** Do not rewrite
`docs/release/packets/grin-ops/grin-functions-op.mjs` in this Team 1
session. Do not set `GRIN_OPS_PINNED_SHA`, fixtures, HTTP stubs, or
`GRIN_OPS_ALLOW_LIVE=1` to “work around” the stale pin.

Current helper constant (frozen; still the live bytes at tooling
`228a8f58ac83d3c71e853cdccb6e4c4fa64c251f`):

```js
export const PINNED_APP_SHA = "5d5df3d54df08953bfb26db39a9b7f5e3d67ed47";
```

Reviewed application artifact (Team 1 `REVIEW_AFTER_S1_S2`, SOURCE PASS):

`520f9f98bc952fd7f30a907da9e85774629a69c0`

(S1/S2; cherry-pick of `0cd3473`). Do **not** pin `b845e8a` (pre-S1/S2).

**Apply: HOLD.** Coordinator applies this one-line change only after an
independent Team 5 post-fix pass at `520f9f9`. Applying it is a helper-byte
change; it is **not** an ops-guard successor until the same 34/34 suite
passes on the new helper commit. Until then keep citing `228a8f58…`.
Tooling pin ≠ application pin.

## Preconditions (all required)

1. S1/S2 corrected application SHA has landed and been independently
   reviewed (`REVIEW_AFTER_S1_S2`). **Team 1 SOURCE PASS recorded.** Team 5
   post-fix independent pass is **still required** before apply.
2. `git diff --stat 520f9f98bc952fd7f30a907da9e85774629a69c0 -- functions src eas.json app.json app firebase.json`
   is empty on the checkout that will run A3 (combined `1ca33d6` matches).
   Empty vs `5d5df3d` is **not** expected and is **not** the goal.
3. Do **not** substitute `b845e8a`.
4. After applying, run
   `node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs`
   and require **34/34**. Record the new helper commit as a candidate
   ops-guard successor only if that suite still passes. Until then, keep
   citing `228a8f58…`.
5. Live mode must still reject `GRIN_OPS_PINNED_SHA` (existing
   `assertLiveOverridesRejected` / “live mode rejects source-pin override”).
   A3 then uses the new constant, not env.

## Proposed diff (unapplied)

```diff
--- a/docs/release/packets/grin-ops/grin-functions-op.mjs
+++ b/docs/release/packets/grin-ops/grin-functions-op.mjs
@@ -24,7 +24,7 @@ import { createHash } from "node:crypto";
 
 const require = createRequire(import.meta.url);
 
-export const PINNED_APP_SHA = "5d5df3d54df08953bfb26db39a9b7f5e3d67ed47";
+export const PINNED_APP_SHA = "520f9f98bc952fd7f30a907da9e85774629a69c0";
 export const PROJECT_ID = "vyaamikk-diary";
```

A3 (`gate-off-initial`) remains HOLD until this patch is applied **after**
Team 5 pass. Isolated Firestore A1 does not wait on this patch.
