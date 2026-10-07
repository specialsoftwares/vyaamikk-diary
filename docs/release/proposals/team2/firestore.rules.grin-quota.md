# Proposed firestore.rules note (Team 2) — DO NOT apply from this worktree

Coordinator-owned: repo-root `firestore.rules`. Team 2 did not edit it.

## Issuance quota

GRIN first issuance consumes ordinary monthly `usageCurrent` **via Admin SDK** in the G1 register transaction (`lastRecordCollection: "goodsEvidenceReceipts"`).

Admin bypasses Rules. **Do not** add `goodsEvidenceReceipts` to `quotaLinkedCollection(coll)`.

Receipts are stored at:

`users/{uid}/goodsEvidenceLedgers/{ledgerId}/receipts/{receiptId}`

not at `users/{uid}/goodsEvidenceReceipts/{id}`. Adding the token to `quotaLinkedCollection` would make `usageLinkedRecordCreatedInBatch` look at the wrong path.

Client Option-C still only links `entries` / `purchaseOrders` / `customerCreditRecords` / `professionalPacks`. Letterhead remains `quotaConsumption: "none"`.

`readUsageSnapshot` already accepts any non-empty `lastRecordCollection` string, so a historical `letterheadDocs` or a new `goodsEvidenceReceipts` label is readable. Malformed docs still throw.

## Optional comment-only patch (if coordinator wants Rules in sync as documentation)

After `quotaLinkedCollection`, add a comment only:

```
    // GRIN Admin issuance may write usageCurrent.lastRecordCollection
    // = 'goodsEvidenceReceipts'. That is not a client-writable collection
    // and must not be added to quotaLinkedCollection (wrong path).
```

No matcher change is required for G1 quota to work.

Coordinator (2026-10-06): **did not apply** this comment to repo-root
`firestore.rules`. The Team 5 issuance lock scans the
`quotaLinkedCollection` function text for `goodsEvidence` and would treat
the comment as a matcher change. Keep this file as the documentation.

## Storage accounting

`users/{uid}/goodsEvidenceStorage/accounting` is Admin-written. Client matchers should remain deny-by-default (no goodsEvidence in live Rules today). Isolated emulator Rules are under `tools/`, not live.
