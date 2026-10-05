# Auth / admission coverage — production GRIN paths

Label discipline: **COVERED** only if an existing test asserts the outcome. **GAP** otherwise. Team 1 this session **re-executed** the production-compose Functions emulator and the named INJECTED unit files (see `POLICY_BACKEND_HANDOFF.md`). Do not treat EMULATOR as LIVE_BACKEND.

Production live path (lazy):

`functions/src/index.ts` re-exports `productionExports.ts`  
→ `runProductionGrinCallable` / `wrapGrin` (`request.auth?.uid` only)  
→ `createProductionGrinCallables` (`productionCompose.ts`)  
→ `createComposedGrinCallables` (`composed.ts`) + packaged G1/G2 adapters  
→ adapter `gate` / `authorize` (`functions/src/goodsEvidence/g1/adapter.ts` `:494–511`, `g2/adapter.ts` `:1168–1198`)

`callables.ts` `handleGrin*` stubs are **not** the production backend. They stay fail-closed even when the env is `"true"` because they bind no adapter.

Named tests in the assignment:

| File | Label |
|---|---|
| `tools/goods-evidence-emulator/production-compose.gates.emulator.test.ts` | **EMULATOR** / `PRODUCTION_ADMIN_COMPOSED` |
| `tools/goods-evidence-emulator/packaging.unit.test.ts` | **SOURCE** / INJECTED packaging + stub handlers |
| `src/billing/optionC/liveRulesGrinMerged.emulator.test.ts` | **EMULATOR** Rules (client SDK), not callables |

Related (cited only when they are the smallest existing coverage; not invented):

| File | Label |
|---|---|
| `tools/goods-evidence-emulator/composed.injected.unit.test.ts` | **SOURCE** composed + injected adapters |
| `tools/goods-evidence-emulator/production-exports.injected.unit.test.ts` | **SOURCE** lazy exports / config deny |
| `tools/goods-evidence-emulator/register.emulator.test.ts` | **EMULATOR** G1 adapter (not production compose) |
| `tools/goods-evidence-emulator/mutations.injected.unit.test.ts` | **SOURCE** G1 mutations |

---

## Per-scenario × production module

Legend: **COVERED** = existing test on that module’s real path. **GAP** = no such assertion. Adapter-only tests are noted; they are **not** production-compose coverage.

### 1. Unauthenticated

| Module | Status | Evidence / smallest add |
|---|---|---|
| `callables.ts` | **COVERED** (all seven stubs) | `packaging.unit.test.ts` loops `handleGrin*` with `null` → `unauthenticated`. |
| `composed.ts` | **COVERED** (register + empty auth; begin/upload closed) | `composed.injected.unit.test.ts:103–111` register. begin/upload `auth: null` → `ok: false`, `originalDurable: false`, **no** `code: "unauthenticated"` (`authorizeEvidence` `composed.ts:571–572`). **GAP**: composed `reserveEvidence` with `auth: null` (has `code` on that path). |
| `productionCompose.ts` | **COVERED** (all seven) | `production-compose.gates.emulator.test.ts` `callAs(null, …)` register/reconcile/mutate/read/reserve → `unauthenticated`; begin/upload → closed evidence (no `code`). |
| `productionExports.ts` | **COVERED** (register + uploadEvidence) | `runProductionGrinCallable("register"\|"uploadEvidence", { auth: null, … })`. **GAP**: other five methods through `runProductionGrinCallable`; `wrapGrin` onCall is not invoked in this INJECTED test. |

`liveRulesGrinMerged.emulator.test.ts` does not call callables. Unauthenticated Storage/Firestore client is not this scenario.

### 2. Non-admitted (`newCommands`/`reconciliation` deny, missing, or malformed admission)

| Module | Status | Evidence / smallest add |
|---|---|---|
| `callables.ts` | N/A / always `policy_denied` when uid present | Stubs never read admission (`packaging.unit.test.ts:204–228`). Not production coverage. |
| `composed.ts` | **GAP** (delegates to adapter `gate`) | No admission-deny case in `composed.injected.unit.test.ts` / `composed.emulator.test.ts`. |
| `productionCompose.ts` | **COVERED** (register deny/missing/malformed; mutate/reserve/read/begin/upload while denied) | After `newCommands=deny`: register/mutate/reserve/read `policy_denied`; begin/upload closed evidence; reconcile still succeeds while `reconciliation=allow`. G1 read still requires `newCommands=allow` (NOT_ESTABLISHED as a product contract; this is the current fail-closed behaviour). |
| `productionExports.ts` | **GAP** | Config/`TRUE` env deny only, not admission documents. |

Rules: owner cannot **write** admission (`liveRulesGrinMerged.emulator.test.ts:267–271`) — client write deny, not callable admission.

### 3. Cross-owner

| Module | Status | Evidence / smallest add |
|---|---|---|
| `callables.ts` | N/A | Stubs ignore ledger/owner. |
| `composed.ts` | **COVERED** (read) | `composed.injected.unit.test.ts:239–245` foreign `readReceipt` → `forbidden`. |
| `productionCompose.ts` | **COVERED** (read loose codes; OTHER register/mutate/reserve `forbidden`) | OTHER read OWNER receipt / OWNER read OTHER_LEDGER: `forbidden` **or** `policy_denied` **or** `not_found`. OTHER register/mutate/reserve on OWNER `ledgerId` → `forbidden`. **GAP**: OTHER begin/upload. |
| `productionExports.ts` | **GAP** | No owner check in the wrapper. |

Rules: cross-owner GRIN receipt read denied (`liveRulesGrinMerged.emulator.test.ts:301–304`) — client SDK, not Admin/callable.

### 4. Inactive / pending_deletion

| Module | Status | Evidence / smallest add |
|---|---|---|
| `callables.ts` | N/A | No user-status read. |
| `composed.ts` | **GAP** | No inactive/pending cases in composed tests. Adapter **SOURCE/EMULATOR**: `register.emulator.test.ts` pending; `injected.unit.test.ts` / `mutations.injected.unit.test.ts` pending+inactive (not production compose). |
| `productionCompose.ts` | **COVERED** (register + reconcile/mutate/read; no replay exception) | inactive/pending register `forbidden`. Same uids reconcile/mutate/read `forbidden`. Flip-to-pending / flip-to-inactive after a successful register: reconcile of that commandId, mutate, and read are `forbidden` (no replay exception). **GAP**: begin/upload/reserve as inactive or pending. |
| `productionExports.ts` | **GAP** | |

Rules: `pending_deletion` cannot **read** GRIN receipts via client SDK (`liveRulesGrinMerged.emulator.test.ts:306–329`). Does not prove callable Admin path.

### 5. Retired ledger (`status !== "active"`)

| Module | Status | Evidence / smallest add |
|---|---|---|
| `callables.ts` | N/A | |
| `composed.ts` | **GAP** | |
| `productionCompose.ts` | **COVERED** (register + reserve + mutate) | Retired ledger register/reserve `forbidden`. Register-then-retire then mutate `forbidden`. **GAP**: retired read. |
| `productionExports.ts` | **GAP** | |
| `liveRulesGrinMerged.emulator.test.ts` | **GAP** | No retired-ledger matcher case (Storage retired is `tools/goods-evidence-storage/rules.emulator.test.ts`, not the named live-merged file). |

### 6. Malformed input

| Module | Status | Evidence / smallest add |
|---|---|---|
| `callables.ts` | N/A | Ignores envelope; gated deny only. |
| `composed.ts` | **COVERED** (partial) | `expectedVersion: 0` mutate → `invalid` (`composed.injected.unit.test.ts:267–294`). Unknown mutate type → `deny("invalid")` (`composed.ts:541–542`) **GAP** (no test). Client uid/digest stripped (`trustedCommandEnvelope` `:146–155`) **COVERED** (`composed.injected.unit.test.ts` authenticated uid wins). |
| `productionCompose.ts` | **COVERED** (malformed admission; envelope missing `commandId`; G2 stored-byte mismatches) | Admission `newCommands: "ALLOW"` → `policy_denied`. Register `{ envelope: { type: "registerGoodsReceipt" } }` → `invalid`, no serial. Stored-byte hash/size/generation/path/association mismatches remain COVERED. |
| `productionExports.ts` | **COVERED** (Admin **config** malformed → `policy_denied`) | `production-exports.injected.unit.test.ts:119–126`. Not command-shape malformed. |

### 7. Replay (same commandId + digest)

| Module | Status | Evidence / smallest add |
|---|---|---|
| `callables.ts` | N/A | No persistence. |
| `composed.ts` | **COVERED** (register) | `composed.injected.unit.test.ts:152–159` `replayed: true`, same issued number. |
| `productionCompose.ts` | **COVERED** (register + reconcile lost-response + mutate same digest) | Second `amendFields` with same commandId+digest → `replayed: true`. |
| `productionExports.ts` | **GAP** | Wrapper does not implement replay. |

### 8. Conflicting digest / version

| Module | Status | Evidence / smallest add |
|---|---|---|
| `callables.ts` | N/A | |
| `composed.ts` | **COVERED** (digest_conflict on register) | `composed.injected.unit.test.ts:166–167`. **GAP** `version_conflict` on composed (mutate stale `expectedVersion`). Adapter **SOURCE**: `mutations.injected.unit.test.ts:143–170`. |
| `productionCompose.ts` | **COVERED** (register digest_conflict + mutate `version_conflict`) | Two amends with `expectedVersion: 1`; second → `version_conflict`. |
| `productionExports.ts` | **GAP** | |

---

## Production-compose callable cheat sheet (honest)

`production-compose.gates.emulator.test.ts` is the **EMULATOR** proof of `createProductionGrinCallables`. Re-executed this Team 1 session (`npm run test:goods-evidence-g1-functions-emulator`, exit 0).

| Callable | unauth | non-admitted | cross-owner | inactive/pending | retired | malformed | replay | digest/version |
|---|---|---|---|---|---|---|---|---|
| `grinRegisterGoodsReceipt` | COVERED | COVERED | COVERED (`forbidden`) | COVERED | COVERED | admission + envelope COVERED | COVERED | digest COVERED; version N/A |
| `grinReconcileCommand` | COVERED | COVERED (success while newCommands deny + recon allow) | GAP | COVERED (no replay exception) | GAP | GAP | COVERED (lost-response) | GAP |
| `grinMutateGoodsReceipt` | COVERED | COVERED (after deny) | COVERED (`forbidden`) | COVERED | COVERED | GAP | COVERED | COVERED `version_conflict` |
| `grinReadGoodsReceipt` | COVERED | COVERED (`policy_denied`) | COVERED (loose codes) | COVERED | GAP | GAP | N/A | N/A |
| `grinReserveEvidence` | COVERED | COVERED (after deny) | COVERED (`forbidden`) | GAP | COVERED | GAP | GAP | N/A |
| `grinBeginEvidenceUpload` | COVERED (closed, no `code`) | COVERED (closed) | GAP | GAP | GAP | GAP | GAP | N/A |
| `grinUploadEvidence` | COVERED (closed, no `code`) | COVERED (closed) | GAP | GAP | GAP | stored-byte mismatches COVERED | GAP | claimed vs actual COVERED |

---

## Remaining GAPs (after this Team 1 add)

1. **EMULATOR**: OTHER begin/upload; inactive/pending reserve/begin/upload; retired read/reconcile; composed-path unknown mutate type; malformed reconcile/mutate envelopes.
2. **SOURCE**: `runProductionGrinCallable` `auth: null` on the other five names; composed `reserveEvidence` `auth: null`; `wrapGrin` onCall not invoked.
3. **Rules**: `liveRulesGrinMerged.emulator.test.ts` still has no retired-ledger matcher (not this callable packet).

Do not treat EMULATOR as LIVE_BACKEND. Admin fail-closed is unchanged. `DELETION_GRACE_MS` is unchanged.
