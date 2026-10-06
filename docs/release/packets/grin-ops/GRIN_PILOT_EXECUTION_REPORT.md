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
| unauthenticated_denial | Requires `code=unauthenticated` (or HTTP 401) |
| authenticated path | Firebase **client** phone OTP; `/session` verifies ID token via Google securetoken certs for `vyaamikk-diary`; `body.uid` ignored |
| non_admitted / cross_owner | **NOT RUN** |

Harness corrections (tooling after `3a24bb8`): verified claims only; in-memory Auth + clear after handoff; one-use nonce + same-origin + body size; no `users/{uid}` create fallback; confirmation/replay/evidence tightened; `read_export` reported as **NARROW** (authorized read + local manifest assembly, not production PDF/export).

`iamcredentials.signJwt` remains unused. No IAM expansion.

---

## Reproducible helper tests

```bash
cd <combined-worktree>
node --test docs/release/packets/grin-ops/grin-functions-patch-env.test.mjs \
  docs/release/packets/grin-ops/grin-functions-op.test.mjs \
  docs/release/packets/grin-ops/grin-live-f-signin.test.mjs \
  docs/release/packets/grin-ops/grin-live-f-evidence.test.mjs \
  docs/release/proposals/team1/grin-pilot-smoke.test.mjs
```

Expected: **62 PASS** (patch-env + ops-guard + F sign-in/evidence + smoke gate).

---

## Out of scope (unchanged)

No EAS build, Play upload, billing activation, purge activation, IAM expansion,
main merge, or public rollout from this report.
