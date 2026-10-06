# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement: one coordinator plus five **local** Cursor Task subagents on separate worktrees. AI roles, not human sign-off.

Checkpoint: PR **#31** head `0d7aa17`. Application `520f9f9`. Tooling successor `0d7aa17` (not byte-identical to historical ops-guard `228a8f5`). Canonical GHA **`37425360211` / job `112143748428` success**. S1/S2 closed at INJECTED+EMULATOR. P3 accepted. P8 open. Device/live/billing/public **not accepted**.

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Integration | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | `0d7aa17` | running | GHA `37425360211` success; app `520f9f9`; pin applied; P3 PASS; P8 FAIL | live mutate / EAS / Play / billing HOLD | A1 offer; owner GiB + deletion; B1 freeze |
| Backend pilot | team1 | `team/grin-t1-review-after-s1-s2` | `grin-t1-backend` | A1 hashes | running | Present A1; A2–A7 scoped separately | `GRIN_OPS_ALLOW_LIVE=1` HOLD | Owner A1 grant; remaining backend packets |
| Policy / deletion | team2 | `team/grin-t2-s1s2` | `grin-t2-evidence` | `0cd3473` | running | Holds-bound 2500; economics; inactive deletion | advertising GiB; live purge | Do not reopen S1/S2; do not flip P8 |
| Build / device | team3 | `team/grin-t3-freeze` | `grin-t3-offline` | freeze `520f9f9` + CI `37425360211` | review | `APPROVAL_B_DRAFT.md` `8ca2b59`. vc23 unreserved. Device form blank. B1≠B2 not granted. | EAS/Play B1/B2 HOLD | Re-read Play explorer before B1; no unauthorized build |
| Billing / Play | team4 | `team/grin-t4-product` | `grin-t4-product` | purchase-entry `"0"` | running | Two owner decisions: GiB + 15/180; billing matrix | activation HOLD | Catalog NOT RUN; no website publish |
| Independent QA | team5 | `team/grin-t5-qa` | `grin-t5-qa` | newly landed only | running | Preserve S1/S2/P3; review pin/CI/new policy | NATIVE_DEVICE | Not whole-history; not device/live/billing |
| E1 evidence composition | team1 | `team/grin-t1-backend` | `grin-t1-backend` | `15bd2a6` | source_verified | persistGrinOwnerSession → processAttachments → real httpsCallable on isolated Functions emulator | live export HOLD | Stay unexported / undeployed |
| E1/E2/E4/E5 evidence integrity | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | `29c6d3f` | source_verified | G2 unit + STORAGE_EMULATOR 8091/9200 | live IAM | Stay undeployed |
| E2/E3 admission + descriptors | team3 | `team/grin-t3-offline` | `grin-t3-offline` | `0d0dd84` | source_verified | SQLITE_HOST outbox + capture columns | native death not claimed | Stay undeployed |
| E4 picker + E5 pack + E1 wire | team4 | `team/grin-t4-product` | `grin-t4-product` | `83f10f8` | source_verified | picker HOST_FILESYSTEM; pack uses retained conversion | NATIVE_DEVICE; pricing/quota | Stay undeployed |
| Independent E1–E5 review | team5 | `team/grin-t5-qa` | `grin-t5-qa` | `ee4be8a` of `cd5b5f4` | source_verified | PHASE 4: joined persist→emulator pass at SQLITE_HOST / HOST_FILESYSTEM / EMULATOR | NATIVE_DEVICE | Stay undeployed; Wave 2 not accepted |

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
| E1 | Production `GrinOutbox` omitted evidence; transport voided `localPath` | team1 + team2 + team4 + coordinator | source_verified | T5 PHASE 4 `ee4be8a` independently re-executed joined persist httpsCallable; live export HOLD |
| E2 | `originalIdentityMatches` accepted echoed claim / null hashes | team2 + team3 | source_verified | SQLITE_HOST negatives + known-bytes; production hasher matches independent SHA-256 |
| E3 | Upload persisted flags only; pack used claimed hash and `generation="verified"` | team3 + team4 | source_verified | descriptors + capture columns; stale fence |
| E4 | Picker images-only, quality 0.8, URI-only, size 0, no hash | team2 + team4 + coordinator | source_verified | pack uses retained conversion (`unknown` unless evidenced); HOST_FILESYSTEM picker; T5 PHASE 3 `d3d48fc` |
| E5 | App categories omit stock/payment/GST/return; pack assertions too coarse | team2 + team4 | source_verified | attach + pack A/B/C/D; originals not bundled |

Previous ER-1…ER-5 remain mapped. Mapping is not Wave 2 acceptance.

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | F1–F4 preserved; E1–E5 source closed at SQLITE_HOST / INJECTED / isolated Functions emulator including persistGrinOwnerSession httpsCallable; Wave 2 not accepted |
| COMBINED SOURCE REVIEW | T5 F5 `889f011` of `7623eef`; T5 E1–E5 PHASE 1 `4711f7d`; T5 PHASE 2 `049e7e0` of `ae0339a`; T5 PHASE 3 `d3d48fc` of `d4b6e1f`; T5 PHASE 4 `ee4be8a` of `cd5b5f4`; Wave 2 not accepted |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags `"0"` |
| PUBLIC RELEASE | not authorized |
