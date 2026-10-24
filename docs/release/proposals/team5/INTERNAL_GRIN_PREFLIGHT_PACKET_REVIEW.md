# Internal GRIN preflight packet review (Team 5)

AI QA / release-gate role, not human certification. Independent of the
implementation pass. **Packet + guarded tooling only.** Domain / boot /
diagnostics / file-IO suites were not re-run. Wave 2 is **not** accepted.
Not live deploy.

Application SHA: `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47`
Canonical application CI: `37351685421` / `111903806888`. Not evidence for
this tooling. Tooling proof: `node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs` **15/15**.

Inspected `/Users/shivamsaurav/vyd-worktrees/grin-combined` on
`integration/grin-g1-g5-source`. Application paths vs `5d5df3d` remain empty.

## Scope

Corrected command safety, stub tests, live read-only inspect, isolated Rules
config, A vs B vs C, rollback export.

## Findings

### Command safety — PASS

`INTERNAL_GRIN_DEPLOYMENT_PACKET.md` no longer offers copy-paste `printf` /
`test && firebase deploy` / `rm -f functions/.env.vyaamikk-diary`. Mutating
entry is `grin-functions-op.mjs`. Prechecks run before any deploy spawn.
CLI dotenv names are tested on disk **before** temp creation. Operator
`.env*` is never written or deleted. Temp dirs are `grin-ops-*` under
`os.tmpdir()` mode `0700`, cleaned on success, non-zero deploy status, and
SIGTERM. Deploy subprocess status is returned (failure case exit 17).
`GRIN_OPS_ALLOW_LIVE` unset refuses mutation.

### Firebase dotenv blocked; gcloud update alternative — PASS

Packet and tool mark `GRIN_OPS_METHOD=firebase-dotenv` blocked (replace
semantics). Enable/disable build
`gcloud functions deploy NAME --gen2 --region=asia-south1 --project=vyaamikk-diary --update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=true|false`
without `--source`. Local source origin aborts. `--set-env-vars` rejected.
Pure `applyGcloudGateUpdate` keeps unrelated keys when two endpoints differ.

### Stub tests — PASS (executed this review)

Required cases present and passing: existing `.env` / project dotenv /
alias conflict (bytes preserved, zero deploy logs); wrong pin; dirty
`functions/`; deploy failure status + temp gone; SIGTERM temp gone; success
seven `functions:grin*` and not `--only functions`; gcloud seven updates
without `--source`; existing remote GRIN blocks gate-off-initial create.

Official firebase-tools parser: quoted `"true"` and `true # inline` are
gate-true; `TRUE` is not.

### Live inspect — PASS (read-only)

Project `vyaamikk-diary` / `982505811909`. Bucket
`vyaamikk-diary.firebasestorage.app` same number. All seven GRIN names
**ABSENT**. 39 unrelated asia-south1 functions. Runtime SA
`982505811909-compute@developer.gserviceaccount.com` has project
`roles/editor` (delete residual via Editor, not a bucket-scoped
objectAdmin). Firestore/Storage sha256 match approved baseline. Export:
`docs/release/rules-compat/live-export-2026-10-06/`. Isolated
`firebase.rules-only.json` still hashes
`d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74`.
Repo `firebase.json` not retargeted.

### A / B / C — PASS

A = gcloud gate update on existing seven after origin check. B = admission
`newCommands=deny` (not in the Functions tool). C = no delete. Packet states
callable disable ≠ Storage upload disable ≠ data wipe.

### Rollback — PASS

Rollback Rules are the 2026-10-06 export files, not hardcoded October 1 IDs
as a universal target (IDs currently match because live did not drift).

## Defects

None on the assigned packet/tooling checks. `gcloud` is absent on this
workstation, so the enable/disable **alternative cannot be executed here**;
that is an apply-host requirement, not a logic defect. Firestore database
IAM HTTP 501 is recorded.

## Not claimed

Live deploy, NATIVE_DEVICE, EAS, Play, billing, `main` merge, Wave 2 / G6.
Application CI is not tooling CI.
