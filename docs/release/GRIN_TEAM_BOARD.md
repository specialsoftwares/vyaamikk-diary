# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement: one coordinator plus five **local** Cursor Task subagents on separate worktrees. AI roles, not human sign-off.

Checkpoint inspected: `2593c2be6964955ecb1a433dc93c4096168ce9d2`. Combined reviewed at `e94b78c`; T5 PHASE 2 `3fe4071`. Inspected W2-01…W2-05 **reproduced-then-fixed**. Wave 2 **not accepted**.

T1–T4 application findings are merged onto combined pending Team 5 independent review of production paths. Functions remain unexported.

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Integration | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | review | T1+T2+T3+T4 merged; scripts updated | F5 not run | Team 5 production-path review; exact-head `ci:verify` |
| F2/F4 G1 readReceipt + transport | team1 | `team/grin-t1-backend` | `grin-t1-backend` | `4b560cd` | source_verified | composed readReceipt; parseRemote; Functions unexported | live export HOLD | Stay unexported |
| F3 retrieve + pack inputs | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | `3ddd4f9` | source_verified | INJECTED + STORAGE_EMULATOR pack A/B | live IAM | Keep live Rules unchanged |
| F1/F2 outbox confirmed + session token | team3 | `team/grin-t3-offline` | `grin-t3-offline` | `fa6d4a7` | source_verified | SQLITE_HOST joined register→amend | native death not claimed | — |
| F1 origin screens + F2/F3 repo | team4 | `team/grin-t4-product` | `grin-t4-product` | `26b602a` | source_verified | origin.bind actual bodies; assembleEvidencePackInputs | pricing/quota | — |
| Independent F5 review | team5 | `team/grin-t5-qa` | `grin-t5-qa` | combined after T1–T4 | ready | — | NATIVE_DEVICE | Review integrated production paths |

## Wave 2 correction findings (closed at stated boundary; not Wave 2 acceptance)

| ID | Finding | Owner | Status | Next |
|---|---|---|---|---|
| W2-01 | Retired repository self-revived sessions | team4 + team3 | source_verified | T5 PHASE 2 `3fe4071`; not NATIVE_DEVICE |
| W2-02 | Lease reclaim / reconcile-before-retirement / unfenced attachments | team3 | source_verified | T5 PHASE 2 `3fe4071`; SQLITE_HOST only |
| W2-03 | R1 verified id durable for R2+hash; missing category → invoice | team2 + team3 | source_verified | T5 PHASE 2 `3fe4071`; `c2ef669` still not this proof |
| W2-04 | Isolated original read required reserved/uploading | team2 | source_verified | T5 PHASE 2 isolated emulator; live Rules unchanged |
| W2-05 | v9→v10 tests copied init sequence | team3 + coordinator; T5 | source_verified | T5 ER-4 now calls production orchestrator |

## Application findings (open until Team 5 independently executes)

| ID | Finding | Owner | Status | Next |
|---|---|---|---|---|
| F1 | Screen `onSave` recaptured live repo; A→B dispatched A's values on B | team4 + team3 | source_verified | T4 `26b602a` origin bind + T3 live token; T5 must re-execute actual screen bodies |
| F2 | `clientExpectedVersion()` always `0` | team1 + team3 + team4 | source_verified | T3 persist + T1 readReceipt + T4 fail-closed; T5 joined flow |
| F3 | Attachments list-only; placeholder pack | team2 + team4 + team3 | source_verified | T2 pack inputs + T4 exportPack/capture; T5 pack A/B |
| F4 | Transport composition not emulator-proven | team1 + team4 + coordinator | source_verified | T1 parseRemote + composed tests; T5 must not treat source-graph as e2e |

Previous ER-1…ER-5 remain mapped. Mapping is not Wave 2 acceptance.

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | T1–T4 F1–F4 source landed on combined; **not independently reviewed**; **Wave 2 not accepted** |
| COMBINED SOURCE REVIEW | T5 PHASE 2 of `e94b78c` only; F1–F4 merged tree not reviewed |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags `"0"` |
| PUBLIC RELEASE | not authorized |
