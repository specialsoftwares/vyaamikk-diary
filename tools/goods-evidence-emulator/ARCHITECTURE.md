# G1 architecture — durable register/reconcile (emulator slice)

Not a live callable. Not production GRIN admission. Support policy v2.
Domain checkpoint `55f2df1405c296336eea058238c8ae24e7a8b370`. Core candidate `6e3dbba` / docs `8b286ab`.

## Packaging

- Adapter: `tools/goods-evidence-emulator/**` (trusted emulator backend).
- Generated Functions domain: `functions/src/goodsEvidence/**` via `packageFunctionsGoodsEvidence.ts`. Undeployed. Fail-closed handlers in `callables.ts` are not exported from `functions/src/index.ts`.
- `composed.ts` is tests/emulator composition (INJECTED / EMULATOR / not live deploy). It injects `GoodsEvidenceRegisterAdapter`; it does not import that adapter (rootDir would lift `lib/index.js`).
- Mobile transport is `src/services/grin/transport/**` (Firebase JS `httpsCallable`). It must not import this emulator folder.
- `tools/goods-evidence-emulator/serverPort.ts` remains TEST COMPOSITION. Do not wire it into the app.
- Production `functions/src/index.ts`, `functions/tsconfig.json`, and `functions/package.json` are unchanged.
- Direct `functions/src` → `src/goodsEvidence` imports are forbidden (tsc `rootDir` lifts; `lib/index.js` would move).
- Adapter imports alias-free domain files via relative paths (`canonical`, `constants`, `time`, `grinNumber`, `validate`, `quantities`, `types`, `snapshot`, `custody`, `ewb`, `command`, `ports`) plus Node `createHash("sha256")` over `canonicalJson`. Not `@/utils/sha256Hex`.
- Tests may import `InMemoryGoodsLedger` / `freezeCommand`.
- Firestore Admin is injected by tests (`harness.ts`). The adapter depends on `G1Firestore`, not `firebase-admin`.
- Emulator config: `tools/goods-evidence-emulator/firebase.json` (Firestore **8088**, project `demo-vyaamikk-grin-g1`). Isolated Rules file; **do not deploy**.

## Collections

Admin-only config (per authenticated owner; not a project-wide lock):

`users/{uid}/goodsEvidenceAdmission/runtime`
`{ schemaVersion: 1, newCommands: "allow"|"deny", reconciliation: "allow"|"deny" }`

A missing or malformed document denies after owner/ledger checks. Policy is not read from the client body. Admission is **per-owner**. A shared read of that document is not the same as write contention: registrations still contend on the **per-ledger FY serial document** when they allocate numbers. Concurrent distinct receipts on one ledger/FY serialize on that serial doc; different owners/ledgers do not share a serial lock.

Owner-scoped (uid is authenticated Firebase uid only):

| Path | Role | Immutable after commit |
|---|---|---|
| `users/{uid}` | existing account (`status`) | identity fields server-owned |
| `users/{uid}/goodsEvidenceLedgers/{ledgerId}` | ledger `{ ownerUid, status: active\|retired }` | ownerUid |
| `.../commands/{commandId}` | digest + stored register result | digest, result |
| `.../serials/{fyToken}` | `{ fyToken, nextSerial, lastIssuedSerial }` | never decrement / delete |
| `.../receipts/{receiptId}` | `{ original, view, lineLedgers }` | `original` |
| `.../receipts/{receiptId}/events/{eventId}` | first `receipt_registered` event | eventHash / previousHash |

Command identity: **owner uid + ledgerId + commandId**. Receipt identity conflicts cannot be bypassed with a new commandId (`receipt_exists`).

## Command scope (this slice)

Implemented: `registerGoodsReceipt` + independent `reconcile({ ledgerId, commandId })` + durable mutations (`amendFields`, `recordQc`, `dispatchReturn`, `correctReturnDispatch`, `voidWithReason`, `recordEwbObservation`, `linkVerifiedEvidence`).

Mutations use the same authenticated uid, owner/ledger, admission, scoped `commandId`+digest, `expectedVersion`, atomic event+projection+command-result, lost-response replay, and ABORTED-only retries as register. They append events and update `view` / line ledgers / `effective`. They never overwrite `original`. Serial allocation is not part of mutation write sets. After a successful gate, a missing or unreadable receipt is `not_found`; a hydrated receipt whose `original.ownerUid` / `original.ledgerId` does not match the caller remains `forbidden`.

`InMemoryGoodsLedger` remains a labelled simulation (`simulated-domain-test`) and is not this adapter.

Undefined object properties: `inputShapeError` omits them (they are not non-JSON). The adapter `normalizeJsonCopy`s a **copy** of caller input before digest/validation/persistence and does not mutate the caller. Required fields still fail after omit. Undefined/sparse array entries remain `invalid`. Clock/UUID/commit failures still throw.

`serverAcceptedAtUtc` / `serverRegisteredAtUtc` are sampled from `clock.nowMs()` at the start of the successful attempt. That is the attempt clock, not Firestore commit time. `firestoreCommitTime` is stored as `null` in this slice and must not be described as an actual commit timestamp. It is excluded from hashes.

`pending_deletion` remains `forbidden` with **no** replay exception for register, reconcile, or mutations.

## Transaction read/write set (register)

Each attempt reads identity/admission first, then validates the command, then samples `clock.nowMs()` **before serial/FY and remaining document reads** (production clock = Functions `Date.now()` later; test clocks are not production timestamps). IST FY uses that instant. Reported arrival is not used for FY or serial.

Reads (all before any write): `users/{uid}`, ledger (when `ledgerId` is a safe document id), `users/{uid}/goodsEvidenceAdmission/runtime`, then after admission and command validation: `commands/{commandId}`, `receipts/{receiptId}`, `serials/{fyToken}`. Checks run in order: unauthenticated → user / `pending_deletion` / inactive → ledger owner + `active` (when `ledgerId` is a safe document id) → admission config (including gated `newCommands` / `reconciliation`) → command validation. Feature policy is not skipped for a malformed envelope or client digest mismatch.

Writes (new issue only, atomic): serial allocation, original snapshot, view + line projections, event, command receipt.

Retries: adapter loop only on gRPC/Firestore **ABORTED** (`code === 10` or `"ABORTED"` / `"aborted"`), `maxAttempts` 1 per Firestore call. gRPC **UNAUTHENTICATED** (`16`) is not retryable. Error message text is not used. No external side effects. A failed attempt publishes no number. Crossing the IST FY boundary on retry reallocates against the new FY counter.

`grin_g1_committed` is emitted **once**, only after `runTransaction` resolves, and only for a new registration (`ok && replayed === false`). Aborted attempts, commit failures, and stored-result replays do not emit it. `grin_g1_replayed` remains an attempt/replay diagnostic, not a commit. Logging failures are swallowed and cannot change the transaction result.

The adapter captures the attempt result in a local variable after determining reads/writes. It does not depend on the Firestore SDK returning the callback value (the emulator may drop that return). An aborted attempt is not returned to the caller.

`grin_g1_mutation_committed` is emitted once after `runTransaction` resolves for a new mutation (`ok && replayed === false`), never on abort/replay.

`firestoreCommitTime` stays `null` in this slice (canonical exclusion; not mixed into `eventHash`). Null here is a placeholder, not evidence that Firestore committed at a known time. The injected test clock is not live server/commit-time evidence. Persistence writes JSON-clone documents so omitted `undefined` object fields match canonical JSON; adapter input is separately normalized on a copy before digest.

## Serial counters

Counter path: `…/serials/{fyToken}` with `{ fyToken, nextSerial, lastIssuedSerial }`. Scope is owner + ledger + IST FY (series remains `body.series` on the issued number; numbering policy is unchanged).

- **Absent** document: allocate serial `1`.
- **Existing** document: require integer `nextSerial` / `lastIssuedSerial`, `fyToken` match, and `nextSerial === lastIssuedSerial + 1`. Strings, fractions, zero, negatives, missing fields, and inconsistent pairs return `integrity` with **zero writes**. No coercion, truncation, reset, or repair.
- Well-formed `nextSerial === 1000000` and `lastIssuedSerial === 999999` returns `serial_exhausted` (no restart).
- Valid next allocation uses the stored integer as-is.

## Line identities

`lineId` is admitted only as `[A-Za-z0-9_-]{1,64}` excluding `__proto__`, `constructor`, and `prototype` (never rewritten). Projections use a null-prototype map and require an own property per original line. `toString` is an ordinary admitted id and must round-trip through JSON persistence with matching quantity balances. Duplicate line IDs remain invalid.

## Runtime input limits (not legal requirements)

- Envelope ≤ 256 KiB UTF-8 bytes
- Strings ≤ 500 UTF-16 code units
- ≤ 50 lines
- Nesting depth ≤ 32; object/array nodes ≤ 4096 (before recursive walks / `JSON.stringify`)
- IDs `[A-Za-z0-9_-]{1,64}`; commandId 8–128; `/`, `.`, `..` rejected (never rewritten)
- Object `undefined` omitted by canonical JSON and by adapter `normalizeJsonCopy` (copy; caller input is not mutated); sparse/undefined array slots rejected
- `reconcile` accepts `unknown` and rejects null/arrays/wrong shapes with `invalid`
- Non-JSON values (bigint, functions, Dates, circular structures) are `invalid` at the adapter boundary; clock/UUID/commit failures still throw

## Typecheck

`npm run typecheck:goods-evidence-g1` uses `tools/goods-evidence-emulator/tsconfig.json` (adapter + intended domain files). Root `tsc` still excludes this folder. Production `functions` packaging is unchanged (`lib/index.js` entrypoint). Included in `ci:verify` and `lint`.

## Error contract

| Code | When |
|---|---|
| `unauthenticated` | missing uid |
| `forbidden` | missing/inactive user, pending_deletion, retired/foreign ledger (generic `denied`; no existence leak) |
| `policy_denied` | missing/malformed config, or gated submit/reconcile |
| `not_found` | authorized reconcile of a missing command; authorized mutation of a missing or unreadable receipt |
| `invalid` | IDs, envelope, size, sparse arrays, extra keys, domain validation |
| `integrity` | existing serial counter is present but malformed (zero writes; no repair) |
| `serial_exhausted` | well-formed counter has issued 999999 (no restart) |
| `digest_conflict` | same commandId, different digest, while submit is allowed (not returned to pending_deletion / inactive callers) |
| `receipt_exists` | receipt already issued under another command |

Auth uid wins over envelope `ownerUid`. Client-supplied server fields (`issuedNumber`, serial, hashes, …) are rejected.

## Admission matrix

Feature policy applies only after auth, owner, active-account, and ledger checks.

| newCommands | reconciliation | New register | Submit matching digest | Reconcile missing | Reconcile existing |
|---|---|---|---|---|---|
| allow | allow | tx | stored result, 0 writes | `not_found` | stored result, 0 writes |
| deny | allow | deny | `policy_denied` (no replay) | `not_found` | stored result, 0 writes |
| allow | deny | tx | stored result, 0 writes | `policy_denied` | `policy_denied` |
| deny | deny | deny | `policy_denied` | `policy_denied` | `policy_denied` |
| missing/malformed | — | deny | `policy_denied` | `policy_denied` | `policy_denied` |
| pending_deletion | — | `forbidden` | `forbidden` (no replay exception) | `forbidden` | `forbidden` |

Denied reconcile uses `policy_denied` whether or not the command exists. Cross-owner requests that fail the ledger/owner check use `forbidden` for both existing and missing command ids.

## Simulation vs backend

`InMemoryGoodsLedger` `simulated-domain-test` is not authority.
`isGoodsEvidenceEnabled` / store-runtime blocking is client admission and is **not** consulted by this adapter.
Trusted identity is the authenticated uid plus Admin-seeded user/ledger/config documents.
