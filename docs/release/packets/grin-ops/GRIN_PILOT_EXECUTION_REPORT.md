# GRIN pilot execution report (redacted)

**Not a credentials dump.** No env values, tokens, UIDs, phone numbers, or
source-archive bytes are recorded here.

Date: **2026-10-06**  
Project: `vyaamikk-diary` / `asia-south1`  
Application SHA: `540e07aa07f376716484adb879ce66cb9fb170ce`  
Helper pin: `PINNED_APP_SHA=540e07a`  
firebase-tools: **14.20.0**  
gcloud: **588.0.0**

---

## Probe (final PATCH preservation)

Function: `grinPilotPreservationProbe` · codebase: `grin-pilot-probe`  
Lifecycle: create → PATCH true → PATCH false → delete only that probe.

| Check | Result |
|---|---|
| Callable behavior | off → on → off (`gate_off` / `ok` / `gate_off`) |
| Unrelated env keys+values | equal (private fingerprints) |
| Runtime / entry / SA / ingress / scaling / secrets / memory / timeout / IAM | preserved |
| Source archives before/after | identical SHA-256; platform rebuild IDs accepted |
| Packaged `.env` keys | `GRIN_PROBE_SENTINEL` only |
| After delete | function + Cloud Run service **404** |
| Shared artifacts / business data | not deleted |

Evidence kept privately under `/tmp/grin-probe-final-evidence/` (not in git).

---

## E — seven GRIN functions

Method: Functions v2 `PATCH` `updateMask=serviceConfig.environmentVariables` only.  
Retired omitted-`--source` gcloud: **FAILED / not executed**.

| Function | Gate | Archive match | Config/IAM preserve |
|---|---|---|---|
| grinRegisterGoodsReceipt | off→**on** | yes | yes |
| grinReconcileCommand | off→**on** | yes | yes |
| grinMutateGoodsReceipt | off→**on** | yes | yes |
| grinReadGoodsReceipt | off→**on** | yes | yes |
| grinReserveEvidence | off→**on** | yes | yes |
| grinBeginEvidenceUpload | off→**on** | yes | yes |
| grinUploadEvidence | off→**on** | yes | yes |

Inspect after E: seven **PRESENT gate=on**, secrets=0, unrelated_functions=39.  
Firestore/Storage rulesets unchanged from A/B.  
Proven disable remains PATCH `false` (not gcloud).

Private before/after archives: `/tmp/grin-e-evidence/` (not in git).

---

## F — synthetic LIVE (auth boundary)

| Scenario | Result |
|---|---|
| unauthenticated_denial | **PASS** (anonymous callable deny) |
| authenticated_success / register_replay / upload_verification / confirmation / read_export | **PENDING** client phone OTP session |
| non_admitted_denial | **NOT RUN** |
| cross_owner_denial | **NOT RUN** |

`iamcredentials.signJwt` on the Compute default SA returned **403**. That is an
**operator auth-boundary** choice under the “no IAM expansion” rule — **not** an
application IAM defect and **not** a reason to grant Token Creator.

Authenticated F uses Firebase **client** phone sign-in on a local surface
(`docs/release/packets/grin-ops/grin-live-f-signin.mjs`). Owner enters OTP in
that UI. Session UID is checked against the private admission file. Callables
use that same client ID token. Admin writes are not substituted for client-path
success.

Synthetic ledger id: `ledger_pilot_live` (ownership/status verified before use).

---

## Reproducible helper tests

```bash
cd <combined-worktree>
node --test docs/release/packets/grin-ops/grin-functions-patch-env.test.mjs \
  docs/release/packets/grin-ops/grin-functions-op.test.mjs
node --test docs/release/proposals/team1/grin-pilot-smoke.test.mjs
```

Expected: **54 PASS** (patch-env + ops-guard + smoke gate; recorded at publish).

---

## Out of scope (unchanged)

No EAS build, Play upload, billing activation, purge activation, IAM expansion,
main merge, or public rollout from this report.
