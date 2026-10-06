# Proposed helper pin update — AFTER S1/S2 only (unapplied)

**Do not apply this patch now.** Do not rewrite
`docs/release/packets/grin-ops/grin-functions-op.mjs` in this Team 1
session. Do not set `GRIN_OPS_PINNED_SHA`, fixtures, HTTP stubs, or
`GRIN_OPS_ALLOW_LIVE=1` to “work around” the stale pin.

Current helper constant:

```js
export const PINNED_APP_SHA = "5d5df3d54df08953bfb26db39a9b7f5e3d67ed47";
```

That pin is **STALE** vs application `b845e8a30262b9e8740fa53b55e9a0f237caea0b`
(`git diff` non-empty on `functions/src/goodsEvidence`). `b845e8a` is itself
**pre-S1/S2** and must **not** become the live Functions pin.

Ops-guard tooling pin stays
`228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` until a successor helper commit
is verified with the **same** 34/34 suite. This proposal is one constant
change only; it is not that successor until applied **and** re-tested.

## Preconditions (all required)

1. S1/S2 corrected application SHA has landed and been independently
   reviewed (`REVIEW_AFTER_S1_S2`). Corrupt accounting must not bypass the
   cap; hold keys must include durable `ledgerId` identity.
2. `git diff --stat <SUCCESSOR> -- functions src eas.json app.json app firebase.json`
   is the reviewed deployment tree (or coordinator-named equivalent). Empty
   vs `5d5df3d` is **not** expected and is **not** the goal.
3. Do **not** substitute `b845e8a`.
4. After applying, run
   `node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs`
   and require **34/34**. Record the new helper commit as a candidate
   ops-guard successor only if that suite still passes. Until then, keep
   citing `228a8f58…`.
5. Live mode must still reject `GRIN_OPS_PINNED_SHA` (existing
   `assertLiveOverridesRejected`). A3 then uses the new constant, not env.

## Proposed diff (placeholder SHA)

Replace `<SUCCESSOR_SHA_AFTER_S1_S2>` with the reviewed post-S1/S2
application SHA only.

```diff
--- a/docs/release/packets/grin-ops/grin-functions-op.mjs
+++ b/docs/release/packets/grin-ops/grin-functions-op.mjs
@@ -24,7 +24,7 @@ import { createHash } from "node:crypto";
 
 const require = createRequire(import.meta.url);
 
-export const PINNED_APP_SHA = "5d5df3d54df08953bfb26db39a9b7f5e3d67ed47";
+export const PINNED_APP_SHA = "<SUCCESSOR_SHA_AFTER_S1_S2>";
 export const PROJECT_ID = "vyaamikk-diary";
```

A3 (`gate-off-initial`) remains HOLD until this reviewed pin exists.
Isolated Firestore A1 does not wait on this patch.
