# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement: one coordinator plus five **local** Cursor Task subagents on separate worktrees. AI roles, not human sign-off.

Checkpoint inspected: `2593c2be6964955ecb1a433dc93c4096168ce9d2`. Combined advanced with coordinator W2-05 extract + T5 `c2ef669` (CS-02 via evidence port; T5 test is **not** independent approval of W2-03).

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Contract + W2-05 orchestrator | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | running | `applyPendingLocalMigrations` extracted from `init.ts` | Wave 2 not accepted | Integrate W2-01…W2-05; T5 independent review |
| W2-06 G1 mobile-safe composition | team1 | `team/grin-t1-backend` | `grin-t1-backend` | Wave 2 port `091772e` | running | Functions still unexported | live export HOLD | Authenticated transport + emulator composition |
| W2-03 identity + W2-04 read policy | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | `4b10356` | running | ER-2 commitState kept | live IAM | Category/receipt identity; post-verify reads |
| W2-02 lease/attempt + W2-03 persist + W2-05 tests | team3 | `team/grin-t3-offline` | `grin-t3-offline` | `22a848a` | running | ER-1 skipStaleCompletion | native death not claimed | Unique attempt fence; call production orchestrator |
| W2-01 stale session + remaining fixture screens | team4 | `team/grin-t4-product` | `grin-t4-product` | `786f73a` | running | list/create/detail outbox | pricing/quota unresolved | No self-revive; switch amend/QC/EWB/return/pack |
| Independent review + executed workflows | team5 | `team/grin-t5-qa` | `grin-t5-qa` | combined after W2-01…05 | running | `c2ef669` CS-02 port test (not W2-03 approval) | NATIVE_DEVICE | Reproduce W2 then review T1–T4 diffs |

## Wave 2 correction findings

| ID | Finding | Owner | Status | Next |
|---|---|---|---|---|
| W2-01 | Retired repository `ensureSession()` calls `beginOwnerSession` and queues from a stale callback | team4 + team3 session API | running | T4: no self-revive; bind UID+generation; T3: persistDraftAndQueue stays session-gated |
| W2-02 | Ambiguous failure reconciles before retirement; attachments unfenced; same worker reclaims live lease | team3 | running | Unique attempt identity; check before each RPC; atomic completion |
| W2-03 | Verified R1 evidenceId returns durable for R2+different hash; missing category → invoice | team2 + team3 (`ports.ts`) | running | T3 owns `ports.ts`; T2 owns `evidencePort.ts` |
| W2-04 | Storage original read requires reserved/uploading, so verify/link drops client read | team2 | running | Isolated rules only; keep ER-2 commitState re-auth |
| W2-05 | v9→v10 tests copied init sequence | team3 + coordinator; T5 validates | running | Tests must call `applyPendingLocalMigrations` / `initializeLocalDatabase` after inject |

Previous ER-1…ER-5 remain mapped (SQLITE_HOST / INJECTED / isolated emulator). Mapping is not Wave 2 acceptance.

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | Wave 2 corrections in flight; **not accepted** |
| COMBINED SOURCE REVIEW | Wave 1 only; Wave 2 corrections not reviewed |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags `"0"` |
| PUBLIC RELEASE | not authorized |
