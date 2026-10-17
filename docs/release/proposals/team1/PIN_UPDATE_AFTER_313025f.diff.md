# Proposed helper pin update — AFTER 313025f (unapplied)

**Do not apply this patch now.** Do not rewrite
`docs/release/packets/grin-ops/grin-functions-op.mjs` in this Team 1
session. Do not set `GRIN_OPS_PINNED_SHA`, `PINNED_APP_SHA` (env),
fixtures, HTTP stubs, or `GRIN_OPS_ALLOW_LIVE=1` to paper over the stale
constant. Live mode already rejects `GRIN_OPS_PINNED_SHA`.

Supersedes `PIN_UPDATE_AFTER_56f2040.diff.md`. Do **not** pin `56f2040`.
A1 does **not** wait on this patch. A3 stays **HOLD** until the coordinator
applies this pin **after Team 5 review** of `313025f`, then a later owner
grant.

---

## Why the current constant is stale

| Item | Value |
|---|---|
| Combined published HEAD (read-only) | `5b3b4cebc607ccbfc0ae366e049fc2e499ccaead` (docs after `313025f`) |
| **Functions candidate / application** | `313025f902b0a3416815da7ce75a3a7d6bec9559` (T2 owner 1/3/10 GiB + 45-day deletion) |
| Prior application (superseded) | `56f2040e30159579edc0cbfbc88e2ba706a6abd2` — **do not pin** |
| Tooling successor | `0d7aa17a6efcf3ce6874269eb57afda0a2b45559` |
| Helper `PINNED_APP_SHA` at combined `5b3b4ce` | `520f9f98bc952fd7f30a907da9e85774629a69c0` — **STALE vs `313025f`** |
| Historical ops-guard | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` — **34/34**. **Not** byte-identical to `0d7aa17`. |
| Canonical CI | GHA **`37425360211`** covers `0d7aa17` / `520f9f9` **only**, **not** `313025f` |
| This Team 1 worktree helper | still `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` — **not rewritten here** |

`git diff --stat 56f2040 313025f -- functions src eas.json app.json app firebase.json` (combined):

```text
 functions/src/deletion/finalPurge.ts
 functions/src/deletion/grinCleanup.unit.test.ts
 functions/src/deletion/grinCleanupLists.ts
 functions/src/goodsEvidence/README.md
 functions/src/goodsEvidence/g2/storageQuota.ts
 functions/src/identity/resolveOrCreateUserByPhone.ts
 src/content/legal/documents.ts
 src/domain/identityLifecycle.ts
 src/goodsEvidence/entitlementLifecycle.test.ts
 src/services/accountDeletion/localDevicePolicy.ts
 src/services/grin/repository/labels.ts
 11 files changed, 72 insertions(+), 26 deletions(-)
```

`git diff --stat 313025f 5b3b4ce -- functions src eas.json app.json app firebase.json` is **empty**. Combined HEAD is docs-only vs the application pin. `assertPinnedSource` allows that (`HEAD === pin` or empty DEPLOYMENT_PATHS).

Checking out exactly `520f9f9` would deploy **without** T2 1/3/10 GiB + 45-day.
Checking out / pinning `56f2040` would deploy **without** that owner wiring.
That is why A3 stays HOLD until this constant moves to `313025f`.

---

## Current helper constant (frozen on combined; not rewritten here)

```js
export const PINNED_APP_SHA = "520f9f98bc952fd7f30a907da9e85774629a69c0";
```

Proposed application pin:

`313025f902b0a3416815da7ce75a3a7d6bec9559`

Do **not** pin `56f2040`. Do **not** pin `520f9f9`. Do **not** pin `b845e8a`.
Do **not** pin combined docs HEAD `5b3b4ce`.

**Apply: HOLD.** Coordinator applies this one-line change only after an
independent **Team 5** review of `313025f`. Applying it is a helper-byte
change. It is **not** an ops-guard successor until the same **34/34** suite
passes on the new helper commit. Canonical CI `37425360211` does **not**
cover `313025f`.

---

## Preconditions (all required)

1. Current application is `313025f` (T2 1/3/10 GiB + 45-day). Team 5
   independent pass at that SHA is **required** before apply.
2. Apply-host `git diff --quiet 313025f902b0a3416815da7ce75a3a7d6bec9559 -- functions src eas.json app.json app firebase.json`
   is empty (combined `5b3b4ce` matches). This Team 1 worktree does **not**.
3. Do **not** substitute `56f2040`, `520f9f9`, `b845e8a`, or env
   `GRIN_OPS_PINNED_SHA`.
4. After applying, run
   `unset GRIN_OPS_ALLOW_LIVE GRIN_OPS_PINNED_SHA PINNED_APP_SHA; node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs`
   and require **34/34**, including UNKNOWN ≠ ABSENT and live override
   rejections.
5. Live mode must still reject `GRIN_OPS_PINNED_SHA`. A3 then uses the new
   constant, not env. A3 remains HOLD until a later owner grant on a tree
   pinned to `313025f`.

---

## Proposed diff (unapplied)

Tests import `PINNED_APP_SHA`; they do not hard-code `520f9f9`. The helper
diff is one line:

```diff
--- a/docs/release/packets/grin-ops/grin-functions-op.mjs
+++ b/docs/release/packets/grin-ops/grin-functions-op.mjs
@@ -24,7 +24,7 @@ import { createHash } from "node:crypto";
 
 const require = createRequire(import.meta.url);
 
-export const PINNED_APP_SHA = "520f9f98bc952fd7f30a907da9e85774629a69c0";
+export const PINNED_APP_SHA = "313025f902b0a3416815da7ce75a3a7d6bec9559";
 export const PROJECT_ID = "vyaamikk-diary";
```

A3 (`gate-off-initial`) remains HOLD until this patch is applied **after**
Team 5 pass **and** a later owner grant. Isolated Firestore A1 does not wait
on this patch.
