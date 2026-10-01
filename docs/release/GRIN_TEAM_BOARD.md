# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement: one coordinator plus five **local** Cursor Task subagents on separate worktrees. AI roles, not human sign-off.

Checkpoint inspected: `2593c2be6964955ecb1a433dc93c4096168ce9d2`. Combined now has T1 `cbcb1b9`, T2 `06d897a`, T3 `9a0de6d`, T4 `decac00`, T5 PHASE 1 `bff108c`. Wave 2 **not accepted** until Team 5 PHASE 2 reviews the integrated diffs.

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Integration + W2-05 orchestrator | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | review | T1–T4 merged; mutation payload not rewritten | Wave 2 not accepted | T5 PHASE 2 independent review |
| W2-06 G1 mobile-safe composition | team1 | `team/grin-t1-backend` | `grin-t1-backend` | Wave 2 port `091772e` | review | `cbcb1b9` composed callables + JS transport; Functions still unexported | live export HOLD; app still FAKE uninjected port | T5 PHASE 2 |
| W2-03 identity + W2-04 read policy | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | `4b10356` | review | `06d897a` identity + retained reads (isolated Rules) | live IAM | T5 PHASE 2 |
| W2-02 lease/attempt + W2-03 persist + W2-05 tests | team3 | `team/grin-t3-offline` | `grin-t3-offline` | `22a848a` | review | `9a0de6d` SQLITE_HOST attempt fence; production orchestrator tests | native death not claimed | T5 PHASE 2 |
| W2-01 stale session + remaining fixture screens | team4 | `team/grin-t4-product` | `grin-t4-product` | `786f73a` | review | `decac00` no self-revive; screens off fixtures | pricing/quota unresolved; FAKE G1 port | T5 PHASE 2 |
| Independent PHASE 2 review | team5 | `team/grin-t5-qa` | `grin-t5-qa` | combined after T1–T4 | running | PHASE 1 `bff108c` (not closure) | NATIVE_DEVICE | Review integrated diffs + switch remaining copied v10 test |

## Wave 2 correction findings

| ID | Finding | Owner | Status | Next |
|---|---|---|---|---|
| W2-01 | Retired repository `ensureSession()` calls `beginOwnerSession` and queues from a stale callback | team4 + team3 session API | review | T4 `decac00` landed; T5 PHASE 2 must re-execute |
| W2-02 | Ambiguous failure reconciles before retirement; attachments unfenced; same worker reclaims live lease | team3 | review | T3 `9a0de6d` landed; T5 PHASE 2 must re-execute |
| W2-03 | Verified R1 evidenceId returns durable for R2+different hash; missing category → invoice | team2 + team3 (`ports.ts`) | review | T2 `06d897a` + T3 ports landed; T5 PHASE 2 must re-execute |
| W2-04 | Storage original read requires reserved/uploading, so verify/link drops client read | team2 | review | T2 isolated matrix landed; live Rules unchanged; T5 PHASE 2 |
| W2-05 | v9→v10 tests copied init sequence | team3 + coordinator; T5 validates | review | T3 production-orchestrator test landed; T5 ER-4 file still copies until PHASE 2 |

Previous ER-1…ER-5 remain mapped (SQLITE_HOST / INJECTED / isolated emulator). Mapping is not Wave 2 acceptance.

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | W2-01…W2-06 source on combined; T5 PHASE 2 pending; **not accepted** |
| COMBINED SOURCE REVIEW | Wave 1 only; Wave 2 corrections not independently reviewed on the merged tree |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags `"0"` |
| PUBLIC RELEASE | not authorized |
