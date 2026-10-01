# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement: one coordinator plus five **local** Cursor Task subagents on separate worktrees. AI roles, not human sign-off.

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Contract + ownership | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | source_verified | T1–T5 Wave 2 merged; ER-1…ER-5 mapped | Wave 2 source review | Independent T5 review of Wave 2 diffs; do not accept Wave 2 |
| G1 injected server port | team1 | `team/grin-t1-backend` | `grin-t1-backend` | M1/M2 approved | review | `091772e` INJECTED `createInjectedGrinServerPort`; no ER assigned | Functions unexported | T5 Wave 2 source review |
| G2 injected evidence port + ER-2/ER-3 | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | M2 approved | review | `4b10356` INJECTED evidencePort; ER-2/ER-3 tested | live IAM | T5 Wave 2 source review |
| G3 CS-01 interop + ER-1/ER-4 | team3 | `team/grin-t3-offline` | `grin-t3-offline` | M3 approved | review | `22a848a` CS-01/ER-1/ER-4 T3 | native death not claimed | T5 Wave 2 source review |
| G4 outbox-backed repository | team4 | `team/grin-t4-product` | `grin-t4-product` | T5 findings closed | review | `786f73a` list/create/detail → GrinOutbox; mutate/pack still FAKE | pricing/quota; app G1 still uninjected | T5 Wave 2 source review |
| G6 + ER-4/ER-5 | team5 | `team/grin-t5-qa` | `grin-t5-qa` | combined Wave 2 | review | `525233f` ER-4 QA + CS host/injected slices; stubs not passes | NATIVE_DEVICE pending | Wave 2 source review of T1–T4; G6 incomplete |

## External-review findings

| ID | Finding | Owner | Status | Evidence / residual |
|---|---|---|---|---|
| ER-1 | Retired-session completion and lease fencing in the outbox | team3 | **fix+test landed** | `22a848a` `skipStaleCompletion`; SQLITE_HOST. Not NATIVE_DEVICE. Attachment post-await write not in the diagnosed path. |
| ER-2 | Recheck authorization inside the final evidence-write transaction after awaited file operations | team2 | **fix+test landed** | `4b10356` `commitState` re-`authorize()`; INJECTED_PORT pending_deletion/admission after blob I/O |
| ER-3 | Direct Storage SDK vs reservation/account/admission | team2 | **fix+test landed** (isolated only) | Isolated `storage.rules` + SDK tests. Live `storage.rules` unchanged; live IAM unproven |
| ER-4 | Real v9→v10 startup, including GRIN-off | team3 + team5 | **fix+test landed** (SQLITE_HOST) | T3 `migrateGrin.v9Startup.sqliteHost.test.ts`; T5 `tools/grin-acceptance/startup/v9-v10-grin-off.sqliteHost.test.ts` (`isGoodsEvidenceEnabled()` false; diary kept). `init.ts` unchanged. Not NATIVE_DEVICE |
| ER-5 | Execute combined workflows; ID stubs are not passes | team5 | **host/injected slices executed; not a G6 pass** | `525233f` `runWorkflows.ts` + `WAVE2_ER45.md`. CS-01 via Team 3 interop (not duplicated). `runIds.ts` / `scenarios/cs*.test.ts` remain ID stubs. Matrix statuses stay `path_present_unapproved` / `device_pending`. CS-08/09 not live GST. CS-11 isolation only |

Wave 2 is **not accepted**. Mapping ER-1…ER-5 to tests is not combined source review, device acceptance, billing, or public release.

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | Wave 2 source on combined; **not accepted**; T5 Wave 2 source review pending |
| COMBINED SOURCE REVIEW | Wave 1 + findings re-review recorded; Wave 2 not reviewed |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags remain `"0"` |
| PUBLIC RELEASE | not authorized |
