# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement: one coordinator plus five **local** Cursor Task subagents on separate worktrees. AI roles, not human sign-off.

Checkpoint inspected: `2593c2be6964955ecb1a433dc93c4096168ce9d2`. Combined reviewed at `e94b78c`; T5 PHASE 2 `3fe4071`. Inspected W2-01…W2-05 **reproduced-then-fixed**. Wave 2 **not accepted** (FAKE app G1 port, Functions unexported, live Rules unchanged, native/Play/GST open).

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Integration | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | review | T5 PHASE 2 `3fe4071` | Wave 2 not accepted | Wire app G1 transport; exact-head `ci:verify` |
| W2-06 G1 mobile-safe composition | team1 | `team/grin-t1-backend` | `grin-t1-backend` | `cbcb1b9` | source_verified | composed + JS transport; Functions unexported | live export HOLD | Stay unexported |
| W2-03 identity + W2-04 read policy | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | `06d897a` | source_verified | T5 PHASE 2 isolated retained reads | live IAM | Keep live Rules unchanged |
| W2-02 lease/attempt + W2-05 tests | team3 | `team/grin-t3-offline` | `grin-t3-offline` | `9a0de6d` | source_verified | T5 PHASE 2 SQLITE_HOST fence | native death not claimed | — |
| W2-01 session bind + screens | team4 | `team/grin-t4-product` | `grin-t4-product` | `decac00` | running | T5 PHASE 2 no self-revive | pricing/quota; FAKE G1 in appBinding | Bind T1 JS transport behind admission |
| Independent PHASE 2 review | team5 | `team/grin-t5-qa` | `grin-t5-qa` | `e94b78c` | source_verified | `3fe4071` WAVE2_PHASE2_REVIEW.md | NATIVE_DEVICE | Re-review app G1 wiring after T4 |

## Wave 2 correction findings

| ID | Finding | Owner | Status | Next |
|---|---|---|---|---|
| W2-01 | Retired repository self-revived sessions | team4 + team3 | source_verified | T5 PHASE 2 `3fe4071`; not NATIVE_DEVICE |
| W2-02 | Lease reclaim / reconcile-before-retirement / unfenced attachments | team3 | source_verified | T5 PHASE 2 `3fe4071`; SQLITE_HOST only |
| W2-03 | R1 verified id durable for R2+hash; missing category → invoice | team2 + team3 | source_verified | T5 PHASE 2 `3fe4071`; `c2ef669` still not this proof |
| W2-04 | Isolated original read required reserved/uploading | team2 | source_verified | T5 PHASE 2 isolated emulator; live Rules unchanged |
| W2-05 | v9→v10 tests copied init sequence | team3 + coordinator; T5 | source_verified | T5 ER-4 now calls production orchestrator |

Previous ER-1…ER-5 remain mapped (SQLITE_HOST / INJECTED / isolated emulator). Mapping is not Wave 2 acceptance.

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | W2 findings independently closed at stated host/injected/emulator boundary; app G1 still FAKE; **Wave 2 not accepted** |
| COMBINED SOURCE REVIEW | T5 PHASE 2 `3fe4071` of `e94b78c`; remaining FAKE app port not reviewed as closed |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags `"0"` |
| PUBLIC RELEASE | not authorized |
