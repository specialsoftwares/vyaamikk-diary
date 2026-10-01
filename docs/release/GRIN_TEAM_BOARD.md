# GRIN team board

Statuses: `ready` / `running` / `review` / `blocked` / `source_verified` / `device_pending` / `accepted_at_stated_boundary`.
Do not collapse to Done.

Arrangement: one coordinator plus five **local** Cursor Task subagents on separate worktrees. AI roles, not human sign-off.

| Task | Owner | Branch | Worktree | Dependency | Status | Evidence | Blocker | Next |
|---|---|---|---|---|---|---|---|---|
| Contract + ownership | coordinator | `integration/grin-g1-g5-source` | `grin-combined` | G1 `c9623dd` | source_verified | T5 re-review `6f920cd` merged | Wave 2 + ER-1…ER-5 | Integrate team commits; do not accept Wave 2 until ER mapped |
| G1 injected server port | team1 | `team/grin-t1-backend` | `grin-t1-backend` | M1/M2 approved | review | `091772e` INJECTED `createInjectedGrinServerPort`; no ER assigned | Functions unexported | T5 Wave 2 review after ER-1…ER-5 land |
| G2 injected evidence port + ER-2/ER-3 | team2 | `team/grin-t2-evidence` | `grin-t2-evidence` | M2 approved | running | Wave 2 port in flight; ER-2/ER-3 **not** in original Wave 2 prompt | live IAM | Fold ER-2/ER-3 into current work |
| G3 CS-01 interop + ER-1/ER-4 | team3 | `team/grin-t3-offline` | `grin-t3-offline` | M3 approved | running | Wave 2 CS-01 in flight; ER-1/ER-4 **not** in original prompt | native death not claimed | Fold ER-1 + T3 half of ER-4 |
| G4 outbox-backed repository | team4 | `team/grin-t4-product` | `grin-t4-product` | T5 findings closed | running | Wave 2 repository in flight (no new ER) | pricing/quota | Finish repository; keep FAKE labelled |
| G6 + ER-4/ER-5 | team5 | `team/grin-t5-qa` | `grin-t5-qa` | combined `9cd0928` | running | `6f920cd` M1–M3 closed; CS stubs are **not** workflow passes | NATIVE_DEVICE pending | Execute combined workflows; GRIN-off v9→v10 |

## External-review findings (do not accept Wave 2 until mapped)

| ID | Finding | Owner | Already covered by in-flight Wave 2? | Status | Next |
|---|---|---|---|---|---|
| ER-1 | Retired-session completion and lease fencing in the outbox | team3 | **No.** CS-01 restart test is not session-retirement after await. `applyRegisterOutcome` currently skips `session_retired` only when `owner_uid !== session.ownerUid`, so a retired **same-owner** session can still persist an issued result. Lease `dispatch_generation` exists but is not checked at that completion point. | running | T3: fence completion on `isSessionCurrent`; test end-session during in-flight register |
| ER-2 | Recheck authorization inside the final evidence-write transaction after awaited file operations | team2 | **No.** Wave 2 is `evidencePort.ts`. `loadAuthorized` authorizes, then `blobs.stat`/`open` await, then `commitState` writes **without** `authorize()`. | running | T2: `authorize()` inside `commitState` / final write tx; test pending_deletion between stat and commit |
| ER-3 | Test direct Storage SDK access against reservation/account/admission restrictions | team2 | **Partial, not sufficient.** `rules.emulator.test.ts` uses Storage SDK for owner/cross-owner/anon and overwrite/delete. Isolated `storage.rules` only check `request.auth.uid` — **not** reservation state, `pending_deletion`, or admission. | running | T2: emulator rules + SDK tests for pending_deletion / admission deny / unreserved object (proposal rules only; do not edit live `storage.rules`) |
| ER-4 | Real v9→v10 startup migration, including GRIN-off startup | team3 + team5 | **No.** `init.ts` already calls `migrateToV10` unconditionally (good for GRIN-off). Host outbox tests call `migrateToV10` directly; `testHarness` stays v9. No startup path from a v9 `schema_version` through `init.ts`. | running | T3: SQLITE_HOST fixture at v9 → `init`/`migrateToV10` → tables present. T5: same with `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` unset; diary v9 data preserved |
| ER-5 | Execute combined workflows; acceptance-ID stubs are not workflow passes | team5 | **No.** `tools/grin-acceptance/scenarios/cs01-*.test.ts` still `assertWorkflowNotExecuted`. T3 CS-01 interop (if it lands) is SQLITE_HOST evidence, not a stub pass. | running | T5: run real CS workflows (or keep `tbd`/`device_pending` honestly). Never treat `runIds` stubs as CS pass |

## Readiness (never one “ready”)

| Gate | State |
|---|---|
| GRIN SOURCE IMPLEMENTATION | Wave 1 findings closed; Wave 2 **not accepted** until ER-1…ER-5 mapped |
| COMBINED SOURCE REVIEW | Wave 1 + findings re-review recorded; Wave 2 not reviewed |
| BACKEND DEPLOYMENT | not authorized |
| INTERNAL BUILD | not authorized |
| DEVICE ACCEPTANCE | device_pending |
| PAID BILLING ACCEPTANCE | not authorized; flags remain `"0"` |
| PUBLIC RELEASE | not authorized |
