# Privacy implementation — deployment and rollback

This is preparation. It does not deploy functions, rules, keys, or a migration.

## What source does

- Production diary, customer credit, purchase orders, professional packs, retained letterhead documents, and the sensitive profile fields go through `sealOwnerContent` / `openOwnerContent` when `CONTENT_SEAL_WRITES_ENABLED` is true. Shared-dev and local-mock stay plaintext.
- Readable operational metadata stays in the document: ids, phone, status, age result, deletion job fields, consent receipts, quota counters, serials, dates, and amounts. Names, addresses, letter text, pack notes, and the listed profile fields are the sealed body.
- Production attachment and letterhead uploads store an AES-256-GCM envelope only on the owner `letterhead` and `attachments` prefixes. Legacy `image/*` reads and writes remain. The `pdfs` prefix does not accept the envelope type. Generated PDFs stay local.
- Cash-receipt recovery opens the envelope before image validation. A session change during that open is rejected.
- `CONTENT_SEAL_WRITES_ENABLED = false` stops new envelopes and holds an edit of an already sealed record. It does not stop `shouldOpenContentSeals` from decrypting an existing record. A retry of an existing sealed create returns the opened business record.
- New deletion requests do not carry a client policy version or deadline. `ensureAccountDeletionJob` stamps policy version 2 from the server clock: reactivation at 13 days and erasure at 15 days. Stored deadlines are preserved. A missing legacy deadline stays request time plus 45 days. The no-job purge fallback copies those same fields.
- Restore suppression pages past the first 40 completed jobs, resumes from a cursor, and purges owned storage and GRIN as well as Firestore. GRIN uses the production list-and-delete adapter. A status flip alone is not complete.
- Unassessed and ineligible accounts cannot create protected business documents or write owned storage. A client profile update cannot change `ageEligibility`, the age policy version, the assessment time, or the age method. `recordAgeAssessment` itself has no age precondition. Authentication, support, privacy, sign-out, deletion, and account recovery stay reachable. Owner billing callables stay session-gated and are not age-gated; they do not seal diary, credit, purchase-order, pack, letterhead, or profile content. Play RTDN, App Store notifications, and the billing and deletion schedulers stay off the user-session cutoff.
- Purpose grant and withdrawal are stored at `users/{uid}/processingPurposes/{purpose}` with the notice version, policy version, and server `receivedAt`. Withdrawal calls `applyDiagnosticsChoice(false)` before the receipt write. Required service processing cannot be withdrawn. There is no second consent prompt.

## Callable and rule dependencies

Deploy these together. A newer client against older rules cannot request deletion, because the client no longer sends deadlines and the previous rules required them. Older rules plus the new functions still preserve a deadline that is already stored.

| Surface | Depends on |
|---|---|
| `recordAgeAssessment` | Admitted session. No age precondition. Admin write of the age result. |
| `sealOwnerContent`, `openOwnerContent` | Admitted session, eligible age, `CONTENT_DATA_KEY`. Collections: entries, attachments, customerCreditRecords, purchaseOrders, professionalPacks, letterheadDocs, users. |
| `recordProcessingPurpose` | Admitted session. No age precondition. Admin write of the receipt. |
| GRIN production callables | Admitted session and eligible age, then the existing GRIN composition. |
| `ensureAccountDeletionJob`, `completeAccountDeletion`, `retireIdentity` | Admitted session. Server clock when no deadline is stored. |
| `firestore.rules` | Eligible age on business creates and updates. Client updates cannot change the stored age result. Owner seals for diary, packs, and letterhead updates. Client deletion patch cannot include deadlines. Profile seal requires the sensitive fields to be null. |
| `storage.rules` | Eligible age and an open deletion job on writes. Envelope or image on letterhead and attachments. PDF type only on `pdfs`. |

Service-to-service billing and notification handlers are unchanged and do not call the age helper.

## Compatibility order

1. Create `CONTENT_DATA_KEY` before any functions deploy. Do not reuse the billing KMS key.
2. Deploy the functions first. They accept stored deadlines and stamp a missing deadline. They do not shorten a stored legacy date.
3. Deploy `firestore.rules` and `storage.rules` in the same release as the client that omits deletion deadlines and writes envelopes. Do not deploy those rules ahead of that client.
4. Do not run a backfill, turn letterhead creation back on, or purge in that release.

## Rollback

- Set `CONTENT_SEAL_WRITES_ENABLED` to false and ship that client. Existing envelopes still open. An edit of a sealed record is held and is not merged as plaintext.
- Do not delete sealed fields and do not destroy `CONTENT_DATA_KEY`.
- Do not recompute a deadline that is already stored.
- Rolling back rules restores the previous client deletion shape and the previous age check. It does not restore purged data.
- `recordAgeAssessment` can stay deployed during a client rollback. Removing it while the new client remains blocks unassessed accounts at the gate.

## Still pending

Live IAM for `CONTENT_DATA_KEY`, a real-device recovery, and processor deletion of Crashlytics, mail, and billing tails are not evidenced here. This note is not a deploy, a migration, or a purge.
