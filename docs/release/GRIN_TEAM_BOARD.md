# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement: one coordinator plus five **local** Cursor Task subagents on separate worktrees. AI roles, not human sign-off.

Checkpoint inspected: `2593c2be6964955ecb1a433dc93c4096168ce9d2`. Combined F5 review tree: `7623eef`; T5 record `889f011`. W2-01…W2-05 and F1–F4 **reproduced-then-fixed** at stated hosts. Wave 2 / G6 / public release **not accepted**.

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Integration | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | review | T5 F5 `889f011` of `7623eef` | Functions unexported; no exact-head `ci:verify` yet | `ci:verify`; draft PR; STOP before main/deploy |
| F2/F4 G1 readReceipt + transport | team1 | `team/grin-t1-backend` | `grin-t1-backend` | `4b560cd` | source_verified | T5 composed emulator 8088 | live export HOLD | Stay unexported |
| F3 retrieve + pack inputs | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | `3ddd4f9` | source_verified | T5 pack A/B + STORAGE_EMULATOR 9200 | live IAM | Keep live Rules unchanged |
| F1/F2 outbox confirmed + session token | team3 | `team/grin-t3-offline` | `grin-t3-offline` | `fa6d4a7` | source_verified | T5 SQLITE_HOST joined; leftover 0-shim not used as proof | native death not claimed | — |
| F1 origin screens + F2/F3 repo | team4 | `team/grin-t4-product` | `grin-t4-product` | `26b602a` | source_verified | T5 origin.bind actual bodies | pricing/quota; EWB/picker/pack-share bodies not mounted | — |
| Independent F5 review | team5 | `team/grin-t5-qa` | `grin-t5-qa` | `889f011` | source_verified | WAVE2APP_F5_REVIEW.md | NATIVE_DEVICE | Do not accept Wave 2 |

## Wave 2 correction findings (closed at stated boundary; not Wave 2 acceptance)

| ID | Finding | Owner | Status | Next |
|---|---|---|---|---|
| W2-01 | Retired repository self-revived sessions | team4 + team3 | source_verified | T5 PHASE 2 `3fe4071`; not NATIVE_DEVICE |
| W2-02 | Lease reclaim / reconcile-before-retirement / unfenced attachments | team3 | source_verified | T5 PHASE 2 `3fe4071`; SQLITE_HOST only |
| W2-03 | R1 verified id durable for R2+hash; missing category → invoice | team2 + team3 | source_verified | T5 PHASE 2 `3fe4071`; `c2ef669` still not this proof |
| W2-04 | Isolated original read required reserved/uploading | team2 | source_verified | T5 PHASE 2 isolated emulator; live Rules unchanged |
| W2-05 | v9→v10 tests copied init sequence | team3 + coordinator; T5 | source_verified | T5 ER-4 now calls production orchestrator |

## Application findings (T5 F5 independently executed)

| ID | Finding | Owner | Status | Next |
|---|---|---|---|---|
| F1 | Screen `onSave` recaptured live repo; A→B dispatched A's values on B | team4 + team3 | source_verified | T5 origin.bind Amend/QC/Return/Create; EWB/picker/pack-share bodies not mounted |
| F2 | `clientExpectedVersion()` always `0` | team1 + team3 + team4 | source_verified | T5 SQLITE_HOST+INJECTED full join; Firestore variant register+confirm only |
| F3 | Attachments list-only; placeholder pack | team2 + team4 + team3 | source_verified | T5 pack A/B + STORAGE_EMULATOR; live Rules unchanged |
| F4 | Transport composition not emulator-proven | team1 + team4 + coordinator | source_verified | T5 composed FIRESTORE_EMULATOR 8088; no mobile JS→Functions-emulator round-trip |

Previous ER-1…ER-5 remain mapped. Mapping is not Wave 2 acceptance.

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | F1–F4 independently re-executed at stated hosts; **Wave 2 not accepted** |
| COMBINED SOURCE REVIEW | T5 F5 `889f011` of `7623eef`; not G6 |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags `"0"` |
| PUBLIC RELEASE | not authorized |
