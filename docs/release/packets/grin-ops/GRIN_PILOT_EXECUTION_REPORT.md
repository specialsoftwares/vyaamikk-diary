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
| unauthenticated_denial | **PASS** (prior LIVE; `code=unauthenticated`) |
| authenticated path | **WAITING** — client phone OTP blocked; see `AUTH_SMS_DIAGNOSIS.md` (limit **UNKNOWN**) |
| authenticated registration / replay / upload-verify / confirm / narrow read | **NOT RUN** (blocked on Auth) |
| non_admitted / cross_owner | **NOT RUN** |

Harness corrections:
- `17b8a68`: verified claims; in-memory Auth; nonce/origin/body bounds; no `users/{uid}` create; narrow read (not production PDF export)
- `20df6b9`: `sendInFlight` + `throttled` (no auto-retry); cancel/timeout retire pending handoff; controller unit tests (injected Auth, no SMS)

`iamcredentials.signJwt` remains unused. No IAM expansion.

---

## Reproducible helper tests

```bash
cd <combined-worktree>
node --test docs/release/packets/grin-ops/grin-functions-patch-env.test.mjs \
  docs/release/packets/grin-ops/grin-functions-op.test.mjs \
  docs/release/packets/grin-ops/grin-live-f-signin.test.mjs \
  docs/release/packets/grin-ops/grin-live-f-signin-controller.test.mjs \
  docs/release/packets/grin-ops/grin-live-f-evidence.test.mjs \
  docs/release/proposals/team1/grin-pilot-smoke.test.mjs
```

Auth controller + `/session` tests: **12 PASS** locally (2026-10-07). Full suite count may differ; re-run before citing.

---

## B1 / B2 (store path)

| Letter | State |
|---|---|
| B1 Internal AAB | **COMPLETE** — EAS `8c789fa9-…`; AAB SHA-256 `dc2dbf61…`; pin `540e07a`; purchase/quota off |
| B2 Internal Testing | **COMPLETE** — vc23 released to Internal testing 2026-10-07; see `B1_B2_EVIDENCE_REDACTED.md` |
| D1 device upgrade | Owner install pending; upload ≠ acceptance |
| Billing / purge / main / public | Still out of scope |

## Still out of scope

Billing activation, purge activation, IAM expansion, main merge, OTA, public
rollout. Authenticated LIVE F remains WAITING.
