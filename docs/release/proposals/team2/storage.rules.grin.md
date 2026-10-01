# G2 Storage Rules proposal (GRIN originals) — review only

**Status:** proposal. **Not deployed.** Do not edit live `storage.rules` from this text.
**Not encrypted-backup.** GRIN remains default-off.
**Emulator copy:** `tools/goods-evidence-storage/storage.rules` (Firestore 8091 / Storage 9200). Isolated. Do not deploy that copy either.

Live `storage.rules` today covers letterhead, attachments, PDFs, and company GST artefacts. This proposal **adds** GRIN original/derivative paths and keeps the existing default deny. Merge requires a later authorized Rules review; Team 2 must not publish the live file in this programme.

## Policy this proposal implements

- Owner-only read/create on `users/{uid}/grinEvidence/{objectKey}/original` and `.../derivatives/{derivativeKey}`
- Random object keys in the path; no receipt, category, filename, invoice, or GSTIN
- Original create: allowed MIME + size; no client verification metadata
- Original and derivative **update/delete denied** to the client SDK
- Default deny for every other path, including public reads
- Download tokens are **not** an access-control object; store `storagePath`, never mint a public URL from this adapter
- No cross-user read. No `allow read: if true`

Admin SDK / Cloud Functions bypass these rules. Authorization for verify/link remains in the adapter (owner / ledger / receipt). Rules are necessary but not sufficient.

## Proposed additional matches (merge into live `storage.rules` after review)

```
    function allowedGrinOriginalMime() {
      return request.resource.contentType == 'application/pdf'
        || request.resource.contentType == 'image/jpeg'
        || request.resource.contentType == 'image/png'
        || request.resource.contentType == 'image/webp';
    }

    function withinGrinOriginalSize() {
      return request.resource.contentType == 'application/pdf'
        ? request.resource.size < 15 * 1024 * 1024
        : request.resource.size < 10 * 1024 * 1024;
    }

    function noClientVerificationMetadata() {
      return !('rawSha256' in request.resource.metadata)
        && !('verified' in request.resource.metadata)
        && !('state' in request.resource.metadata)
        && !('generationBind' in request.resource.metadata)
        && !('verifiedAtUtc' in request.resource.metadata);
    }

    match /users/{userId}/grinEvidence/{objectKey}/original {
      allow read: if isOwner(userId);
      allow create: if isOwner(userId)
                    && resource == null
                    && allowedGrinOriginalMime()
                    && withinGrinOriginalSize()
                    && noClientVerificationMetadata();
      allow update, delete: if false;
    }

    match /users/{userId}/grinEvidence/{objectKey}/derivatives/{derivativeKey} {
      allow read: if isOwner(userId);
      allow create: if isOwner(userId)
                    && resource == null
                    && request.resource.size < 2 * 1024 * 1024
                    && request.resource.contentType.matches('image/.*')
                    && noClientVerificationMetadata();
      allow update, delete: if false;
    }
```

Keep existing letterhead / attachments / pdfs / `company/**` denies and the final `match /{allPaths=**} { allow read, write: if false; }`.

## Firestore metadata (also proposal-only)

Client SDK must not create/update/delete:

- `users/{uid}/goodsEvidenceLedgers/{ledgerId}/evidenceObjects/{evidenceId}`
- `.../receipts/{receiptId}/evidenceLinks/{evidenceId}`
- `.../receipts/{receiptId}/evidenceControl/{docId}`
- `users/{uid}/goodsEvidenceUploadControl/{docId}`

Owner-active read may be allowed later; writes stay adapter/Admin. Isolated emulator file: `tools/goods-evidence-storage/firestore.rules`.

## Download / token access

- Canonical reference is `storagePath` plus bound `generation`
- This adapter never calls `getDownloadURL` and never logs token URLs
- Production download should be authenticated `getBytes` / streaming, or a short-lived signed URL issued only after the same owner/ledger/receipt gate
- Firebase download-token URLs are **not** equivalent to IAM

## What Storage/Firestore emulators cannot prove

- Production IAM bindings, service-account roles, or uniform bucket-level access
- Google Cloud public-access prevention, domain restricted sharing, or VPC-SC
- Object Retention Lock, bucket lock, hold, or lifecycle/delete prevention against administrators
- Customer-managed encryption keys, retention after `pending_deletion` / `retireIdentity`
- Real download-token issuance, CDN caching, or token revocation
- Admin SDK / Console overwrite or delete (rules are bypassed)
- Cross-region replication, production generation uniqueness under load
- That a privileged project administrator cannot replace bytes

**Do not promise absolute immutability against administrators.** Client overwrite/delete deny is the Wave 1 claim. Object retention locks are out of scope (not authorized in this programme).

## Bounded hashing

Trusted verification hashes stored bytes in 64 KiB chunks. Full-file base64 is not the default. The emulator Admin `download()` path, if used, is test-only; the adapter `open()` uses a byte stream and re-chunks.

## Activation

Do not deploy these rules, enable GRIN admission, or wire a production callable from this proposal.
