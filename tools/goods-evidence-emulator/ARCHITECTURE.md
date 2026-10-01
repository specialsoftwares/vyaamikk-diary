# G1 architecture — durable register/reconcile (emulator slice)

Not a live callable. Not production GRIN admission. Support policy v2.
Domain checkpoint `55f2df1405c296336eea058238c8ae24e7a8b370`. Core candidate `6e3dbba` / docs `8b286ab`.

## Packaging

- Adapter: `tools/goods-evidence-emulator/**` only.
- Production `functions/src/index.ts`, `functions/tsconfig.json`, and `functions/package.json` are unchanged.
- Direct `functions/src` → `src/goodsEvidence` imports are forbidden (tsc `rootDir` lifts; `lib/index.js` would move).
- Adapter imports alias-free domain files via relative paths (`canonical`, `constants`, `time`, `grinNumber`, `validate`, `quantities`, `types`, `snapshot`, `custody`) plus `import type` of `RegisterGoodsReceiptBody`.
- Hashing: Node `createHash("sha256")` over `canonicalJson`. Not `@/utils/sha256Hex`.
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

Implemented: `registerGoodsReceipt` + independent `reconcile({ ledgerId, commandId })`.

Not in G1: amend, QC, returns, EWB screens, evidence upload, SQLite outbox, PDF packs.

## Transaction read/write set (register)

Each attempt samples `clock.nowMs()` **at the start of that attempt** (production clock = Functions `Date.now()` later; test clocks are not production timestamps). IST FY uses that instant. Reported arrival is not used for FY or serial.

Reads (all before any write): `users/{uid}`, ledger, `users/{uid}/goodsEvidenceAdmission/runtime`, `commands/{commandId}`, `receipts/{receiptId}`, `serials/{fyToken}`. Auth, owner, active-account, and ledger checks run before feature policy.

Writes (new issue only, atomic): serial allocation, original snapshot, view + line projections, event, command receipt.

Retries: adapter loop only on gRPC/Firestore **ABORTED** (`code === 10` or `"ABORTED"` / `"aborted"`), `maxAttempts` 1 per Firestore call. gRPC **UNAUTHENTICATED** (`16`) is not retryable. Error message text is not used. No external side effects. A failed attempt publishes no number. Crossing the IST FY boundary on retry reallocates against the new FY counter.

`grin_g1_committed` is emitted **once**, only after `runTransaction` resolves, and only for a new registration (`ok && replayed === false`). Aborted attempts, commit failures, and stored-result replays do not emit it. `grin_g1_replayed` remains an attempt/replay diagnostic, not a commit. Logging failures are swallowed and cannot change the transaction result.

The adapter captures the attempt result in a local variable after determining reads/writes. It does not depend on the Firestore SDK returning the callback value (the emulator may drop that return). An aborted attempt is not returned to the caller.

`firestoreCommitTime` stays `null` in this slice (canonical exclusion; not mixed into `eventHash`). The injected test clock is not live server/commit-time evidence. Persistence writes JSON-clone documents so omitted `undefined` object fields match canonical JSON; that clone is a persistence-only normalization.

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
- Object `undefined` omitted by canonical JSON; sparse/undefined array slots rejected
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
| `not_found` | authorized reconcile of a missing command |
| `invalid` | IDs, envelope, size, sparse arrays, extra keys, domain validation |
| `integrity` | existing serial counter is present but malformed (zero writes; no repair) |
| `serial_exhausted` | well-formed counter has issued 999999 (no restart) |
| `digest_conflict` | same commandId, different digest, while submit is allowed |
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
