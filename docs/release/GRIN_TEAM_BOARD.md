# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement: one coordinator plus five **local** Cursor Task subagents on separate worktrees. AI roles, not human sign-off.

Checkpoint inspected: combined includes T5 PHASE 3 `d3d48fc` of `d4b6e1f` plus coordinator joined persist→emulator proof. Historical workspace `55f2df1` dirty — **untouched**. Contract `2026-10-02.wave2evidence`. Wave 2 / G6 / public release **not accepted**.

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Integration | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | running | T5 PHASE 3 `d3d48fc`; joined persistGrinOwnerSession httpsCallable emulator | Functions unexported; `gh` unauthenticated | T5 follow-up of joined persist SHA; do not mark Wave 2 / G6 Done |
| E1 evidence composition | team1 | `team/grin-t1-backend` | `grin-t1-backend` | `15bd2a6` | source_verified | persistGrinOwnerSession → processAttachments → real httpsCallable on isolated Functions emulator | live export HOLD | Stay unexported / undeployed |
| E1/E2/E4/E5 evidence integrity | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | `29c6d3f` | source_verified | G2 unit + STORAGE_EMULATOR 8091/9200 | live IAM | Stay undeployed |
| E2/E3 admission + descriptors | team3 | `team/grin-t3-offline` | `grin-t3-offline` | `0d0dd84` | source_verified | SQLITE_HOST outbox + capture columns | native death not claimed | Stay undeployed |
| E4 picker + E5 pack + E1 wire | team4 | `team/grin-t4-product` | `grin-t4-product` | `83f10f8` | source_verified | picker HOST_FILESYSTEM; pack uses retained conversion | NATIVE_DEVICE; pricing/quota | Stay undeployed |
| Independent E1–E5 review | team5 | `team/grin-t5-qa` | `grin-t5-qa` | `d3d48fc` of `d4b6e1f` | review | PHASE 3: hasher/conversion pass at SQLITE_HOST; joined persist-emulator not yet independently re-executed | NATIVE_DEVICE | Follow-up of joined persist SHA |

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
| E1 | Production `GrinOutbox` omitted evidence; transport voided `localPath` | team1 + team2 + team4 + coordinator | source_verified | persist → processAttachments → real httpsCallable (isolated Functions emulator); live export HOLD |
| E2 | `originalIdentityMatches` accepted echoed claim / null hashes | team2 + team3 | source_verified | SQLITE_HOST negatives + known-bytes; production hasher matches independent SHA-256 |
| E3 | Upload persisted flags only; pack used claimed hash and `generation="verified"` | team3 + team4 | source_verified | descriptors + capture columns; stale fence |
| E4 | Picker images-only, quality 0.8, URI-only, size 0, no hash | team2 + team4 + coordinator | source_verified | pack uses retained conversion (`unknown` unless evidenced); HOST_FILESYSTEM picker; T5 PHASE 3 `d3d48fc` |
| E5 | App categories omit stock/payment/GST/return; pack assertions too coarse | team2 + team4 | source_verified | attach + pack A/B/C/D; originals not bundled |

Previous ER-1…ER-5 remain mapped. Mapping is not Wave 2 acceptance.

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | F1–F4 preserved; E1–E5 source closed at SQLITE_HOST / INJECTED / isolated Functions emulator including persistGrinOwnerSession httpsCallable; Wave 2 not accepted pending T5 of joined SHA |
| COMBINED SOURCE REVIEW | T5 F5 `889f011` of `7623eef`; T5 E1–E5 PHASE 1 `4711f7d`; T5 PHASE 2 `049e7e0` of `ae0339a`; T5 PHASE 3 `d3d48fc` of `d4b6e1f`; joined persist-emulator not yet independently re-executed; Wave 2 not accepted |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags `"0"` |
| PUBLIC RELEASE | not authorized |
