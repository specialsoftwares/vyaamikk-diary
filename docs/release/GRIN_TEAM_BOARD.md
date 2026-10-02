# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement: one coordinator plus five **local** Cursor Task subagents on separate worktrees. AI roles, not human sign-off.

Checkpoint inspected: combined includes T5 repro `4711f7d`, Team 2 `29c6d3f`, Team 3 `0d0dd84`, Team 4 `83f10f8`, Team 1 `15bd2a6`. Validated application `99ee60c`. T5 F5 reviewed `7623eef`. `origin/main` `0da2f58970f23c7ce6cbefae6efffd49c731f44b`. Historical workspace `55f2df1` dirty — **untouched**. Contract `2026-10-02.wave2evidence`. Wave 2 / G6 / public release **not accepted**.

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Integration | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | running | T1–T4 merged; JS httpsCallable round-trip green | Functions unexported; `gh` unauthenticated | Team 5 re-review of corrected tree |
| E1 evidence composition | team1 | `team/grin-t1-backend` | `grin-t1-backend` | `15bd2a6` | source_verified | `test:goods-evidence-g1-functions-emulator` real httpsCallable | live export HOLD | Stay unexported / undeployed |
| E1/E2/E4/E5 evidence integrity | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | `29c6d3f` | source_verified | G2 unit + STORAGE_EMULATOR 8091/9200 | live IAM | Stay undeployed |
| E2/E3 admission + descriptors | team3 | `team/grin-t3-offline` | `grin-t3-offline` | `0d0dd84` | source_verified | SQLITE_HOST outbox + F2 interop without 0-shim | native death not claimed | Stay undeployed |
| E4 picker + E5 pack + E1 wire | team4 | `team/grin-t4-product` | `grin-t4-product` | `83f10f8` | source_verified | `test:grin-product` SQLITE_HOST including picker/origin.bind/pack A–D | NATIVE_DEVICE; pricing/quota | Stay undeployed |
| Independent E1–E5 review | team5 | `team/grin-t5-qa` | `grin-t5-qa` | `4711f7d` | running | WAVE2EVIDENCE_E1_E5_REPRO.md — all 8 cases reproduced | NATIVE_DEVICE | Re-review corrected combined tree |

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

## Evidence workflow findings (open at `13f90ed` / `99ee60c`)

| ID | Finding | Owner | Status | Next |
|---|---|---|---|---|
| E1 | Production `GrinOutbox` has `evidence: null`; transport voids `localPath` | team1 + team2 + team4 | source_verified | Isolated Functions-emulator httpsCallable round-trip; live export HOLD |
| E2 | `originalIdentityMatches` accepts echoed claim / null hashes | team2 + team3 | source_verified | SQLITE_HOST admission; T1 round-trip still open |
| E3 | Upload persists flags only; pack uses claimed hash and `generation="verified"` | team3 + team4 | source_verified | Pack inputs use `actualSha256` / `object_generation`; T1 round-trip still open |
| E4 | Picker images-only, quality 0.8, URI-only, size 0, no hash | team2 + team4 | source_verified | SQLITE_HOST / host filesystem; NATIVE_DEVICE remains G6 |
| E5 | App categories omit stock/payment/GST/return; pack assertions too coarse | team2 + team4 | source_verified | App attach + pack A/B/C/D SQLITE_HOST; originals not bundled |

Previous ER-1…ER-5 remain mapped. Mapping is not Wave 2 acceptance.

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | F1–F4 and E1–E5 closed at stated hosts (emulator/SQLITE_HOST/INJECTED); Wave 2 not accepted |
| COMBINED SOURCE REVIEW | T5 F5 `889f011` of `7623eef`; T5 E1–E5 **reproduced** at `4711f7d`; T5 re-review of corrected tree in flight; Wave 2 not accepted |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags `"0"` |
| PUBLIC RELEASE | not authorized |
