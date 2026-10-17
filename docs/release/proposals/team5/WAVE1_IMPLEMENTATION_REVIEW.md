# Wave 1 IMPLEMENTATION review (Team 5)

Independent QA of Teams 1–4 plus coordinator wiring. AI review role, not human certification.

**G6 is not complete.** This document does not mark any acceptance-matrix row `complete`. It does not authorize merge to main, deploy, EAS, Play, live Rules/Storage/IAM, `versionCode` bump, or purchase-entry flag changes.

Independence: this relaunch used the same model family as the coordinator after a different-model launch failed with “Other Models usage limit reached” and produced no review. Independence still means: **read the actual diffs, execute the tests listed below, do not approve from the coordinator ACK files or from green CI alone.** Coordinator acknowledgements were treated as claims to re-check, not as evidence.

Implementations were **not** silently patched. Defects are recorded for another role to fix and re-review.

## Verdict

**Wave 1 source: approved with findings.**

Not approved as production GRIN. Not approved for Functions export, server env `GRIN_GOODS_EVIDENCE_FUNCTIONS=true`, client `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED=1`, store-runtime block removal, live Rules, or G6.

High-priority hunts that would block even undeployed Wave 1 source did not fail on the executed evidence: backend adapters still authorize independently of UI; issued `original` is not rewritten by mutations; verification hashes stored bytes; outbox freezes digest and does not mint issued numbers; fixtures are labelled FAKE and are not wired onto Saved Records; GRIN stays default-off; production Functions entrypoint still does not export goods-evidence callables.

Findings below are contract/correctness gaps that must be closed before production admission. They are not a substitute for NATIVE_DEVICE / PLAY_INSTALLED proof.

## Exact SHAs reviewed

Source tree executed and read: `/Users/shivamsaurav/vyd-worktrees/grin-combined` on `integration/grin-g1-g5-source`.

| Role | Full SHA | Subject |
|---|---|---|
| G1 checkpoint | `c9623ddb282ea3b1365f2bead9088b10a972a770` | fail closed on corrupt serials, unsafe line ids, and pre-commit logs |
| Team 1 | `5c7543db12f9ec041664be01688d902672843a13` | omit undefined object properties and persist G4 mutations |
| Team 2 | `8989b4883d3c8d534db3686847661350b3e691a3` | G2 evidence lifecycle with isolated storage emulator |
| Team 3 | `3c1303b36213c351a2279666c6c6c8a1420da09f` | reconcile outbox only after ambiguous network errors |
| Team 4 | `355e575e7091035eb4eb2987beed6090eefefbc2` | Wave 1 product screens on labelled fixtures |
| Coordinator wiring | `3fe5c46775ec0f146fb6af549885771ffbcff68d` | wire G1–G5 packaging, typecheck, and CI scripts |
| Combined HEAD | `e1d4898bea48a9349848c946cce9069660764dff` | record Wave 1 combined wiring SHA and unsent Jira note |

`c9623dd` is an ancestor of combined HEAD. Diffs reviewed as `git diff c9623dd..<team-sha>` plus `git show 3fe5c46` and the combined tree at `e1d4898`.

This review file is committed on `team/grin-t5-qa` only. Historical dirty workspace `/Users/shivamsaurav/Vyaamikk Diary` was not edited. `node_modules` was not shared by symlink; tests ran against the real `node_modules` directory already present on `grin-combined`.

## Guardrails (re-checked on combined HEAD)

| Check | Result |
|---|---|
| `src/goodsEvidence/ports.ts` `GRIN_CONTRACT_REVISION` | `2026-10-01.wave1b` |
| `functions/src/index.ts` exports `goodsEvidence` / `handleGrin*` | **no** (callables exist in `functions/src/goodsEvidence/callables.ts` and remain unexported) |
| Live `storage.rules` contains `grinEvidence` | **no** |
| Live `firestore.rules` contains `goodsEvidence` | **no** |
| `app.json` `android.versionCode` | `23` |
| `eas.json` preview/production `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` | `"0"` (quota upsell also `"0"`) |
| `isGoodsEvidenceBlockedByStoreRuntime` / store-or-standalone forces off | intact in `src/goodsEvidence/featureFlag.ts` (no test override) |
| `docs/release/GRIN_ACCEPTANCE_MATRIX.md` row status `complete` | not set by this review |

`handleGrinRegister` / `handleGrinReconcile` / `handleGrinMutation` still return `policy_denied` even when `GRIN_GOODS_EVIDENCE_FUNCTIONS === "true"` because no live adapter is wired. That is fail-closed, not a production callable.

## Files read (implementation, not an exhaustive dump)

Contract / ports / flags:

- `docs/release/GRIN_INTERFACE_CONTRACT.md` (wave1b)
- `docs/release/GRIN_ACCEPTANCE_MATRIX.md` (header + G1 auth rows; statuses not rewritten)
- `docs/release/GRIN_IMPLEMENTATION_REGISTER.md`
- `src/goodsEvidence/ports.ts`
- `src/goodsEvidence/featureFlag.ts`, `featureFlag.test.ts`
- `src/goodsEvidence/command.ts`, `canonical.ts`, `evidence.ts`, `exceptions.ts`, `ledger.ts` (InMemory fixture only)

Team 1 / G1+G4 durable adapter:

- `tools/goods-evidence-emulator/adapter.ts`, `limits.ts`, `mutations.ts`, `log.ts`
- `tools/goods-evidence-emulator/injected.unit.test.ts`, `mutations.injected.unit.test.ts`
- `tools/goods-evidence-emulator/ARCHITECTURE.md`, `isolation.contract.test.ts`
- `tools/goods-evidence-emulator/packageFunctionsGoodsEvidence.ts`, `firebase.json`
- `functions/src/goodsEvidence/callables.ts`, `generated.manifest.json`
- `functions/src/index.ts`
- `docs/release/proposals/team1/functions-index.md`

Team 2 / G2:

- `tools/goods-evidence-storage/adapter.ts`, `paths.ts`, `log.ts`, `isolation.contract.test.ts`
- `tools/goods-evidence-storage/FAKE_memoryBlobStore.ts`, `FAKE_injectedFirestore.ts`
- `tools/goods-evidence-storage/injected.unit.test.ts`, `firebase.json`, `storage.rules` (emulator-only)
- `docs/release/proposals/team2/storage.rules.grin.md` (proposal path; live rules untouched)

Team 3 / G3:

- `src/services/grin/outbox/outbox.ts`, `freeze.ts`, `classify.ts`, `transitions.ts`, `ports.ts`, `hostSqlite.ts`
- `src/services/grin/outbox/outbox.isolation.contract.test.ts`
- `src/localDb/migrateGrin.ts`, `src/localDb/schema.ts` (`DB_VERSION = 10`), `src/localDb/init.ts`

Team 4 / G4–G5 product:

- `src/screens/grin/GrinAdmissionGate.tsx`, `GrinListScreen.tsx`, `GrinCreateScreen.tsx`
- `src/services/grin/fixture/GrinFixtureRepository.ts`, `labels.ts`, `seed.ts`
- `src/services/grin/pdf/grinPdfAdapter.ts`, `grinPdfTemplate.ts`
- `app/(app)/grin/_layout.tsx`, `app/(app)/grin/index.tsx`
- `app/(app)/(tabs)/saved-records.tsx` (no GRIN tile)
- `docs/release/proposals/team4/saved-records-tile.md`

Coordinator wiring (not treated as approval):

- `docs/release/proposals/coordinator/TEAM1_WAVE1_ACK.md` … `TEAM4_WAVE1_ACK.md`
- `package.json` scripts for g1/g2/outbox/product/typecheck/`ci:verify`

Live product flags / rules:

- `app.json`, `eas.json`, `storage.rules`, `firestore.rules`

## Commands run (executed on combined HEAD `e1d4898`)

Emulator ports 8088 / 8090 / 8091 / 9200 were free. G1 then G2 emulators were run **sequentially**. No competing emulator was started. JAVA warning from firebase-tools was ignored; suites still exited 0.

| Command | Exit | Evidence labels |
|---|---|---|
| `npm run test:goods-evidence-g1-unit` | 0 | **INJECTED_PORT** (`injected.unit.test.ts`, `mutations.injected.unit.test.ts`); also hash/limits/serial/retry/isolation/packaging (in-process, no I/O backend) |
| `npm run test:goods-evidence-g2-unit` | 0 | **PURE_DOMAIN** (`domain.unit.test.ts`) + **INJECTED_PORT** (`injected.unit.test.ts`) + isolation contract |
| `npm run test:grin-outbox` | 0 | **SQLITE_HOST**. Printed `NATIVE_DEVICE=not_claimed`. **Not NATIVE_DEVICE.** |
| `npm run test:grin-product` | 0 | In-process FAKE repository + HTML pack/receipt builders + locale flatten. **Not** `MOUNTED_REACT_INERT_NATIVE` (React Native screens were not mounted). **Not NATIVE_DEVICE.** |
| `npm run typecheck && typecheck:goods-evidence-g1 && typecheck:goods-evidence-g2` | 0 | compile-only |
| `npm run test:goods-evidence-g1-emulator` | 0 | **FIRESTORE_EMULATOR** (port **8088**, project `demo-vyaamikk-grin-g1`). Includes register, rules, parity, corrections, mutations. |
| `npm run test:goods-evidence-g2-emulator` | 0 | **FIRESTORE_EMULATOR** (port **8091**) + **STORAGE_EMULATOR** (port **9200**), project `demo-vyaamikk-grin-g2`. |

**Not run (and not claimed):** `NATIVE_DEVICE`, `PLAY_INSTALLED`, `MOUNTED_REACT_INERT_NATIVE` screen mount, `test:all`, full `ci:verify`, live Admin SDK, Play-installed binary, TalkBack.

`PERMISSION_DENIED` lines in emulator logs are from rules tests (`assertFails`); they are not suite failures.

## Hunt results

### Authorization at backend entrypoints, not only UI

Durable G1 adapter (`GoodsEvidenceRegisterAdapter`) requires `caller.uid`, then `gate()` on user exists/active, ledger owner+active, and admission policy, **inside the transaction before writes**. UI `GrinAdmissionGate` / `isGoodsEvidenceEnabled` is not consulted by the adapter (isolation tests forbid `isGoodsEvidenceEnabled` in adapter files).

G2 `authorize()` / `loadAuthorized()` use the same user/ledger/admission order; missing evidence after a successful gate is `not_found`; foreign ledger is `forbidden`. InMemory `ledger.ts` still maps owner mismatch to `digest_conflict`; wave1b says that mapping is **not** the durable adapter. Durable adapter uses `forbidden`.

Finding: command **validation** still runs before `gate()` (Defect 2). Writes remain gated.

Functions handlers: unexported + fail-closed. Hiding UI is not the only control.

### Undefined-object vs sparse-array digest

`normalizeJsonCopy` omits undefined object properties on a copy (does not mutate caller). Sparse/undefined array slots throw / are `invalid`. `injected.unit.test.ts` asserts omit vs `{ unusedOptional: undefined }` replay the same digest/result, required-field omit stays `invalid`, undefined array entry is `invalid`. **INJECTED_PORT** suite passed.

### No destructive overwrite of issued originals

Mutations clone `effective` / view / ledgers. `applyAmendFields` writes `next.effective` only. Adapter then `persisted.original = cloneSnapshot(receipt.original)` before `tx.set`. **INJECTED_PORT** mutation tests passed; **FIRESTORE_EMULATOR** `mutations.emulator.test.ts` passed.

Link is an event + pointer (`linkedEvidence`), not a rewrite of `original`.

### Client hash is a claim; trusted verify reads stored bytes

G2 `hashAndBind` opens stored chunks, `verifyOriginalChunks` hashes those bytes, then compares to `claimedSha256`. `completeUpload` records generation/size/mime only. Replacement after verify uses a new object id; overwritten generation is rejected and does not inherit the old `VerifiedEvidenceResult`. **INJECTED_PORT** + **STORAGE_EMULATOR** suites passed (`trusted verify hashes emulator bytes and binds generation`).

### No cross-user existence leak

Adapter paths are `users/{callerUid}/…`. Cross-owner G1 register/reconcile/mutation tests expect `forbidden` for both existing and missing ids. G2 mallory against Alice’s ledgerId is `forbidden`; mallory against her own ledger + unknown evidenceId is `not_found`. No cross-user hash index (injected test). Live unmatched Storage/Firestore paths deny; emulator rules are isolated.

**Could not prove** production IAM or a non-emulator bucket.

### Outbox cannot mutate a queued digest; no fabricated issued GRIN

`freezeAdmittedCommand` hashes canonical body. `saveDraft` on a non-draft returns `digest_conflict` if the body digest changes. Isolation contract forbids `formatGrinNumber` in the outbox module. `issuedNumber` is written only from `GrinRegisterResult.issuedNumber`. Dispatch of non-register types is skipped (`unsupported_type`) — see Defect 3. **SQLITE_HOST** suite passed. **Not NATIVE_DEVICE.**

`GrinServerCommandPort.reconcile` is still typed as `GrinRegisterResult` (Defect 4). Wave 1 dispatch only calls register/reconcile for `registerGoodsReceipt`.

### Fixtures labelled FAKE; no Saved Records fixture counts

`GRIN_FIXTURE_REPOSITORY_LABEL` contains `FAKE / WAVE-1 FIXTURE`. Create path sets `issuedNumber: null`. Fixture tests passed. `saved-records.tsx` has no GRIN tile; Team 4 left a proposal only. Production hub counts were not wired to `getGrinFixtureRepository().list().length`.

Gated screens still construct the fixture repository in `useFocusEffect` even when the gate hides children (residual; flag default-off so Play store-or-standalone does not show the list).

### Logs: no raw business documents / PII / secrets

G1 allowlist: `code`, `attempt`, `replayed`, `policy`. G2 allowlist: `code`, `replayed`, `state`. Commit logs emit after `runTransaction` resolves, not on abort. Isolation forbids `getDownloadURL` / full-file base64 in G2 adapter files. Screen modules under `src/screens/grin` have no `console.log`.

**Could not prove** production Cloud Logging of a deployed callable (callable is unexported).

### GRIN default-off; Functions fail-closed and unexported

Store-or-standalone → `isGoodsEvidenceEnabled()` false even if env is `"1"`. Functions `index.ts` does not export GRIN handlers. Packager copies domain into `functions/src/goodsEvidence/**` (including `evidence.ts` from wiring) without adding the export. Isolation tests assert `functions/src/index.ts` does not mention `goodsEvidence`.

## Defects

Severity: High = Wave 1 source must not be treated as reviewable; Medium = must fix before production callable/UI admission; Low = residual / typing / test gap.

### 1. Medium — authorized missing receipt on mutation returns `invalid`, not `not_found`

- Path: `tools/goods-evidence-emulator/adapter.ts` (`mutate`, missing `receiptSnap` / failed `hydrateReceipt`)
- Contract: wave1b table “authorized missing receipt (mutation) → `not_found`” after owner/ledger checks; foreign callers still `forbidden`
- Observed: `deny("invalid", "unknown receipt")` after `gate()` succeeds
- Not a cross-user leak (paths are caller-uid scoped; foreign ledger still `forbidden`)
- Tests: no assertion that mutation unknown receipt is `not_found` (gap in `mutations.injected.unit.test.ts` / `mutations.emulator.test.ts`)
- Team 1 `ARCHITECTURE.md` still describes `not_found` only for reconcile of a missing command

### 2. Medium — command validation runs before user/ledger/admission gate

- Path: `tools/goods-evidence-emulator/adapter.ts` `register` / `mutate` / `reconcile` (`prevalidate*` then `normalizeJsonCopy` / client digest compare, then transaction `gate()`)
- Contract / matrix G1-R07: unauthenticated → user doc / `pending_deletion` / inactive → ledger owner+active → admission → command validation
- Observed: malformed envelopes and client digest mismatch can return `invalid` / `digest_conflict` to an inactive or pending-deletion caller instead of generic `forbidden`
- Writes still require `gate()`. This is deny-code ordering, not a skipped authz write
- G2 `parseReserve` similarly validates shape before `authorize()` (`tools/goods-evidence-storage/adapter.ts`)

### 3. Medium — outbox acquires a dispatch lease then skips non-register commands

- Path: `src/services/grin/outbox/outbox.ts` `dispatchDue` → `tryAcquireLease` → `dispatchLeased`
- Observed: `commandType !== "registerGoodsReceipt"` returns `skipped: "unsupported_type"` **after** the row is moved to `dispatching` with a lease. Lease is not cleared
- `persistDraftAndQueue` accepts `commandType` other than register. Wave 1 product screens do not use this outbox (fixtures), but the host API can queue mutations
- Effect: mutation rows can sit in `dispatching` until TTL, then be skipped again. Not a fabricated issued GRIN (issued number stays null)

### 4. Low — outbox reconcile port is still register-shaped

- Path: `src/services/grin/outbox/ports.ts` `GrinServerCommandPort.reconcile` → `Promise<GrinRegisterResult>`
- wave1b `GrinReconcileResult` includes mutation success. Coordinator ACK already flags this as pending
- Wave 1 dispatch only uses register success (`issuedNumber`). Combined typecheck passed because callers do not consume mutation reconcile yet

No High defects were confirmed on the executed evidence.

## What this review could not prove

- **NATIVE_DEVICE** process death, expo-sqlite on device, TalkBack, or account-switch on a physical device
- **PLAY_INSTALLED** store binary, Play admission, or production runtime with the store-or-standalone block
- **MOUNTED_REACT_INERT_NATIVE** (screens were read, not mounted)
- Combined CS-01…CS-11 as an end-to-end device workflow
- Production Cloud Functions invocation, App Check, or live IAM
- Absolute immutability of Storage objects against administrators
- Retention/deletion of GRIN + Storage after `pending_deletion` / `retireIdentity` (unresolved policy; deletion jobs were not altered)
- Live EWB / GSTR-2B connectors (assertions / `unknown` / ITC `not_determined` only)
- That emulator Rules equal future production Rules (proposals only; live files unchanged)
- Jira updates (write **unavailable** from this role)

## Explicit non-actions

- Did not merge to main or open a merge-to-main PR
- Did not deploy, build, enable flags, edit live Rules/Storage/IAM, bump `versionCode`, or change purchase-entry flags
- Did not mark G6 or any matrix ID complete
- Did not update Jira
- Did not edit Team 1–4 implementation files

## Approval statement (copyable)

Wave 1 implementations on combined HEAD `e1d4898bea48a9349848c946cce9069660764dff` (teams `5c7543d`, `8989b48`, `3c1303b`, `355e575`, wiring `3fe5c46`, vs G1 `c9623dd`) are **approved with findings** as undeployed, default-off source. They are **not** approved for production admission, Functions export, G6 completion, or merge to main. Another role must fix Defects 1–3 (and should close Defect 4) before any production-facing callable or non-fixture UI.
