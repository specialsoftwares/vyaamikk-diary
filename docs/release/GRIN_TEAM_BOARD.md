# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement: one coordinator plus five **local** Cursor Task subagents on separate worktrees. AI roles, not human sign-off.

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Contract + ownership | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | source_verified | T5 re-review `6f920cd` merged | Wave 2 adapters | Integrate Wave 2 team commits |
| G1 injected server port for outbox | team1 | `team/grin-t1-backend` | `grin-t1-backend` | M1/M2 approved | running | `00273f1` | no Functions export | Wave 2 `createInjectedGrinServerPort` |
| G2 injected evidence port for outbox | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | M2 approved | running | `8395ade` | live IAM | Wave 2 evidence port for SQLITE_HOST |
| G3 outbox ↔ real G1 adapter | team3 | `team/grin-t3-offline` | `grin-t3-offline` | M3 approved | running | `7ff2f36` | native death not claimed | CS-01 SQLITE_HOST + INJECTED G1 |
| G4 replace fixture screens | team4 | `team/grin-t4-product` | `grin-t4-product` | T5 findings closed | running | `355e575` fixtures | pricing/quota | Outbox-backed repository; keep FAKE labelled |
| G6 findings re-review | team5 | `team/grin-t5-qa` | `grin-t5-qa` | combined `9cd0928` | source_verified | `6f920cd` M1–M3 closed | NATIVE_DEVICE pending | Review Wave 2 diffs later |

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | Wave 1 findings closed; Wave 2 adapter wiring running |
| COMBINED SOURCE REVIEW | Wave 1 + findings re-review recorded; Wave 2 not reviewed |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags remain `"0"` |
| PUBLIC RELEASE | not authorized |
