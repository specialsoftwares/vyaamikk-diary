# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement (2026-10-01): one coordinator plus five **local** Cursor Task subagents, each on a separate git worktree/branch. These are AI agent roles, not human engineering sign-off.

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Contract + ownership | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | source_verified | `3fe5c46` packaging + CI scripts; callables unexported | Team 5 must review T1–T4 diffs independently | Wave 2 after T5 implementation review |
| G1 undefined-object normalize + mutations + Functions packaging | team1 | `team/grin-t1-backend` | `grin-t1-backend` | contract wave1b | source_verified | `5c7543d` INJECTED + Firestore emulator; callables unexported | retention policy; live Admin wiring | Wave 2 callable export decision |
| G2 evidence lifecycle | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | contract ports | source_verified | `8989b48` STORAGE + FIRESTORE emulator | live IAM not proven | Wave 2 link to Team 1 |
| G3 SQLite outbox | team3 | `team/grin-t3-offline` | `grin-t3-offline` | command/result ports | source_verified | `3c1303b` SQLITE_HOST; catch fix reviewed | native death not claimed; FAKE server port | Wave 2 inject real G1 adapter |
| G4/G5 UI + pack (fixtures first) | team4 | `team/grin-t4-product` | `grin-t4-product` | ports + labelled fakes | source_verified | `355e575` fixtures; i18n; gated screens | pricing/quota unresolved; Saved Records tile not wired | Wave 2 real adapters |
| G6 matrix + independent contract review | team5 | `team/grin-t5-qa` | `grin-t5-qa` | wave1 contract | source_verified | `df5f0a5` 137 IDs; implementations not approved | NATIVE_DEVICE pending | review T1–T4 diffs on combined |

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | in progress (Wave 1 source merged; Wave 2 wiring remaining) |
| COMBINED SOURCE REVIEW | not started (Team 5 must read T1–T4 diffs) |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags remain `"0"` |
| PUBLIC RELEASE | not authorized |
