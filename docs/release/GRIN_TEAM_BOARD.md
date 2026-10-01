# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement: one coordinator plus five **local** Cursor Task subagents on separate worktrees. AI roles, not human sign-off.

Checkpoint inspected: `2593c2be6964955ecb1a433dc93c4096168ce9d2`. Combined reviewed at `e94b78c`; T5 PHASE 2 `3fe4071`. Inspected W2-01…W2-05 **reproduced-then-fixed**. Wave 2 **not accepted**.

T4 transport `e6a689b` is fast-forwarded onto combined. Production default is `createFirebaseJsGrinTransport`. Functions remain unexported. F1–F4 below are **distinct** from W2-01…W2-05 and were **not** closed by PHASE 2.

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Integration | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | running | `e6a689b` on combined; contract `2026-10-02.wave2app` | F1–F4 unfixed | Integrate team landings; exact-head `ci:verify` |
| W2-06 G1 mobile-safe composition | team1 | `team/grin-t1-backend` | `grin-t1-backend` | `cbcb1b9` | source_verified | composed + JS transport; Functions unexported | live export HOLD | F2 confirmed retrieve; F4 shape validation |
| W2-03 identity + W2-04 read policy | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | `06d897a` | source_verified | T5 PHASE 2 isolated retained reads | live IAM | F3 attach/verify/link/retrieve + pack originals |
| W2-02 lease/attempt + W2-05 tests | team3 | `team/grin-t3-offline` | `grin-t3-offline` | `9a0de6d` | source_verified | T5 PHASE 2 SQLITE_HOST fence | native death not claimed | F1 session token; F2 confirmed projection persistence |
| W2-01 session bind + screens | team4 | `team/grin-t4-product` | `grin-t4-product` | `e6a689b` | source_verified | transport bound; W2-01 no self-revive | pricing/quota | F1 callback origin; F2 expectedVersion; F3 pack/attach |
| Independent PHASE 2 review | team5 | `team/grin-t5-qa` | `grin-t5-qa` | `e94b78c` | source_verified | `3fe4071` WAVE2_PHASE2_REVIEW.md | NATIVE_DEVICE | F5 after F1–F4 land (do not start early) |

## Wave 2 correction findings (closed at stated boundary; not Wave 2 acceptance)

| ID | Finding | Owner | Status | Next |
|---|---|---|---|---|
| W2-01 | Retired repository self-revived sessions | team4 + team3 | source_verified | T5 PHASE 2 `3fe4071`; not NATIVE_DEVICE |
| W2-02 | Lease reclaim / reconcile-before-retirement / unfenced attachments | team3 | source_verified | T5 PHASE 2 `3fe4071`; SQLITE_HOST only |
| W2-03 | R1 verified id durable for R2+hash; missing category → invoice | team2 + team3 | source_verified | T5 PHASE 2 `3fe4071`; `c2ef669` still not this proof |
| W2-04 | Isolated original read required reserved/uploading | team2 | source_verified | T5 PHASE 2 isolated emulator; live Rules unchanged |
| W2-05 | v9→v10 tests copied init sequence | team3 + coordinator; T5 | source_verified | T5 ER-4 now calls production orchestrator |

## Application findings (open — not covered by W2-01…W2-05)

| ID | Finding | Owner | Status | Next |
|---|---|---|---|---|
| F1 | Screen `onSave` recaptures `requireLiveGrinApplicationRepository()`; A→B dispatches A's values on B | team4 + team3 | running | Bind origin uid+generation; test actual screen bodies |
| F2 | `clientExpectedVersion()` always `0`; G1 rejects positive-integer rule | team1 + team3 + team4 | running | Confirmed projection; refuse mutation without confirmed version |
| F3 | Attachments list-only; `exportPack` hardcodes empty cuts / `missingOriginal: true` | team2 + team4 + team3 | running | Capture/attach/verify/link; pack from confirmed events |
| F4 | JS transport on combined (`e6a689b`); source-graph test is not executed composition | team1 + team4 + coordinator | running | Validate remote shapes; emulator composition; Functions stay unexported |

Previous ER-1…ER-5 remain mapped (SQLITE_HOST / INJECTED / isolated emulator). Mapping is not Wave 2 acceptance.

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | W2 findings independently closed at host/injected/emulator boundary; F1–F4 **open**; **Wave 2 not accepted** |
| COMBINED SOURCE REVIEW | T5 PHASE 2 `3fe4071` of `e94b78c` only; `e6a689b` and F1–F4 not independently reviewed |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags `"0"` |
| PUBLIC RELEASE | not authorized |
