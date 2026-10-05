# Auth / admission coverage — production GRIN paths

Label discipline: **COVERED** only if an existing test asserts the outcome. **GAP** otherwise. Tests were **read**, not re-executed this session. Do not treat this table as a passing run.

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
| `callables.ts` | **COVERED** (register only among stubs that return `code`) | `packaging.unit.test.ts:207–208` `handleGrinRegister(null)` → `unauthenticated`. Other six stubs: same `if (!uid)` (`callables.ts:46–100`) but **GAP** to call them with `null` (reconcile/mutate/read/evidence only tested with `"uid_1"` → `policy_denied`). **SOURCE** add: one loop over all seven `handleGrin*` with `null`. |
| `composed.ts` | **COVERED** (register + empty auth) | `composed.injected.unit.test.ts:103–111`. **GAP** on production **begin/upload** shape: `authorizeEvidence` returns `evidenceClosed(false)` **without** `code: "unauthenticated"` (`composed.ts:571–572`). **SOURCE** add: `beginEvidenceUpload` / `uploadEvidence` with `auth: null`, assert closed + no durable original. |
| `productionCompose.ts` | **COVERED** (register only) | `production-compose.gates.emulator.test.ts:188–190`. **GAP** other six names. **EMULATOR** add: `callAs(null, NAME, …)` for reconcile/mutate/read/reserve/begin/upload. |
| `productionExports.ts` | **GAP** | `production-exports.injected.unit.test.ts` always passes `{ uid: "uid_…" }`. `wrapGrin` maps missing auth to `null` (`:60–62`, `:86–89`) but untested. **SOURCE** add: `runProductionGrinCallable("register", { auth: null, data: {} }, loadRealOrInjected)` expects `unauthenticated` when compose is bound, or closed evidence for begin/upload. |

`liveRulesGrinMerged.emulator.test.ts` does not call callables. Unauthenticated Storage/Firestore client is not this scenario.

### 2. Non-admitted (`newCommands`/`reconciliation` deny, missing, or malformed admission)

| Module | Status | Evidence / smallest add |
|---|---|---|
| `callables.ts` | N/A / always `policy_denied` when uid present | Stubs never read admission (`packaging.unit.test.ts:204–228`). Not production coverage. |
| `composed.ts` | **GAP** (delegates to adapter `gate`) | No admission-deny case in `composed.injected.unit.test.ts` / `composed.emulator.test.ts`. |
| `productionCompose.ts` | **COVERED** (register: deny / missing / malformed; later mutate + reserve while denied) | deny `:200–212`; missing `:258–270`; malformed `ALLOW` `:272–289`; after `newCommands=deny`: register `:536–538`, mutate `:540–555`, reserve `:557–568`. Reconcile while `reconciliation=allow` still succeeds `:575–582`. **GAP**: begin/upload/read while denied (G1 read still requires `newCommands=allow` — noted at `:585–587` as NOT_ESTABLISHED for that contract on all names). **EMULATOR** add: `grinReadGoodsReceipt` + `grinBeginEvidenceUpload` after deny. |
| `productionExports.ts` | **GAP** | Config/`TRUE` env deny only (`production-exports.injected.unit.test.ts:169–176`), not admission documents. |

Rules: owner cannot **write** admission (`liveRulesGrinMerged.emulator.test.ts:267–271`) — client write deny, not callable admission.

### 3. Cross-owner

| Module | Status | Evidence / smallest add |
|---|---|---|
| `callables.ts` | N/A | Stubs ignore ledger/owner. |
| `composed.ts` | **COVERED** (read) | `composed.injected.unit.test.ts:239–245` foreign `readReceipt` → `forbidden`. |
| `productionCompose.ts` | **COVERED** (read only, code loose) | `production-compose.gates.emulator.test.ts:291–301` OTHER reads OWNER receipt; OWNER reads OTHER_LEDGER; asserts `forbidden` **or** `policy_denied` **or** `not_found`. **GAP**: OTHER `register`/`mutate`/`reserve` on OWNER `ledgerId`. **EMULATOR** add: `callAs(OTHER, GRIN_REGISTER_CALLABLE, OWNER ledger envelope)` expect `forbidden`. |
| `productionExports.ts` | **GAP** | No owner check in the wrapper. |

Rules: cross-owner GRIN receipt read denied (`liveRulesGrinMerged.emulator.test.ts:301–304`) — client SDK, not Admin/callable.

### 4. Inactive / pending_deletion

| Module | Status | Evidence / smallest add |
|---|---|---|
| `callables.ts` | N/A | No user-status read. |
| `composed.ts` | **GAP** | No inactive/pending cases in composed tests. Adapter **SOURCE/EMULATOR**: `register.emulator.test.ts` pending; `injected.unit.test.ts` / `mutations.injected.unit.test.ts` pending+inactive (not production compose). |
| `productionCompose.ts` | **COVERED** (register only) | inactive `:192–194` `forbidden`; pending_deletion `:196–198` `forbidden`; both seeded with admission `allow` (`:133–134`) so this is status-before-admission. **GAP**: reconcile/mutate/read/evidence as inactive or pending (including “no replay exception”). **EMULATOR** add: pending uid `grinReconcileCommand` on an existing commandId → `forbidden`. |
| `productionExports.ts` | **GAP** | |

Rules: `pending_deletion` cannot **read** GRIN receipts via client SDK (`liveRulesGrinMerged.emulator.test.ts:306–329`). Does not prove callable Admin path.

### 5. Retired ledger (`status !== "active"`)

| Module | Status | Evidence / smallest add |
|---|---|---|
| `callables.ts` | N/A | |
| `composed.ts` | **GAP** | |
| `productionCompose.ts` | **GAP** | `seedUser` always writes ledger `status: "active"` (`production-compose.gates.emulator.test.ts:115–118`). Adapter **EMULATOR** only: `register.emulator.test.ts:227–234` retired → `forbidden`. G2 `authorize` also requires `ledger.status === "active"` (`g2/adapter.ts:1188–1189`). **EMULATOR** add: production compose register + reserve against `status: "retired"`. |
| `productionExports.ts` | **GAP** | |
| `liveRulesGrinMerged.emulator.test.ts` | **GAP** | No retired-ledger matcher case (Storage retired is `tools/goods-evidence-storage/rules.emulator.test.ts`, not the named live-merged file). |

### 6. Malformed input

| Module | Status | Evidence / smallest add |
|---|---|---|
| `callables.ts` | N/A | Ignores envelope; gated deny only. |
| `composed.ts` | **COVERED** (partial) | `expectedVersion: 0` mutate → `invalid` (`composed.injected.unit.test.ts:267–294`). Unknown mutate type → `deny("invalid")` (`composed.ts:541–542`) **GAP** (no test). Client uid/digest stripped (`trustedCommandEnvelope` `:146–155`) **COVERED** (`composed.injected.unit.test.ts` authenticated uid wins). |
| `productionCompose.ts` | **COVERED** (malformed admission; G2 stored-byte mismatches) | Admission `newCommands: "ALLOW"` `:272–289`. Wrong claimed hash `:347–380`; wrong size `:382–412`; generation change `:414–455`; unbound PUT path Rules 403 `:457–493`; wrong receipt association `:495–525`. **GAP**: malformed command envelope (missing `commandId` / non-object body) on register via production compose. **EMULATOR** add: register `{ envelope: { type: "registerGoodsReceipt" } }` → `invalid` not a serial. |
| `productionExports.ts` | **COVERED** (Admin **config** malformed → `policy_denied`) | `production-exports.injected.unit.test.ts:119–126`. Not command-shape malformed. |

### 7. Replay (same commandId + digest)

| Module | Status | Evidence / smallest add |
|---|---|---|
| `callables.ts` | N/A | No persistence. |
| `composed.ts` | **COVERED** (register) | `composed.injected.unit.test.ts:152–159` `replayed: true`, same issued number. |
| `productionCompose.ts` | **COVERED** (register + reconcile lost-response) | register replay `:221–224`; `grinReconcileCommand` `:226–234`. **GAP**: mutate replay (same digest) on production compose. **EMULATOR** add: second `amendFields` same commandId+digest → `replayed: true`. |
| `productionExports.ts` | **GAP** | Wrapper does not implement replay. |

### 8. Conflicting digest / version

| Module | Status | Evidence / smallest add |
|---|---|---|
| `callables.ts` | N/A | |
| `composed.ts` | **COVERED** (digest_conflict on register) | `composed.injected.unit.test.ts:166–167`. **GAP** `version_conflict` on composed (mutate stale `expectedVersion`). Adapter **SOURCE**: `mutations.injected.unit.test.ts:143–170`. |
| `productionCompose.ts` | **COVERED** (register digest_conflict only) | `:236–239`. **GAP** `version_conflict` on `grinMutateGoodsReceipt`. **EMULATOR** add: two amends with `expectedVersion: 1`; second → `version_conflict`. |
| `productionExports.ts` | **GAP** | |

---

## Production-compose callable cheat sheet (honest)

`production-compose.gates.emulator.test.ts` is the only **EMULATOR** proof of `createProductionGrinCallables`. Coverage is **register-heavy**:

| Callable | unauth | non-admitted | cross-owner | inactive/pending | retired | malformed | replay | digest/version |
|---|---|---|---|---|---|---|---|---|
| `grinRegisterGoodsReceipt` | COVERED | COVERED | GAP | COVERED | GAP | admission COVERED; envelope GAP | COVERED | digest COVERED; version N/A |
| `grinReconcileCommand` | GAP | GAP (success while newCommands deny + recon allow) | GAP | GAP | GAP | GAP | COVERED (lost-response) | GAP |
| `grinMutateGoodsReceipt` | GAP | COVERED (after deny) | GAP | GAP | GAP | GAP | GAP | GAP version_conflict |
| `grinReadGoodsReceipt` | GAP | GAP | COVERED (loose codes) | GAP | GAP | GAP | N/A | N/A |
| `grinReserveEvidence` | GAP | COVERED (after deny) | GAP | GAP | GAP | GAP | GAP | N/A |
| `grinBeginEvidenceUpload` | GAP | GAP | GAP | GAP | GAP | GAP | GAP | N/A |
| `grinUploadEvidence` | GAP | GAP | GAP | GAP | GAP | stored-byte mismatches COVERED | GAP | claimed vs actual COVERED |

---

## Smallest tests to add (priority)

1. **EMULATOR** (`production-compose.gates.emulator.test.ts`): retired ledger register+reserve; pending_deletion reconcile (no replay exception); mutate `version_conflict`; unauthenticated on all seven names; OTHER register on OWNER ledger.
2. **SOURCE** (`production-exports.injected.unit.test.ts`): `auth: null` through `runProductionGrinCallable` for `register` and `uploadEvidence`.
3. **SOURCE** (`composed.injected.unit.test.ts`): `beginEvidenceUpload` unauthenticated closed result (documents the missing `code` field).

Do not mark these as passing. They are not in the tree.
