# G2 Wave 1 remaining work

Implemented on `team/grin-t2-evidence`: domain lifecycle, injected adapter, Storage+Firestore emulator harness, reviewed Storage Rules proposal.

## Remaining (not this slice)

- Coordinator: add proposed scripts + tsconfig exclude; do not enable GRIN
- Team 1: consume `VerifiedEvidenceResult` in `linkVerifiedEvidence` (receipt event + pointer; do not rewrite `original`)
- Packaging a production callable from `src/goodsEvidence` (generated copy); adapter stays out of `functions/src/index.ts` until authorized
- Authorized live Storage Rules merge + IAM review
- Retention/deletion of GRIN objects after `pending_deletion` (unresolved policy; do not alter deletion jobs here)
- Native device streaming hasher; host tests are not process-death proof
- Production download path (authenticated stream / short-lived signed URL)
- Encrypted-backup (explicitly out of scope)

## Blockers (stated)

- Live Storage/IAM/lifecycle/retention locks are not authorized
- Emulators cannot prove production IAM or administrator immutability
- Absolute immutability against administrators is not claimed
