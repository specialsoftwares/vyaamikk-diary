# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement (2026-10-01): one coordinator plus five **local** Cursor Task subagents, each on a separate git worktree/branch. These are AI agent roles, not human engineering sign-off.

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Contract + ownership | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | source_verified | `wave1b` after Team 5 review | teams 1–4 still on wave1 head | acknowledge wave1b after T1–T4 land |
| G1 undefined-object normalize + mutations + Functions packaging | team1 | `team/grin-t1-backend` | `grin-t1-backend` | contract wave1b | running | uncommitted | must extend GoodsCommandType; stored mutation reconcile | Wave 1 implementation |
| G2 evidence lifecycle | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | contract ports | running | uncommitted | live IAM not in scope; category bound to EvidenceCategory | Wave 1 |
| G3 SQLite outbox | team3 | `team/grin-t3-offline` | `grin-t3-offline` | command/result ports | running | uncommitted | native death not claimed | Wave 1 |
| G4/G5 UI + pack (fixtures first) | team4 | `team/grin-t4-product` | `grin-t4-product` | ports + labelled fakes | running | uncommitted | all ten exception evaluators; no ITC clearance | Wave 1 |
| G6 matrix + independent contract review | team5 | `team/grin-t5-qa` | `grin-t5-qa` | wave1 contract | source_verified | `df5f0a5` 137 IDs; implementations not approved | NATIVE_DEVICE pending | re-ack wave1b; review T1–T4 diffs |

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | in progress (Wave 1) |
| COMBINED SOURCE REVIEW | not started |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags remain `"0"` |
| PUBLIC RELEASE | not authorized |
