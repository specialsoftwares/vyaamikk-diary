# GRIN protection missing from main

Main does not have the goods-receipt protection that is on `integration`. This correction does not port it and does not treat the current main client as equivalent.

## Present on main

`internal-grin` enables the goods-evidence client flags. The G2 lifecycle in `functions/src/goodsEvidence/g2/adapter.ts` can reserve, upload, verify, and link. `completeUpload` retries only while the record is `uploaded_unverified` and the stored generation still matches. `functions/src/goodsEvidence/productionCompose.ts` reads the current object and returns null when the generation differs. The seven GRIN callables are exported without `CONTENT_DATA_KEY`. The client upload in `src/services/grin/transport/evidenceTransport.ts` sets `contentType` only.

## Missing for the full-feature release

The additional work, already implemented on `integration` and absent from this branch, is:

1. Client upload metadata `customMetadata: { vydEvidence: "pending" }` on the original object. Live Storage Rules allow that pending marker and reject verification metadata. The main client does not send it.
2. `completeUpload` handling for an `uploaded_unverified` object whose generation changed: return the record without committing (`lifecycleOk(record, false)`) so the callable can authenticate the replacement. Also accept an unchanged generation when the record is already `verified` or `linked`. Main denies every state other than the matching `uploaded_unverified` retry.
3. Generation-bound sealing in `wrapAdminBlobStore`: seal a pending object only for the generation being read, authenticate a replaced generation before returning plaintext, and fail closed when that authentication does not match. Main's `open` has neither the seal nor the replacement check.
4. Bind `CONTENT_DATA_KEY` on the seven production GRIN callables the way `integration` does in `functions/src/goodsEvidence/productionExports.ts`. Main's wrappers declare no secrets. The secret itself is also absent; creating it is a separate authorization described in `content-key-plan.md`.
5. Keep `GRIN_GOODS_EVIDENCE_FUNCTIONS=true` on the deployed services. Do not deploy `storage.rules` from this repository over the live ruleset: the repository file does not contain the `grinEvidence` path, and the live ruleset is the one that allows the owner upload.

A full-feature release needs that work reviewed from `integration` or reimplemented on `main` after this correction. Shipping the current main client does not provide it.
