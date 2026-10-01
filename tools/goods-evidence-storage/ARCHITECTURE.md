# G2 evidence storage — Wave 1 architecture

Not a live callable. Not production GRIN admission. Not encrypted-backup.
Support policy v2 is unchanged. Domain checkpoint remains PR #27.

## Packaging

- Domain lifecycle/bounds: `src/goodsEvidence/evidence.ts`
- Adapter + FAKE_* + emulator harness: `tools/goods-evidence-storage/**`
- Production `functions/src/index.ts` is unchanged
- Live `storage.rules` is unchanged; reviewed proposal is `docs/release/proposals/team2/storage.rules.grin.md`
- Adapter depends on injected `G2Firestore` + `G2BlobStore`, not `firebase-admin`
- Emulator config: `tools/goods-evidence-storage/firebase.json` (Firestore **8091**, Storage **9200**, project `demo-vyaamikk-grin-g2`). Isolated Rules. **Do not deploy.**

## Object identity

`evidenceId` is the domain id (owner + ledger + evidenceId). Storage paths use a **separate random object key**. Paths are:

`users/{uid}/grinEvidence/{objectKey}/original`
`users/{uid}/grinEvidence/{objectKey}/derivatives/{derivativeKey}`

No receipt id, category, filename, invoice number, or GSTIN in the path. Original bytes are never replaced by a thumbnail, preview, or OCR artefact.

## Lifecycle

`EvidenceObjectState` / `EVIDENCE_STATE_TRANSITIONS` in `src/goodsEvidence/ports.ts`.

Retry may remain in the same state. `rejected` and `linked` are terminal for that object id. Replacement after verification allocates a **new** evidenceId and object key; it must not inherit the previous `VerifiedEvidenceResult`.

Lost upload response: `uploading` + blob present → `recoverOrphan` → `uploaded_unverified`.
Missing blob after complete: `uploaded_unverified` → `orphan_pending_review`.
Orphan recovery hashes stored bytes or rejects if the original is gone.

## Verification and link

Client `claimedSha256` is a claim. Trusted verification streams stored bytes in `HASH_CHUNK_BYTES` (64 KiB) chunks, binds `generation`, and compares the claim. Link accepts only a `VerifiedEvidenceResult` whose hash/size/generation match the stored original. Finalize and link are idempotent.

## Authorization

Trusted uid, active user (no pending_deletion exception), ledger owner + active, receipt exists, admission `newCommands=allow` for new commands and verify/link. Auth uid wins over any body `ownerUid`. Cross-owner misses are `forbidden` (no existence leak). There is no global hash index. Isolated Storage Rules allow owner reads of retained (`uploaded_unverified` / `verified` / `linked`) originals even when `newCommands=deny`; that does not weaken adapter verify/link admission.

## Bounds (technical, not legal/quota)

| Limit | Value |
|---|---|
| PDF original | 15 MiB |
| Image original | 10 MiB |
| Derivative | 2 MiB |
| Originals per receipt | 24 |
| Derivatives per original | 8 |
| Concurrent uploads per owner | 2 |
| MIME | `application/pdf`, `image/jpeg`, `image/png`, `image/webp` |

Wave 1 original categories: supplier invoice, E-Way Bill, LR/GR/bilty, weighment, vehicle/number-plate, unloading/material, QC, acknowledgement.

## FAKE_* vs emulator

`FAKE_MemoryBlobStore` and `FAKE_createInjectedFirestore` are labelled fakes for unit tests. They are not production. Prefer Storage + Firestore emulator tests in this folder for blob generation and rules.

## Logging

Fixed names only: `grin_g2_denied`, `grin_g2_reserved`, `grin_g2_state`, `grin_g2_verified`, `grin_g2_linked`, `grin_g2_orphan`. No bodies, filenames, hashes, or download URLs.

## What emulators cannot prove

See `docs/release/proposals/team2/storage.rules.grin.md`. In particular: production IAM, object retention/holds, bucket public-access prevention, download-token behaviour in production, and administrator overwrite. This slice does not promise absolute immutability against administrators.
