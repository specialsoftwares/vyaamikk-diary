# Team 5 independent review — helper pin apply at `540e07a`

AI QA / release-gate role, not human certification. Worked **only** in
`/Users/shivamsaurav/vyd-worktrees/grin-t5-qa`. Combined
`/Users/shivamsaurav/vyd-worktrees/grin-combined` was **read-only** (helper
copied out for the TOOLING rerun, then this worktree’s helper was
**restored**). This T5 worktree was **not** reset. Historical dirty
workspace **not** edited. **No deploy.** Helper **not** rewritten onto
this provenance branch. `GRIN_OPS_ALLOW_LIVE` remained **unset** in the
parent shell. `PLAY_BILLING_ENABLED` remained **unset**. **No
INCLUDE_GRIN_IN_ACCOUNT_PURGE flip.** No live purge, EAS, Play, or
billing activation.

Scope is **only** coordinator helper pin apply: tooling
`2d33f6d` vs unchanged application `540e07a`. Entire GRIN history is
**not** re-reviewed. Application `REVIEW_540e07a.md` **stands**. S1 / S2 /
P3 are **not reopened** (no new reproduction). Device / live backend /
catalog / RTDN live / Play / billing / public are **not accepted**.
**P8 is not flipped** and **stays FAIL operationally**. This packet is
**not** a live Functions grant and **not** A3 execute.
**GRIN readiness ≠ billing readiness.**

Leftover dirty `POLICY_QA.md` / `issuance-monthly-allowance.regression.test.mjs`
/ `public-deletion-retention.regression.test.mjs` / `RELEASE_COMPLETION_QA.md`
still describe **P3 FAIL at `5d5df3d`**. They were **left uncommitted**.
Helper copy for the test run was **restored**; leftover hashes **unchanged**.

Prior application review: `REVIEW_540e07a.md` (`b3b1c97`). That review
recorded helper pin **`520f9f9` STALE** and did **not** rewrite it.

---

## Coordinates (verified)

| Item | Value |
|---|---|
| QA worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa` provenance `team/grin-t5-review-pin-540e07a` |
| Combined (read-only copy source) | `/Users/shivamsaurav/vyd-worktrees/grin-combined` helper blob `75f79ff9b6e7b5df98f1269fc3124889400b7bd6` **=** `2d33f6d` |
| **Application SHA (unchanged)** | `540e07aa07f376716484adb879ce66cb9fb170ce` |
| **Tooling SHA** | `2d33f6d252d66a89d6fcef5cf75feaf268e7e7b2` — `PINNED_APP_SHA` **only** (`docs/release/packets/grin-ops/grin-functions-op.mjs` +1 / −1) |
| Tooling parent | `9b3d5e009f26d9dda93f0ec640bccd01ac504468` (docs fold; helper still `520f9f9`) |
| CI-tested checkout | `7e0d629023198333ed384ae076285925e98047d6` |
| GHA (coordinator-stated) | **`37445383607` SUCCESS**, job **`112208918347` `verify`**, checkout **`7e0d629`**. `gh auth status`: not logged into any GitHub hosts. **API NOT FETCHED** / **not invented**. Independently: `7e0d629` helper pin is still **`520f9f9`**, so that CI is **application `540e07a`**, **not** a re-run of pin commit `2d33f6d`. |
| `540e07a`..`7e0d629` on `functions` `src` `eas.json` `app.json` `app` `firebase.json` | **empty** |
| `540e07a`..`2d33f6d` on `functions` `src` `eas.json` `app.json` `app` `firebase.json` | **empty** (pin is helper-only; remaining range is docs/QA) |
| Helper `PINNED_APP_SHA` at `540e07a` / `7e0d629` / `9b3d5e0` | `520f9f98bc952fd7f30a907da9e85774629a69c0` (blob `23f71103b473fccda55849fa1a1dcf2bf0f870c5`) |
| Helper `PINNED_APP_SHA` at `2d33f6d` | **`540e07aa07f376716484adb879ce66cb9fb170ce`** (blob `75f79ff9b6e7b5df98f1269fc3124889400b7bd6`) |
| Test file / HTTP stub `2d33f6d` vs this T5 HEAD | **identical** (`e23b1ef…` / `ae6a622…`) |
| `INCLUDE_GRIN_IN_ACCOUNT_PURGE` at `540e07a` | **false** |
| `GRIN_OPS_ALLOW_LIVE` (this shell) | unset |
| `PLAY_BILLING_ENABLED` (this shell) | unset |
| `adb devices` | `List of devices attached` (empty) |

This T5 provenance tree’s on-disk helper remains historical
`PINNED_APP_SHA=5d5df3d…` (blob `d42c74ba…`). Tests used a **temporary
copy** of the `2d33f6d` helper, then that path was **restored**. Helper
bytes were **not** left staged.

---

## Label split (keep separate)

| Host | This review |
|---|---|
| SOURCE | Pin constant equals application SHA; empty app diff `540e07a`…`2d33f6d` on deployment paths; CI checkout `7e0d629` still stale-pin |
| SOURCE CI | GHA `37445383607` / `112208918347` on `7e0d629` / app `540e07a` stated; **not re-fetched**; **not** live; **not** a pin-commit rerun |
| TOOLING | Ops-guard rerun below; live-mode still rejects fixture / `GRIN_OPS_PINNED_SHA` / HTTP stub / test-hang; UNKNOWN inventory still refuses mutate |
| INJECTED / EMULATOR (S1/S2) | Prior `S1_S2_POST_FIX.md` — **not re-run**; **not reopened** |
| LIVE_BACKEND | **NOT RUN** (no inspect/apply against production; parent `GRIN_OPS_ALLOW_LIVE` unset) |
| NATIVE_DEVICE / PLAY_INSTALLED | **NOT RUN** (empty `adb`) |
| Payment / public-submission | **NOT RUN** / **not accepted** |

`2d33f6d` is **TOOLING only**. `7e0d629` CI is **SOURCE CI only**.

---

## Required checks

| Requirement | Result |
|---|---|
| `PINNED_APP_SHA` equals `540e07a` | **PASS** SOURCE at `2d33f6d` (`export const PINNED_APP_SHA = "540e07aa07f376716484adb879ce66cb9fb170ce"`) |
| `git diff 540e07a 2d33f6d -- functions src eas.json app.json app firebase.json` empty | **PASS** SOURCE (empty). Pin commit vs parent: helper **only**. |
| `node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs` | **PASS** TOOLING — `# tests 34` `# pass 34` `# fail 0` (copied `2d33f6d` helper; then restored) |
| Live fixture / override rejection (`GRIN_OPS_PINNED_SHA` / fixtures / HTTP stub / test-hang) | **PASS** TOOLING — named tests 27–29; HTTP stub via `assertLiveOverridesRejected` + CLI `inspect` abort (child env only; parent unset) |
| UNKNOWN inventory still refuses mutate | **PASS** TOOLING — HTTP 401/403/500, malformed JSON, invalid shape, interrupted pagination: non-zero, **no** stub deploy log; 403 inspect is UNKNOWN **not** `allGrinAbsent` |
| Do not mark device / live / billing / public Done | **honored** — **NOT RUN** |
| P8 stays FAIL | **FAIL (required)** — flag false at `540e07a`; application review stands; **not flipped** |
| S1 / S2 / P3 preserved | **PASS preserved** — **not re-run, not reopened** |

---

## Pin apply (SOURCE)

`2d33f6d` vs `9b3d5e0`:

```diff
-export const PINNED_APP_SHA = "520f9f98bc952fd7f30a907da9e85774629a69c0";
+export const PINNED_APP_SHA = "540e07aa07f376716484adb879ce66cb9fb170ce";
```

`LIVE_FORBIDDEN_ENV` still lists `GRIN_OPS_ENDPOINT_FIXTURE`,
`GRIN_OPS_PINNED_SHA`, `GRIN_OPS_TEST_HANG`, `GRIN_OPS_HTTP_STUB`,
`FIREBASE_BIN`, `GCLOUD_BIN`. Live mode still returns the constant pin
and still aborts when those overrides are set. Stub HTTP loader still
aborts `live mode rejects GRIN_OPS_HTTP_STUB`.

Ancestry: `540e07a` ⊂ `7e0d629` ⊂ `9b3d5e0` ⊂ `2d33f6d`. Between CI
checkout and the pin: docs fold `9b3d5e0`, then helper pin. Application
blobs on deployment paths **did not move**.

---

## Commands actually run (labels + exits)

Helper copied from combined (`2d33f6d` blob `75f79ff…`) into this worktree
for the rerun, then **restored** to historical `d42c74ba…`. Leftover
P3-FAIL files stayed dirty. No deploy. No helper commit. Parent
`GRIN_OPS_ALLOW_LIVE` unset for the suite. HTTP-stub live checks used
**child** env only.

| Command | Label | Exit |
|---|---|---|
| `git diff --stat 540e07a 2d33f6d -- functions src eas.json app.json app firebase.json` | SOURCE | empty — **PASS** |
| `git show 2d33f6d -- docs/release/packets/grin-ops/grin-functions-op.mjs` | SOURCE | pin constant **only** — **PASS** |
| `unset GRIN_OPS_ALLOW_LIVE …; node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs` | TOOLING | **0**. TAP: **pass 34** / fail 0 / skipped 0 — **PASS** |
| named `live mode rejects endpoint fixture\|source-pin\|test-hang` (inside that suite) | TOOLING | **ok 27–29** — **PASS** |
| child `GRIN_OPS_ALLOW_LIVE=1 GRIN_OPS_HTTP_STUB=1` `assertLiveOverridesRejected()` | TOOLING | **0**. `live mode rejects test overrides (GRIN_OPS_HTTP_STUB) before inspection or mutation` — **PASS** |
| child `GRIN_OPS_ALLOW_LIVE=1 GRIN_OPS_HTTP_STUB=… node … inspect` | TOOLING | **2**. `ABORT: live mode rejects test overrides (GRIN_OPS_HTTP_STUB)…` — **PASS** |
| UNKNOWN / does-not-deploy cases (inside that suite) | TOOLING | **ok 16–20, 24, 34** — **PASS** |
| `adb devices` | NATIVE_DEVICE | empty list — **NOT RUN** |
| `gh auth status` | Canonical CI API | not logged in — **NOT FETCHED** |

---

## NOT RUN

LIVE_BACKEND inspect/apply, A1–A7 execute, EAS, Play writes, billing
activation, catalog/RTDN live, REAL-CHARGE, public submission,
NATIVE_DEVICE / PLAY_INSTALLED, G2 Firestore/Storage emulator, S1/S2 Team 5
harness re-exec, leftover `5d5df3d` expected-FAIL copies, helper rewrite
onto this branch, `INCLUDE_GRIN_IN_ACCOUNT_PURGE` flip, live account
purge, GHA API fetch of `37445383607`.

---

## Prior findings (not reopened)

| ID | Status |
|---|---|
| S1 | **PASS preserved** (`S1_S2_POST_FIX.md`). Not re-run. No new failure. |
| S2 | **PASS preserved** at that same boundary. Not re-run. No new failure. |
| P3 | **ACCEPTED** preserved. Not re-run. No new issuance failure. |
| P8 | **FAIL** (`REVIEW_540e07a.md`: flag false; default lists omit GRIN; packet is not a live grant). Not flipped. |

`REVIEW_540e07a.md` SOURCE+INJECTED PASS for the inert P8 production-path
**stands**. This slice did not change application deletion or billing.

---

## Blockers

**None** for this helper-pin apply at SOURCE + TOOLING. No application
path change, no flag flip, no live mutate, no committed customer
identifiers, no claim that P8 / device / live / billing / public are
done.

Do not treat `2d33f6d` as a live Functions grant. Do not execute A3.
Do not delay Internal GRIN on billing-activation residuals. Do not
rewrite the helper on this provenance branch. Do not force-push
`origin/team/grin-t5-qa` or `origin/team/grin-t5-review-540e07a`.

---

## Verdict

**PASS at SOURCE + TOOLING** for helper pin apply: `PINNED_APP_SHA` at
tooling `2d33f6d` **equals** application `540e07a`. Deployment-path diff
vs `540e07a` is **empty**. Ops-guard **34/34**. Live mode still rejects
`GRIN_OPS_PINNED_SHA` / fixtures / HTTP stub / test-hang. UNKNOWN
inventory still refuses mutate. Stated GHA `37445383607` is checkout
`7e0d629` / app `540e07a`, **not** a re-run of `2d33f6d` (helper there
still `520f9f9`). API **not re-fetched**.

**P3 ACCEPTED. P8 FAIL. S1/S2 preserved.** Packet is **not** a live grant.
No new defect with a reproduction that blocks Internal GRIN.

Do not mark device / live / billing / public Done. Do not flip
`INCLUDE_GRIN_IN_ACCOUNT_PURGE`. Do not force-push
`origin/team/grin-t5-qa` or `origin/team/grin-t5-review-540e07a`.
