# Packaging-slice review (Team 5)

AI QA / release-gate role, not human certification. This review covers
**new packaging source** at application SHA
`84c748d026d4229cded55d3ddc281a15858322c9` (parent docs `ba32337`).
Confirmation-refresh at `dcc325a` and FileHandle production reads were **not**
reopened (no new reproduction).

Wave 2 is **not accepted**. G6 is not closed. Native/device, live IAM,
Functions export, EAS, Play, billing, and public release stay separate.

## What was executed

| Check | Host | Result |
|---|---|---|
| Isolated Functions emulator: roundtrip + pack-complete + `production-compose.gates.emulator.test.ts` | EMULATOR `demo-vyaamikk-grin-t1` | exit 0. Compose source asserts `createProductionGrinCallables`. Client callable order reserve < begin < uploadEvidence. |
| G1 unit including packaging parity/drift | INJECTED | exit 0 |
| G2 unit + Storage emulator | INJECTED / STORAGE_EMULATOR | exit 0 after `hashAndBind` kept unfiltered `open()` so orphan restore still hashes current bytes |
| `functions` `tsc` | source | exit 0; `functions/package.json` `"main": "lib/index.js"` unchanged; no `rootDir` |
| Live Rules re-export | GCP | **blocked** HTTP 401 / `firebase login --reauth` |
| GitHub `ci:verify` on this SHA | Actions | **not run** — SHA is local until owner push. Prior successful run `37309701455` / job `111761813010` is head `ba32337` (docs packet), not this application. |

Emulator entry `tools/goods-evidence-emulator/functions-entry/compose.ts`
re-exports production compose. It does not wrap always-deny stubs.

## Verified for this slice

- Tests execute `createProductionGrinCallables` (Admin Firestore +
  `getStorage().bucket(storageBucket)`), not a parallel tools-only adapter.
- Stored-byte verify uses the bound bucket/object path and actual metadata
  generation; reads abort above `MAX_PDF_ORIGINAL_BYTES`; hash is independent
  of the client claim. Generation-filtered `open()` is used for retained
  retrieve, not for first-hash/`hashAndBind` (orphan restore).
- Fail-closed: unauthenticated, inactive, pending-deletion, missing/malformed
  admission, `newCommands=deny`, cross-owner/ledger, digest conflict, wrong
  hash/size/path/generation/receipt association. Feature env still requires
  exactly `"true"` in `composed.ts`.
- `functions/src/index.ts` still has no GRIN export. Packaging tests forbid it.
- Original Storage object and receipt document still `exists()` after
  operational `newCommands=deny`. G1 `readReceipt` still requires
  `newCommands=allow` — recorded, not faked.
- No secrets, OTPs, service-account JSON, or customer evidence in the new
  tests (synthetic 64-byte PDF prefix only).

## Not established (do not convert to pass)

- Live IAM conditions and Admin bypass of Rules
- GCS generation-precondition reads (emulator hashes latest after metadata match)
- NATIVE_DEVICE / Play-installed / RSS-PSS
- Additive live Rules merge (freshness blocker)
- Canonical GitHub `ci:verify` including renderer Docker **on `84c748d`**

## Bounded verdict

**Packaging source is accepted at labelled emulator hosts for this slice.**
It is not a live backend, not a device acceptance, and not Wave 2 / G6
closure. Remaining owner boundary: push `84c748d` to PR #31, then record
canonical CI on that head/merge-ref; separately authorize the seven-export,
Rules merge after re-auth, and Packet B visibility.
