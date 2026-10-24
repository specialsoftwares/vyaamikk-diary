# Internal GRIN ops-guard review (Team 5)

AI QA / release-gate role, not human certification. Independent of the
implementation pass. **Ops-guard tooling only.** Domain / boot /
diagnostics / file-IO suites were not re-run. Wave 2 is **not** accepted.
Not live deploy. `GRIN_OPS_ALLOW_LIVE=1` was **not** pointed at live cloud.

Application SHA: `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47`
Starting tooling SHA (defective): `520b42bd584b9d2d9494bc7d9a71dba131f17944`
Canonical application CI: `37351685421` / `111903806888`. Not evidence for
this tooling. Tooling proof this review:
`node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs`
**34/34** (0 fail). Subset re-run: `HTTP 403 inspect reports UNKNOWN not
allGrinAbsent` and `live mode rejects endpoint fixture before mutation`
**2/2**.

Inspected `/Users/shivamsaurav/vyd-worktrees/grin-combined` on
`integration/grin-g1-g5-source` (HEAD still `520b42b`; correction is the
working tree). Application paths vs `5d5df3d` remain empty.

## Scope

Reproduce fail-closed inspection (A) and test-vs-live isolation (B) at
`520b42b`, then confirm the working-tree correction in
`docs/release/packets/grin-ops/grin-functions-op.mjs`. Packet labelling of
the 2026-10-06 read-only inspect is in scope. Wave 2 is not accepted. Live
Functions/Rules/IAM/env writes were not executed.

## Findings

### Application tree equality vs `5d5df3d` — PASS

`git diff --stat 5d5df3d54df08953bfb26db39a9b7f5e3d67ed47 -- functions src
eas.json app.json app firebase.json` is empty. This review did not edit
those paths.

### Fail-closed inspection (A) — PASS (defect reproduced, then corrected)

**Before (`git show 520b42b:docs/release/packets/grin-ops/grin-functions-op.mjs`):**

- `inspectLive` mapped `(fnList.json?.functions || [])` and ignored HTTP
  status (`grin-functions-op.mjs:560` at that SHA). Executed that
  expression with `{status:403, json:{error:"forbidden"}}`: listed
  length **0**, then `allGrinAbsent=true` (`:718`,
  `every((n) => !grin[n].exists)`). 403 became empty list / all-absent.
- Single list URL `pageSize=200` (`:557`). No `nextPageToken` loop.
- `loadEndpointFixture` on missing input synthesized seven
  `{exists:false}` (`defaultEndpointFixtureAllAbsent`, `:316–323`).
  `loadEndpointFixture("{}")` returned `{}`. `assertAllAbsent` only
  aborted on `fixture[name]?.exists` (`:328–335`). Executed: both `{}`
  and the synthesized map **passed** as absent.
- Failed Rules export used `file?.content || ""` (`:660`) and
  `writeFileSync(..., firestoreRules.content || "", ...)` /
  `storage.rules` (`:745–746`) over existing files.
- DB IAM used `dbIam.json?.bindings || []` (`:619`) with no 501 branch.
  Executed `{status:501, json:{error:{status:"UNIMPLEMENTED"}}}`: **empty
  roles**, not unsupported/unknown.

**After (working tree `docs/release/packets/grin-ops/grin-functions-op.mjs`):**

- Presence constants PRESENT / ABSENT / UNKNOWN (`:62–64`).
- `listFunctionsPaginated` (`:673–708`) requires HTTP 200, `parseOk`,
  object shape, `functions` array-or-omitted, and loops `nextPageToken`
  (max 50 pages). Non-200 / malformed / bad shape / pagination limit →
  `{complete:false}` and reason `http|malformed|shape|pagination_limit`.
- `inspectLive` (`:768–784`): incomplete inventory sets every GRIN name
  UNKNOWN and `allGrinAbsent` only if complete **and** every presence is
  ABSENT. Direct `inspectLive` + HTTP stub 403 this review:
  `functionsInventory.status=403 complete=false allGrinAbsent=false
  presence=unknown`.
- `requireCompleteInventory` / `requireVerifiedIdentity` (`:431–446`)
  block deploy; `main` inspect (`:1040–1051`) and live
  `resolveEndpointFixture` (`:455–462`) call both. Incomplete = UNKNOWN
  blocks deploy.
- `loadEndpointFixture` (`:348–381`) rejects missing / non-object /
  incomplete keys / invalid presence. `assertAllAbsent` (`:383–396`)
  treats missing or UNKNOWN as refuse, PRESENT as already-exists.
  Executed: `"{}"` and partial fixture abort with `incomplete is not
  absent`.
- `writeRollbackIfSuccessful` (`:727–733`) writes only if `ok` and
  non-empty string content. `inspectLive` export (`:956–968`) uses it.
  Executed: previous `KEEP_ME\n` bytes unchanged; `written=false`.
- DB IAM 501 → `firestoreDbIamState="unsupported"` (`:817–822`); roles
  filled only when state is `ok` (`:823–830`). Direct inspect this
  review: `dbIamHttp=501 dbIamState=unsupported`.

Tests: `Functions list HTTP 401|403|500 is UNKNOWN and does not deploy`,
`malformed Functions JSON is UNKNOWN and does not deploy`, `invalid
Functions list shape is UNKNOWN and does not deploy`, `interrupted
pagination is UNKNOWN and does not deploy`, `later inventory page with
existing GRIN function refuses initial-create`, `empty fixture is
rejected and is not absent`, `partial fixture is rejected and is not
absent`, `failed Rules export leaves previous rollback bytes unchanged`,
`HTTP 403 inspect reports UNKNOWN not allGrinAbsent`, `valid complete
inventory inspect reports absence not unknown`.

### Test vs live isolation (B) — PASS (defect reproduced, then corrected)

**Before (`520b42b`):**

- `resolveEndpointFixture` (`:369–376`) returned
  `loadEndpointFixture(GRIN_OPS_ENDPOINT_FIXTURE)` **before** any live
  inspect. Executed `GRIN_OPS_ALLOW_LIVE=1` + `GRIN_OPS_ENDPOINT_FIXTURE={}`:
  inspect **skipped**, `assertAllAbsent({})` **passed** (would proceed).
- `pinnedAppSha` (`:78–80`) always `env("GRIN_OPS_PINNED_SHA", PINNED_APP_SHA)`.
  Executed with live env + `deadbeef…`: pin **honored** (not
  `5d5df3d…`).
- `firebaseBin` / `gcloudBin` (`:379–384`) `env("FIREBASE_BIN", "firebase")`
  / `env("GCLOUD_BIN", "gcloud")`. Executed unset: PATH names **firebase**
  / **gcloud**.
- No live-override reject list. `GRIN_OPS_TEST_HANG` ran in any mode.

**After (working tree):**

- `LIVE_FORBIDDEN_ENV` (`:66–73`): `GRIN_OPS_ENDPOINT_FIXTURE`,
  `GRIN_OPS_PINNED_SHA`, `GRIN_OPS_TEST_HANG`, `GRIN_OPS_HTTP_STUB`,
  `FIREBASE_BIN`, `GCLOUD_BIN`.
- `assertLiveOverridesRejected` (`:106–112`) aborts those when
  `allowLive()==="1"` **before** inspection or mutation. `main` (`:1040`)
  runs it first. Live `resolveEndpointFixture` (`:457–458`) runs it before
  `inspectLive`. Executed all six names: each aborts
  `live mode rejects test overrides (...) before inspection or mutation`.
- Live pin is constant `PINNED_APP_SHA`
  `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` (`:27`, `:101–104`).
  Executed `GRIN_OPS_ALLOW_LIVE=1` + `GRIN_OPS_PINNED_SHA=deadbeef…`:
  `pinnedAppSha()` still `5d5df3d…`.
- Stub `firebaseBin` / `gcloudBin` (`:476–495`) require an **absolute**
  existing injected executor; names `firebase`/`gcloud` and PATH fallback
  abort. Live returns the real CLI names only after overrides are
  rejected.
- Tests: `live mode rejects endpoint fixture before mutation`, `live mode
  rejects source-pin override before mutation`, `live mode rejects
  test-hang override before mutation`, `stub mode without explicit
  executor does not fall back to PATH`. HTTP_STUB / FIREBASE_BIN /
  GCLOUD_BIN have no extra CLI test names; the same helper was executed
  this review for those three.

### Verified identity before deploy; preserved prechecks — PASS

`requireVerifiedIdentity` (`:431–438`) requires project HTTP 200 +
expected id/number and bucket HTTP 200 + membership. Tests: `failed
project identity check does not deploy`, `failed bucket membership check
does not deploy`.

Still present and passing from the prior packet review: dotenv
non-overwrite (`assertNoCliDotenv` `:292–305`; tests `existing .env`,
`existing project dotenv`, `conflicting alias dotenv`); dirty/untracked
deployment inputs (`assertCleanDeploymentInputs` `:277–290`; test `dirty
deployment inputs abort`); seven-function `--only` /
`gcloud functions deploy NAME` without `--source` (`:187–227`; tests
`firebase --only list is exactly seven GRIN names`, `successful simulated
gate-off`, `successful simulated enable`); deploy status retained (test
exit **17**, no PASS); temp dirs `grin-ops-*` under `os.tmpdir()` mode
`0700`, cleaned on failure and SIGTERM (`:307–321`, `:511–527`).

`applyGcloudGateUpdate` remains a pure merge helper (`:161–169`). It is
not real-deploy proof.

### Packet 2026-10-06 labelling — PASS

`docs/release/packets/INTERNAL_GRIN_DEPLOYMENT_PACKET.md` §3 states the
2026-10-06 reads **succeeded** and are **not** relabelled failed because
later tooling lacked guards (`:62–69`). Editor residual is existing
`roles/editor` broad privilege (`:82`). Firestore database IAM HTTP 501
is **unsupported / unknown**, not empty-policy (`:83`). Isolated
Firestore Rules remains a **separate** owner approval, not executed
(§10 `:262–287`). `GRIN_OPS_ALLOW_LIVE=1` remains HOLD (`:177`).

## Defects

None on the assigned ops-guard A/B correction, packet labelling, or the
executed stub suite. Dedicated CLI tests name three of six live
overrides; the other three share `assertLiveOverridesRejected` and were
executed here.

## Remaining approval boundary

HOLD: `GRIN_OPS_ALLOW_LIVE=1` against live cloud. Functions create /
enable / disable, Rules deploy, IAM writes, env writes, tester seeding,
EAS / Play / billing / `main` merge: not authorized and not executed.
Enable/disable still needs gcloud on an apply host.
`applyGcloudGateUpdate` is not proof a real gcloud deploy preserves
configuration. Isolated GRIN Rules is a separate owner approval.

## Not claimed

Live mutation, NATIVE_DEVICE, EAS, Play, billing, `main` merge, Wave 2 /
G6. Application CI is not tooling CI. This review is not human
certification.
