# Proposed helper pin update — AFTER fcda7cd (unapplied)

**Do not apply this patch now.** Do not rewrite
`docs/release/packets/grin-ops/grin-functions-op.mjs` in this session.
Do not set `GRIN_OPS_PINNED_SHA`, `PINNED_APP_SHA` (env), fixtures, HTTP
stubs, or `GRIN_OPS_ALLOW_LIVE=1` to paper over the stale constant.
Live mode already rejects `GRIN_OPS_PINNED_SHA`.

Supersedes `PIN_UPDATE_AFTER_313025f.diff.md` and
`PIN_UPDATE_AFTER_56f2040.diff.md`. Do **not** pin `313025f`, `56f2040`,
or `520f9f9`. A1 does **not** wait on this patch. A3 stays **HOLD** until
the coordinator applies this pin **after Team 5 review** of `fcda7cd`,
canonical CI on that SHA, and a later owner grant.

---

## Why the current constant is stale

| Item | Value |
|---|---|
| **Functions candidate / application** | `fcda7cd64e9622e50c38223a7156f0f6b8ca5576` (restricted Play tester fail-closed on `313025f` 1/3/10 GiB + 45-day) |
| Prior application (superseded for Functions/AAB) | `313025f902b0a3416815da7ce75a3a7d6bec9559` — **do not pin** (omits tester restriction) |
| Helper `PINNED_APP_SHA` | `520f9f98bc952fd7f30a907da9e85774629a69c0` — **STALE vs `fcda7cd`** |
| Historical ops-guard | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` — **34/34**. **Not** byte-identical to `0d7aa17`. |
| Canonical CI | GHA **`37425360211`** covers `0d7aa17` / `520f9f9` **only**, **not** `fcda7cd` |

Checking out exactly `520f9f9` would deploy without T2 1/3/10 GiB + 45-day
and without tester restriction. Pinning `313025f` would deploy GRIN policy
**without** fail-closed Play tester admission. That is why A3 stays HOLD
until this constant moves to `fcda7cd`.

---

## Proposed diff (unapplied)

```diff
--- a/docs/release/packets/grin-ops/grin-functions-op.mjs
+++ b/docs/release/packets/grin-ops/grin-functions-op.mjs
@@ -24,7 +24,7 @@ import { createHash } from "node:crypto";
 
 const require = createRequire(import.meta.url);
 
-export const PINNED_APP_SHA = "520f9f98bc952fd7f30a907da9e85774629a69c0";
+export const PINNED_APP_SHA = "fcda7cd64e9622e50c38223a7156f0f6b8ca5576";
 export const PROJECT_ID = "vyaamikk-diary";
```

**Apply: HOLD.** Preconditions: T5 independent pass at `fcda7cd`; apply-host
`git diff --quiet fcda7cd64e9622e50c38223a7156f0f6b8ca5576 -- functions src eas.json app.json app firebase.json`
empty; ops-guard **34/34** after apply; live mode still rejects
`GRIN_OPS_PINNED_SHA`; later owner grant for A3.
