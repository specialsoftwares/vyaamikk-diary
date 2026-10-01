# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement: one coordinator plus five **local** Cursor Task subagents on separate worktrees. AI roles, not human sign-off.

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Contract + ownership | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | source_verified | M1–M3 on combined (`3088026`) | Team 5 re-review of finding fixes | Wave 2 adapters after re-review |
| G1 mutations + deny-code findings | team1 | `team/grin-t1-backend` | `grin-t1-backend` | T5 `070a388` | source_verified | `00273f1` INJECTED + FIRESTORE 8088 | retention policy | Team 5 re-review |
| G2 reserve gate order | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | T5 M2 | source_verified | `8395ade` INJECTED_PORT | live IAM | Team 5 re-review |
| G3 outbox lease + reconcile type | team3 | `team/grin-t3-offline` | `grin-t3-offline` | T5 M3/L4 | source_verified | `7ff2f36` SQLITE_HOST | native death not claimed | Team 5 re-review |
| G4/G5 UI + pack (fixtures) | team4 | `team/grin-t4-product` | `grin-t4-product` | T5 approved-with-findings | source_verified | `355e575` | pricing/quota; Saved Records not wired | Wave 2 real adapters after re-review |
| G6 findings re-review | team5 | `team/grin-t5-qa` | `grin-t5-qa` | combined with M1–M3 | review | `070a388` Wave 1; finding fixes not yet re-reviewed | NATIVE_DEVICE pending | Re-review M1–M3 on combined |

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | Wave 1 approved with findings; M1–M3 merged, awaiting re-review |
| COMBINED SOURCE REVIEW | Wave 1 recorded; finding-fix re-review running |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags remain `"0"` |
| PUBLIC RELEASE | not authorized |
