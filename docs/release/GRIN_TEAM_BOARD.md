# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement: one coordinator plus five **local** Cursor Task subagents on separate worktrees. AI roles, not human sign-off.

Checkpoint inspected: combined `ae0339a` (T5 PHASE 2 rereview). Includes T5 PHASE 1 `4711f7d`, Team 2 `29c6d3f`, Team 3 `0d0dd84`, Team 4 `83f10f8`, Team 1 `15bd2a6`. T5 F5 reviewed `7623eef`. Historical workspace `55f2df1` dirty — **untouched**. Contract `2026-10-02.wave2evidence`. Wave 2 / G6 / public release **not accepted**.

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Integration | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | running | T1–T4 merged; T5 PHASE 2 rereview of `ae0339a` | Functions unexported; E4 remaining; `gh` unauthenticated | Do not mark Wave 2 / G6 Done |
| E1 evidence composition | team1 | `team/grin-t1-backend` | `grin-t1-backend` | `15bd2a6` | source_verified | `test:goods-evidence-g1-functions-emulator` real httpsCallable | live export HOLD | Stay unexported / undeployed |
| E1/E2/E4/E5 evidence integrity | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | `29c6d3f` | source_verified | G2 unit + STORAGE_EMULATOR 8091/9200 | live IAM | Stay undeployed |
| E2/E3 admission + descriptors | team3 | `team/grin-t3-offline` | `grin-t3-offline` | `0d0dd84` | source_verified | SQLITE_HOST outbox + F2 interop without 0-shim | native death not claimed | Stay undeployed |
| E4 picker + E5 pack + E1 wire | team4 | `team/grin-t4-product` | `grin-t4-product` | `83f10f8` | source_verified | `test:grin-product` SQLITE_HOST including picker/origin.bind/pack A–D | NATIVE_DEVICE; pricing/quota | Stay undeployed |
| Independent E1–E5 review | team5 | `team/grin-t5-qa` | `grin-t5-qa` | `ae0339a` | review | WAVE2EVIDENCE_E1_E5_REREVIEW.md — E1–E3/E5 pass at labelled hosts; E4 remaining | NATIVE_DEVICE; pack `osConversionOccurred: false`; hasher unwired on persist | Do not mark Wave 2 / G6 Done |

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
| F1 | Screen `onSave` recaptured live repo; A→B dispatched A's values on B | team4 + team3 | source_verified | Preserve; extend origin.bind to EWB/picker/pack |
| F2 | `clientExpectedVersion()` always `0` | team1 + team3 + team4 | source_verified | Remove leftover 0-shim |
| F3 | Attachments list-only; placeholder pack | team2 + team4 + team3 | source_verified | E1–E5 make the pack path real |
| F4 | Transport composition not emulator-proven | team1 + team4 + coordinator | source_verified | E1 adds evidence port + Functions-emulator |

## Evidence workflow findings (T5 PHASE 2 rereview of `ae0339a`; Wave 2 not accepted)

| ID | Finding | Owner | Status | Next |
|---|---|---|---|---|
| E1 | Production `GrinOutbox` omitted evidence; transport voided `localPath` | team1 + team2 + team4 | source_verified | T5 PHASE 2: construction + isolated Functions `httpsCallable` executed; hasher still unwired on persist; live export HOLD |
| E2 | `originalIdentityMatches` accepted echoed claim / null hashes | team2 + team3 | source_verified | T5 PHASE 2 SQLITE_HOST negatives + known-bytes; hash is integrity not legal truth |
| E3 | Upload persisted flags only; pack used claimed hash and `generation="verified"` | team3 + team4 | source_verified | T5 PHASE 2 SQLITE_HOST descriptors + stale fence; pack maps actual hash/generation/mime |
| E4 | Picker images-only, quality 0.8, URI-only, size 0, no hash | team2 + team4 | review | T5 PHASE 2: picker quality 0.8 gone and durable copy executed; pack assembler still hardcodes `osConversionOccurred: false` |
| E5 | App categories omit stock/payment/GST/return; pack assertions too coarse | team2 + team4 | source_verified | T5 PHASE 2 attach + pack A/B/C/D; originals not bundled; app pack B stamps sqlite in tests |

Previous ER-1…ER-5 remain mapped. Mapping is not Wave 2 acceptance.

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | F1–F4 preserved; E1–E3/E5 pass at labelled hosts; E4 remaining pack `osConversionOccurred: false`; Wave 2 not accepted |
| COMBINED SOURCE REVIEW | T5 F5 `889f011` of `7623eef`; T5 E1–E5 PHASE 1 `4711f7d` of `41670aa`; T5 PHASE 2 rereview of `ae0339a`; Wave 2 not accepted |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags `"0"` |
| PUBLIC RELEASE | not authorized |
