# Operation E — gate enable / disable (reviewed procedure)

**Not authorization by itself.** Mutating commands still require
`GRIN_OPS_ALLOW_LIVE=stub|1`. Never print credentials or environment values.

Restricted-pilot Internal GRIN only. Purchase-entry remains off. P8 remains
**FAIL** (`INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`). Do not flip that flag.

---

## SOURCE / STUB / LIVE

| Layer | Status | What it is |
|---|---|---|
| **SOURCE** | **Supported** | Cloud Functions v2 `PATCH` with exact `updateMask=serviceConfig.environmentVariables`. Body is the full existing env map with only `GRIN_GOODS_EVIDENCE_FUNCTIONS` changed. Never send `buildConfig` / `source`. |
| **STUB** | **PASS** | `grin-functions-patch-env.test.mjs` + `grin-functions-op.test.mjs` (ops-guard). |
| **LIVE omitted-`--source` gcloud** | **FAILED — not executable** | gcloud **588.0.0** + firebase-created gen2 probe: omitted `--source` used cwd and started a rebuild. Helper `runGcloudGate` / `GRIN_OPS_METHOD=gcloud-update-env-vars` **abort**. Do **not** retry against GRIN. Do **not** use direct Cloud Run env edit. |
| **LIVE Functions v2 PATCH** | **PASS** (2026-10-06) | Probe: off→on→off behavior, unrelated env key+value equality, preserved runtime/entry/SA/ingress/scaling/secrets/memory/timeout/IAM; source archives byte-identical across platform rebuild IDs. Seven GRIN names: same checks, all **gate=on**. Proven disable remains Functions v2 PATCH `false` (not omitted-source gcloud). |

---

## Exact source / artifact

| Item | Value |
|---|---|
| Application checkpoint | `540e07aa07f376716484adb879ce66cb9fb170ce` |
| Helper pin | `PINNED_APP_SHA=540e07a` in `docs/release/packets/grin-ops/grin-functions-op.mjs` |
| CI | GHA **`37445383607` SUCCESS**, verify job **`112208918347`** |
| Project / region | `vyaamikk-diary` / `asia-south1` |
| firebase-tools | **14.20.0** |
| gcloud | **588.0.0** (token-file wrapper; omitted-source route retired) |
| Env key | `GRIN_GOODS_EVIDENCE_FUNCTIONS` |
| On / Off | exact `"true"` / `"false"` |

Seven names (`GRIN_FUNCTIONS` order):

```text
grinRegisterGoodsReceipt
grinReconcileCommand
grinMutateGoodsReceipt
grinReadGoodsReceipt
grinReserveEvidence
grinBeginEvidenceUpload
grinUploadEvidence
```

---

## Executable commands (guarded)

```bash
# inspect (read-only)
node docs/release/packets/grin-ops/grin-functions-op.mjs inspect

# enable / disable (require GRIN_OPS_ALLOW_LIVE=1; no pin/fixture/HTTP-stub overrides)
GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs enable
GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs disable

# probe only (authorized separately when needed)
GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs patch-probe true
GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs patch-probe false
```

Retired routes refuse explicitly:

- `GRIN_OPS_METHOD=gcloud-update-env-vars` → abort FAILED
- `runGcloudGate(...)` → abort FAILED
- `firebase-dotenv` / direct Cloud Run env edit → abort

Inspect / gate-off-initial / presence / dotenv / pin / clean-deployment guards are preserved.

Platform may rewrite sourceGeneration/build/image IDs. Helper allows those **only** when before/after GCS source archive SHA-256 (and byte length) match. Unexpected config diffs abort.

---

## F after E

LIVE synthetic smoke uses **Firebase client phone OTP** on a local sign-in surface
(`grin-live-f-signin.mjs` + `grin-live-f.ts`), then `httpsCallable`-shaped POSTs
with that session. It does **not** use `iamcredentials.signJwt`, Token Creator
grants, or Admin-substituted client success. Cross-owner / non-admitted remain
**NOT RUN** until an additional authorized account exists.

See `docs/release/packets/grin-ops/GRIN_PILOT_EXECUTION_REPORT.md`.
