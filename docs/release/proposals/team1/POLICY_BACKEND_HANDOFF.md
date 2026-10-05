# Team 1 policy / backend handoff (isolated source)

Not authorization. Not live deploy. `GRIN_OPS_ALLOW_LIVE` was **unset**.
`DELETION_GRACE_MS` was **not** changed. Shared Editor account was **not**
changed. `grin-functions-op.mjs` was **not** rewritten.
`live-export-2026-10-06` was **not** overwritten (hashes did not drift).

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t1-backend`
Branch: `team/grin-t1-backend`

| Pin | Value |
|---|---|
| Starting SHA | `aa5253e4e070195227055cde836d6b528d5e0070` |
| Final SHA | *filled after commit* |
| Application SHA (accepted) | `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` |
| Ops tooling SHA (accepted) | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` |
| firebase-tools | **14.20.0** (installed CLI + `package.json`) |
| gcloud | **not installed** |

## Files (this Team 1 slice)

| Path | Role |
|---|---|
| `docs/release/proposals/team1/FIREBASE_CLI_ENABLE_DISABLE.md` | Supported enable/disable method from installed CLI source |
| `docs/release/proposals/team1/firebase-tools-14.20.0-infer-details.test.mjs` | In-process `inferDetailsFromExisting` (merge vs replace); not live |
| `docs/release/proposals/team1/CREATE_ABSENT_ONLY_PROPOSAL.md` | Mixed-state resume proposal |
| `docs/release/proposals/team1/grin-functions-absent-only.mjs` | Fail-closed planner; no firebase/gcloud spawn |
| `docs/release/proposals/team1/grin-functions-absent-only.test.mjs` | Planner tests |
| `docs/release/proposals/team1/AUTH_ADMISSION_COVERAGE.md` | Coverage table refreshed after EMULATOR/SOURCE adds |
| `docs/release/proposals/unapplied/GRIN_RUNTIME_IDENTITY_PROPOSAL.md` | **Unchanged** |
| `tools/goods-evidence-emulator/production-compose.gates.emulator.test.ts` | EMULATOR GAP tests |
| `tools/goods-evidence-emulator/production-exports.injected.unit.test.ts` | SOURCE `auth: null` register + uploadEvidence |
| `tools/goods-evidence-emulator/composed.injected.unit.test.ts` | SOURCE begin/upload unauthenticated closed result |
| `tools/goods-evidence-emulator/packaging.unit.test.ts` | SOURCE all seven stub `handleGrin*` with `null` |
| `docs/release/proposals/team1/POLICY_BACKEND_HANDOFF.md` | This file |

Not edited (forbidden / shared): `package.json`, lockfiles, workflows, `app.json`,
`eas.json`, `firebase.json`, `functions/src/index.ts`, live Rules,
`docs/release/packets/grin-ops/grin-functions-op.mjs`,
`docs/release/rules-compat/live-export-2026-10-06/**`.

## Tests run (command + exit)

| Command | Exit | Label |
|---|---|---|
| `node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs docs/release/proposals/team1/grin-functions-absent-only.test.mjs docs/release/proposals/team1/firebase-tools-14.20.0-infer-details.test.mjs` | **0** (43/43; guard tool still 34/34) | STUB + SOURCE CLI |
| `npx --yes tsx tools/goods-evidence-emulator/production-exports.injected.unit.test.ts` | **0** | INJECTED / SOURCE |
| `npx --yes tsx tools/goods-evidence-emulator/composed.injected.unit.test.ts` | **0** | INJECTED / SOURCE |
| `npx --yes tsx tools/goods-evidence-emulator/packaging.unit.test.ts` | **0** | INJECTED / SOURCE |
| `npm run test:goods-evidence-g1-functions-emulator` | **0** | EMULATOR / PRODUCTION_ADMIN_COMPOSED |
| `node docs/release/packets/grin-ops/grin-functions-op.mjs inspect` (no `GRIN_OPS_EXPORT_DIR`, no `GRIN_OPS_ALLOW_LIVE`) | **0** | LIVE_INSPECT_READONLY |

## Evidence labels

- **SOURCE**: firebase-tools 14.20.0 `inferDetailsFromExisting` merge (no dotenv) vs replace (dotenv); new endpoints skip merge.
- **STUB**: existing ops-guard suite unchanged 34/34; planner mixed 3 PRESENT + 4 ABSENT argv; UNKNOWN/all-absent/all-present refuse; journal has no env values.
- **EMULATOR**: production-compose unauth on remaining callables; non-admitted read/begin/upload; OTHER register/mutate/reserve; inactive/pending reconcile/mutate/read (including no replay after status flip); retired register/reserve/mutate; malformed register envelope; mutate replay; `version_conflict`.
- **LIVE_INSPECT_READONLY** (2026-10-06 refresh, this session): project `vyaamikk-diary` / `982505811909` HTTP 200; bucket `vyaamikk-diary.firebasestorage.app` belongs; inventory complete HTTP 200 pages=1; seven GRIN **ABSENT**; unrelated=39; runtime SA `982505811909-compute@developer.gserviceaccount.com` `roles/editor`; Firestore sha256 `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` = baseline; Storage sha256 `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` = baseline. **Not overwritten.**

`applyGcloudGateUpdate` is still a pure helper, not deployment proof.

## A1 still independently offerable

Isolated Firestore Rules only, later owner approval, still ready to offer:

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  --only firestore:rules
```

Config sha256 `d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74`.
Merged Firestore `551203b8…`. Live baseline still `b13d5255…`. Not Storage, not
Functions, not IAM. Never repo-root quota Firestore (`233b05b7…`).

## Enable / disable remaining uncertainty

Firebase dotenv enable/disable remains **blocked** (replace, not merge) —
SOURCE-confirmed on the installed 14.20.0 CLI.

Supported later enable/disable remains **gcloud** `--update-env-vars` without
`--source` after inspect shows `gcs` or `repo`. **UNPROVEN** on a
firebase-created gen2 callable. gcloud is absent here. Do not enable live GRIN
to obtain that evidence.

## Mixed-state

Current guard tool still **stuck** on mixed PRESENT/ABSENT (`assertAllAbsent` /
`assertAllPresentForGateUpdate`). Planner exists and is tested; **not wired**
into `grin-functions-op.mjs`. Do not blindly retry all-seven create.

## Remaining HOLD (approval still required)

A2 Storage Rules; A3 `gate-off-initial`; A4 tester admission; A5 new GRIN SA
IAM (proposal only; do not alter shared Editor); A6 enable; A7 LIVE_BACKEND
smoke; scratch gcloud preservation evidence; EAS; Play; billing; `main` merge;
production purge job (Team 2; not added here).

## Auth GAP tests added vs still GAP

Added (now COVERED on production compose EMULATOR unless noted): unauth on all
seven; non-admitted read/begin/upload; OTHER register/mutate/reserve;
inactive/pending reconcile/mutate/read including no replay exception; retired
register/reserve/mutate; malformed register envelope; mutate replay;
`version_conflict`. SOURCE: `auth: null` register + uploadEvidence through
`runProductionGrinCallable`; composed begin/upload closed without `code`; all
seven stub handlers with `null`.

Still GAP: OTHER begin/upload; inactive/pending evidence reserve/begin/upload;
retired read/reconcile; composed `reserveEvidence` unauth; `runProductionGrinCallable`
unauth on the other five names; `wrapGrin` onCall not invoked; unknown mutate
type on composed; LIVE_BACKEND.
