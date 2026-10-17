# Merge constraint — GRIN issuance vs Option-C usageCurrent

Do not add a client-writable top-level `users/{uid}/goodsEvidenceReceipts/{id}`.

Repo-root `firestore.rules` `usageLinkedRecordCreatedInBatch` requires
`quotaLinkedCollection(coll)` and create of
`users/{uid}/{coll}/{rid}` in the same client batch.

GRIN receipts live at
`users/{uid}/goodsEvidenceLedgers/{ledgerId}/receipts/{receiptId}`.

Issuance quota must be consumed **only** from the Functions G1 register
Admin transaction (bypasses Rules). Sentinel
`lastRecordCollection` such as `goodsEvidenceReceipts` is fine on
`usageCurrent` because `readUsageSnapshot` accepts any non-empty string.
Later diary/PO/credit/pack client creates overwrite the pointer and still
`+1` the shared monthly counter.

Do not add `goodsEvidenceReceipts` to `quotaLinkedCollection` in
`firestore.rules`. If a Rules patch is ever required, it is a coordinator
shared-file change with its own review.

Replays of the same `commandId` must not increment.
Mutations/evidence/reconcile must not increment.
