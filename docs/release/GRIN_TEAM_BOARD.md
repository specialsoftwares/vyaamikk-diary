# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement: one coordinator plus five **local** Cursor Task subagents on separate worktrees. AI roles, not human sign-off.

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Contract + ownership | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | source_verified | T2 M2 + T3 M3 merged; M1 open | T1 findings still open | Integrate T1 M1/M2 then T5 re-review |
| G1 mutations + deny-code findings | team1 | `team/grin-t1-backend` | `grin-t1-backend` | T5 `070a388` | running | `5c7543d` then M1/M2 | retention policy | Fix `not_found` + gate-before-validate |
| G2 reserve gate order | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | T5 M2 | source_verified | `8395ade` INJECTED_PORT pending_deletion+garbage → forbidden | live IAM | Team 5 re-review after M1/M3 |
| G3 outbox lease + reconcile type | team3 | `team/grin-t3-offline` | `grin-t3-offline` | T5 M3/L4 | source_verified | `7ff2f36` SQLITE_HOST; amend stays queued unleased | native death not claimed | Team 5 re-review after M1 |
| G4/G5 UI + pack (fixtures) | team4 | `team/grin-t4-product` | `grin-t4-product` | T5 approved-with-findings | source_verified | `355e575` | pricing/quota; Saved Records not wired | Wave 2 real adapters after M1–M3 |
| G6 implementation review | team5 | `team/grin-t5-qa` | `grin-t5-qa` | combined `e1d4898` | source_verified | `070a388` approved with findings | NATIVE_DEVICE pending | Re-review T1–T3 finding fixes |

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | Wave 1 approved with findings; G2 M2 and G3 M3/L4 on combined; M1 open |
| COMBINED SOURCE REVIEW | Wave 1 recorded (`070a388`); finding fixes not re-reviewed |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags remain `"0"` |
| PUBLIC RELEASE | not authorized |
