# G2 Wave 1 remaining work

Implemented on `team/grin-t2-evidence`: domain lifecycle, injected adapter, Storage+Firestore emulator harness, reviewed Storage Rules proposal, W2-03 identity/category replay, W2-04 retained-read matrix on the isolated Rules copy.

## Remaining (not this slice)

- Coordinator: add proposed scripts + tsconfig exclude; do not enable GRIN
- Team 1: consume `VerifiedEvidenceResult` in `linkVerifiedEvidence` (receipt event + pointer; do not rewrite `original`)
- Team 3: add `category` to outbox upload input and identity fields to `GrinEvidenceUploadResult` (Team 2 already returns them from the evidence port)
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
