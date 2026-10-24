# Design closeout A–D (no architecture rewrite)

Checkpoint `55f2df1405c296336eea058238c8ae24e7a8b370`. Support policy v2 unchanged.
Slice 2 not implemented. Production Functions/compiler not modified.

## A. Admission table (corrected)

Config (Admin-only, never request-body):

`_goodsEvidenceAdmission/runtime`
`{ schemaVersion: 1, newCommands: "allow"|"deny", reconciliation: "allow"|"deny" }`

Feature-policy rows apply only after authentication, owner authority, active-account
and ledger checks succeed. Those checks stay independent of this table.

Missing/malformed config → both operations denied.

**Selected submit contract** when a matching command is already committed
(`newCommands=allow`, `reconciliation=deny` or `allow`):

Submit is not the reconciliation RPC. If submit finds the same owner+ledger+commandId
with the same digest, it **returns the authorized stored result with zero writes**.
If the digest differs: `digest_conflict`, zero writes. **Never duplicate** the
registration. This is register idempotency, not the separate reconciliation channel.

Reconciliation RPC remains independently gated by `reconciliation`.

| newCommands | reconciliation | New register | Submit hits committed matching digest | Separate reconcile RPC | Reconcile missing |
|---|---|---|---|---|---|
| allow | allow | admit (tx) | return stored result, 0 writes | return stored result, 0 writes | not a write; `not_found` |
| deny | allow | deny | deny (submit is a newCommands operation) | return stored result, 0 writes | `not_found`, 0 writes |
| allow | deny | admit (tx) | return stored result, 0 writes (idempotent submit) | deny | deny (no existence disclosure beyond generic deny) |
| deny | deny | deny | deny | deny | deny |
| missing/malformed | — | deny | deny | deny | deny |

Other rows (unchanged, not feature-policy):

| State | New register | Reconcile / existence |
|---|---|---|
| Unauthenticated / missing user | deny | deny; no existence leak |
| Cross-owner | deny | deny; do not reveal whether a command exists |
| `pending_deletion` / deleted / disabled | deny | deny (P7 unapproved; no payload replay) |
| Retired ledger | deny | deny |

A missing command on reconciliation **never becomes a write**.

**Register transaction reads (before any write):** admission config, `users/{uid}`,
ledger, `commands/{commandId}`, `serials/{fyToken}`, `receipts/{receiptId}`.

## B. Packaging (preserved)

Future adapter: `tools/goods-evidence-emulator/**` only.
Do not change `functions/tsconfig.json`, `functions/package.json`, or production exports.

Compiler experiment artifacts: `compiler-experiment/` (see README).
Executor: Cursor ran it. Independent reviewer must re-run to reproduce.

## C. Future register parity (plan only — no extraction now)

When a first slice is authorized, the emulator adapter must not become a second
GRIN definition. Parity test (future file:
`tools/goods-evidence-emulator/register.parity.test.ts`):

Same inputs into both oracles:

- Frozen command (`freezeCommand` digest)
- ownerUid + ledgerId
- serial counter state (`nextSerialByFy` / `fyToken`)
- injected `clock.nowMs()`
- injected `clock.uuid()` event id

Compare:

- original snapshot + `originalSnapshotHash`
- event envelope + `eventHash` / `previousHash`
- issuedNumber + fyToken + serial
- effective/current projections
- initial line balances
- stored command result (`replayed`, receiptId, eventVersion, headHash)

**How the harness loads the domain oracle without importing client runtime
into the future server adapter:**

- Adapter code under `tools/goods-evidence-emulator/` may import only
  alias-free domain files (`canonical`, `constants`, `time`, `grinNumber`,
  `validate`, `quantities`, `types`) via relative paths inside that tool’s
  tsconfig. It must not import `@/utils/sha256Hex`, `@/config`, `localDb`,
  React, or `functions/src`.
- The **parity test file** (not the adapter) loads `InMemoryGoodsLedger` from
  `src/goodsEvidence/ledger.ts` using the repo test tsconfig (`@/` allowed in
  tests only). That test is outside the production Functions compiler.
- Hashing for the adapter: Node `createHash("sha256").update(canonical, "utf8")`
  against `canonicalJson`. Do not fork a second canonicalizer.
- No domain rewrite, no adapter implementation in this assignment.

## D. Validation semantics (prototype caps = technical safeguards, not quota)

Retain:

- Request body ≤ **256 KiB UTF-8 bytes** (byte length, not JS string.length).
- Present text fields ≤ **500 UTF-16 code units** (`String.length` in JS). That
  is not a UTF-8 byte cap and not a grapheme cap. Supplementary characters
  count as 2.
- Lines ≤ 50.
- IDs `[A-Za-z0-9_-]{1,64}`; `commandId` 8–128 same charset; reject `/`, `.`, `..`.
- Invalid IDs are **rejected**, never silently rewritten (digest-stable).
- Object `undefined` fields follow accepted canonical **omission**.
- `null` is kept.
- Undefined / sparse array entries remain **rejected**.
- Extra envelope fields rejected.
- Server-generated fields (`serverRegisteredAtUtc`, `issuedNumber`, serial,
  hashes, eventId) are not trusted client authority if supplied.
- Forged `ownerUid` on the callable is ignored; auth uid wins.
- Slash `receiptId` may pass domain trim-check and **must** fail the adapter.

No commercial quota is implied by these caps.
