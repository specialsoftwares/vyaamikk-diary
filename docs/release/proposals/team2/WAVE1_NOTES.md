# G2 Wave 1 remaining work

Implemented on `team/grin-t2-evidence`: domain lifecycle, injected adapter, Storage+Firestore emulator harness, reviewed Storage Rules proposal, W2-03 identity/category replay, W2-04 retained-read matrix on the isolated Rules copy, F3 retrieve + pack-input assembly (paths A and B at G2).

## Remaining (not this slice)

- Coordinator: add `pack.injected.test.ts` to `test:goods-evidence-g2-unit`; export `assembleEvidencePackInputs` from `src/goodsEvidence/index.ts` if Team 4 should use the barrel; do not enable GRIN
- Team 1: consume `VerifiedEvidenceResult` in `linkVerifiedEvidence` (receipt event + pointer; do not rewrite `original`)
- Team 3: optional retrieve/list/link methods on `GrinEvidenceUploadPort`; keep local original until `originalDurable`; never release on thumbnail success
- Team 4: `exportPack` should call `assembleEvidencePackInputs` + `assembleManifest` from confirmed events and retrieved originals (see `F3_EVIDENCE_PATH.md`)
- Packaging a production callable from `src/goodsEvidence` (generated copy); adapter stays out of `functions/src/index.ts` until authorized
- Authorized live Storage Rules merge + IAM review
- Retention/deletion of GRIN objects after `pending_deletion` (unresolved policy; do not alter deletion jobs here)
- Native device streaming hasher; SQLITE_HOST / INJECTED whole-file Node `readFile` is not a native memory-safety claim
- Production download path (authenticated stream / short-lived signed URL)
- Encrypted-backup (explicitly out of scope)

## Blockers (stated)

- Live Storage/IAM/lifecycle/retention locks are not authorized
- Emulators cannot prove production IAM or administrator immutability
- Absolute immutability against administrators is not claimed
