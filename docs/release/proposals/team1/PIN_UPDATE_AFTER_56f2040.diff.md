# Proposed helper pin update — AFTER 56f2040 (unapplied)

**Do not apply this patch now.** Do not rewrite
`docs/release/packets/grin-ops/grin-functions-op.mjs` in this Team 1
session. Do not set `GRIN_OPS_PINNED_SHA`, `PINNED_APP_SHA` (env),
fixtures, HTTP stubs, or `GRIN_OPS_ALLOW_LIVE=1` to paper over the stale
constant. Live mode already rejects `GRIN_OPS_PINNED_SHA`.

A1 presentation (`A1_PRESENT.md`, team `80da828`) is unchanged. Isolated
Firestore A1 does **not** wait on this patch.

---

## Why the current constant is stale

| Item | Value |
|---|---|
| Combined published HEAD | `28182c2ee8cf4767d3c316f4cc6b337b4bfa240a` |
| Current application | `56f2040e30159579edc0cbfbc88e2ba706a6abd2` (T2 capacity/cleanup on `520f9f9`) |
| Tooling successor | `0d7aa17a6efcf3ce6874269eb57afda0a2b45559` |
| Helper `PINNED_APP_SHA` at `0d7aa17` **and** at `28182c2` | `520f9f98bc952fd7f30a907da9e85774629a69c0` — **STALE vs `56f2040`** |
| Historical ops-guard | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` — **34/34** (pin was `5d5df3d`). Keep citing as history. **Not** byte-identical to `0d7aa17` (one-line pin only). |
| Canonical CI | GHA run **`37425360211`** covers `0d7aa17` / `520f9f9` **only**, **not** `56f2040` |
| This Team 1 worktree helper | still `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` — **not rewritten here** |

`git diff --stat 520f9f9 56f2040 -- functions src eas.json app.json app firebase.json`:

```text
 functions/src/deletion/grinCleanup.ts
 functions/src/deletion/grinCleanup.unit.test.ts
 functions/src/deletion/grinCleanupLists.ts
 functions/src/goodsEvidence/g2/adapter.ts
 functions/src/goodsEvidence/g2/storageQuota.ts
 functions/src/goodsEvidence/g2/types.ts
 6 files changed, 486 insertions(+), 41 deletions(-)
```

`git diff --stat 56f2040 28182c2 -- functions src eas.json app.json app firebase.json` is **empty**. Combined HEAD is docs-only vs the application pin. `assertPinnedSource` allows that (`HEAD === pin` or empty DEPLOYMENT_PATHS diff).

Helper bytes `0d7aa17` vs `28182c2` are **identical**. The stale constant is the only pin problem.

Current live-path behaviour (fail-closed, keep):

- Combined HEAD `28182c2` vs helper pin `520f9f9` → DEPLOYMENT_PATHS diff is **non-empty** → `gate-off-initial` **refuses**. Do not treat that refuse as a reason to env-override.
- Checking out exactly `520f9f9` would match the stale constant and would deploy **without** T2 capacity/cleanup. That is why A3 stays HOLD until this constant moves.

---

## Current helper constant (frozen; still the bytes at `0d7aa17` / `28182c2`)

```js
export const PINNED_APP_SHA = "520f9f98bc952fd7f30a907da9e85774629a69c0";
```

Proposed application pin:

`56f2040e30159579edc0cbfbc88e2ba706a6abd2`

Do **not** pin `520f9f9` (pre-capacity). Do **not** pin `b845e8a`. Do **not**
pin combined docs HEAD `28182c2` as the application SHA.

**Apply: HOLD.** Coordinator applies this one-line change only after an
independent **Team 5** review of `56f2040` capacity/cleanup. Applying it is a
helper-byte change. It is **not** an ops-guard successor until the same
**34/34** suite passes on the new helper commit. Until then keep citing
`228a8f5` as historical 34/34 and `0d7aa17` as the pin-constant successor
that is **not** byte-identical to `228a8f5`. Canonical CI `37425360211` does
**not** cover `56f2040`; do not infer SOURCE CI from that run.

---

## Preconditions (all required)

1. Current application is `56f2040` (T2 capacity/cleanup). Team 5 independent
   pass at that SHA is **still required** before apply. Do not treat Team 1
   SOURCE notes as that pass.
2. Apply-host `git diff --quiet 56f2040e30159579edc0cbfbc88e2ba706a6abd2 -- functions src eas.json app.json app firebase.json`
   is empty (combined `28182c2` matches). Empty vs `520f9f9` is **not**
   expected and is **not** the goal.
3. Do **not** substitute `520f9f9`, `b845e8a`, or env `GRIN_OPS_PINNED_SHA`.
4. After applying, run
   `unset GRIN_OPS_ALLOW_LIVE GRIN_OPS_PINNED_SHA PINNED_APP_SHA; node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs`
   and require **34/34**, including:
   - Functions list HTTP 401/403/500, malformed JSON, invalid shape, interrupted
     pagination → **UNKNOWN**, not ABSENT, **must not deploy**
   - live mode rejects endpoint fixture / source-pin override / test-hang
     before mutation
5. Record the new helper commit as a **candidate** ops-guard successor only
   if that suite still passes. Until then, keep citing `228a8f5` 34/34 as
   history and `0d7aa17` as the previous pin-constant successor.
6. Live mode must still reject `GRIN_OPS_PINNED_SHA` (`assertLiveOverridesRejected`).
   A3 then uses the new constant, not env. A3 remains HOLD until a later
   owner grant on a tree pinned to `56f2040`.

This Team 1 session re-ran the successor helper suite on combined `28182c2`
(constant still `520f9f9`): **34/34**, exit **0**. That is **not** a pin apply
and **not** CI for `56f2040`.

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
+export const PINNED_APP_SHA = "56f2040e30159579edc0cbfbc88e2ba706a6abd2";
 export const PROJECT_ID = "vyaamikk-diary";
```

A3 (`gate-off-initial`) remains HOLD until this patch is applied **after**
Team 5 pass **and** a later owner grant. Isolated Firestore A1 does not wait
on this patch.
