# G2 Storage Rules proposal (GRIN originals) — review only

**Status:** proposal. **Not deployed.** Do not edit live `storage.rules` from this text.
**Not encrypted-backup.** GRIN remains default-off.
**Emulator copy:** `tools/goods-evidence-storage/storage.rules` (Firestore 8091 / Storage 9200). Isolated. Do not deploy that copy either.

Live `storage.rules` today covers letterhead, attachments, PDFs, and company GST artefacts. This proposal **adds** GRIN original/derivative paths and keeps the existing default deny. Merge requires a later authorized Rules review; Team 2 must not publish the live file in this programme.

## Policy this proposal implements

Upload **admission** is separate from **reading already-retained evidence**. Stopping `newCommands` must not erase access to retained originals.

- Owner-only create/read on `users/{uid}/grinEvidence/{objectKey}/original` and `.../derivatives/{derivativeKey}`
- Random object keys in the path; no receipt, category, filename, invoice, or GSTIN
- Every allow also requires:
  - signed-in owner (`request.auth.uid == userId`)
  - user `status == active` (pending_deletion / inactive denied)
  - a Firestore objectKey binding at `users/{uid}/grinEvidenceObjectKeys/{objectKey}`
  - that binding's `ledgerId` maps to `users/{uid}/goodsEvidenceLedgers/{ledgerId}` with `ownerUid == uid` and `status == active` (retired/foreign ledger denied)
- Original **create** additionally requires admission `newCommands == allow` and a **flight** reservation (`state` is `reserved` or `uploading`)
- Original **read**:
  - flight (`reserved` / `uploading`): also requires `newCommands == allow`
  - retained (`uploaded_unverified` / `verified` / `linked`): allowed even when `newCommands == deny` (history and packs)
  - `rejected` / missing binding: deny
- Derivative **create** requires `newCommands == allow`, a verified/linked parent, **and** a per-derivative reservation at `users/{uid}/grinEvidenceDerivativeKeys/{derivativeKey}` (`reserved`/`uploading`, matching `parentObjectKey`, kind `thumbnail`|`preview`|`ocr`). Parent object-key binding alone does not authorize arbitrary derivatives.
- Derivative **read**: verified/linked parent; not gated on `newCommands`
- Original and derivative **update/delete denied** to the client SDK
- Original create: allowed MIME + size; no client verification metadata
- Default deny for every other path, including public reads
- Download tokens are **not** an access-control object; store `storagePath`, never mint a public URL from this adapter
- No cross-user read. No `allow read: if true`

Admin SDK / Cloud Functions bypass these rules. Authorization for verify/link remains in the adapter (owner / ledger / receipt), including final-transaction reauthorization in `commitState` and lifecycle-version fencing so a stale patch cannot overwrite a newer verification/linkage result. Rules are necessary but not sufficient.

## Client SDK state / policy matrix

All rows assume the caller is the signed-in owner with `users/{uid}.status == active` and the bound ledger is active and owned by that uid. Any other caller is deny.

| objectKey.state | create original | read original | create derivative | read derivative | `newCommands=deny` |
|---|---|---|---|---|---|
| missing / unreserved | deny | deny | deny | deny | deny |
| `reserved` / `uploading` | allow if admission allow | allow if admission allow | deny (parent not retained-verified) | deny | deny create and in-flight read |
| `uploaded_unverified` | deny (no overwrite) | **allow** | deny | deny | **read original still allow**; create deny |
| `verified` / `linked` | deny (no overwrite) | **allow** | allow if admission allow **and** derivative reservation | **allow** | **read original and derivative still allow**; create deny |
| `rejected` | deny | deny | deny | deny | deny |

`update` / `delete` of originals and derivatives is **always deny**.

## Proposed additional matches (merge into live `storage.rules` after review)

See the isolated emulator copy `tools/goods-evidence-storage/storage.rules` for the executable functions (`canUploadOriginal`, `canReadOriginal`, `canCreateDerivative`, `canReadDerivative`, `boundLedgerActive`, `hasDerivativeFlightReservation`). Keep existing letterhead / attachments / pdfs / `company/**` denies and the final `match /{allPaths=**} { allow read, write: if false; }`.

## Firestore metadata (also proposal-only)

Client SDK must not create/update/delete:

- `users/{uid}/goodsEvidenceLedgers/{ledgerId}/evidenceObjects/{evidenceId}`
- `.../receipts/{receiptId}/evidenceLinks/{evidenceId}`
- `.../receipts/{receiptId}/evidenceControl/{docId}`
- `users/{uid}/goodsEvidenceUploadControl/{docId}`
- `users/{uid}/grinEvidenceObjectKeys/{objectKey}` (adapter-written reservation lookup)
- `users/{uid}/grinEvidenceDerivativeKeys/{derivativeKey}` (adapter-written derivative reservation)

Owner may read `users/{uid}`, `goodsEvidenceAdmission/runtime`, `grinEvidenceObjectKeys/{objectKey}`, `grinEvidenceDerivativeKeys/{derivativeKey}`, and evidence metadata. Writes stay adapter/Admin. Isolated emulator file: `tools/goods-evidence-storage/firestore.rules`.

## Download / token access

- Canonical reference is `storagePath` plus bound `generation`
- This adapter never calls `getDownloadURL` and never logs token URLs
- Production download should be authenticated `getBytes` / streaming, or a short-lived signed URL issued only after the same owner/ledger/receipt gate
- Firebase download-token URLs are **not** equivalent to IAM

## Adapter fencing (not Storage Rules)

`commitState` re-authorizes in the final transaction (ER-2) and refuses a stale lifecycle patch that would overwrite a newer `verified` / `linked` generation, hash, or `VerifiedEvidenceResult`. Client SDK cannot update the object, so Rules already prevent client clobber; the adapter fence covers overlapping worker retries.

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

Trusted verification hashes stored bytes in 64 KiB chunks. Full-file base64 is not the default. The emulator Admin `download()` path, if used, is test-only; the adapter `open()` uses a byte stream and re-chunks. The INJECTED/SQLITE_HOST Node `readFile` of a local path is a whole-file test reader, not a native memory-safety claim.

## Activation

Do not deploy these rules, enable GRIN admission, or wire a production callable from this proposal.
