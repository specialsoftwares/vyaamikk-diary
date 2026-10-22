# Privacy implementation — deployment and rollback

This is preparation. It does not deploy functions, rules, keys, or a migration.

## What source does

- Production diary creates, updates, and reads go through `sealOwnerContent` / `openOwnerContent`. Shared-dev and local-mock stay plaintext.
- Production attachment uploads store an AES-256-GCM envelope. Letterhead display opens that envelope for the signed-in owner. Legacy images that are not envelopes still use the download URL.
- Generated PDFs stay local. `PDF_CLOUD_BACKUP_ENABLED` is false, and the upload helper rejects a `/pdfs/` path.
- New deletion requests use policy version 2: reactivation for 13 days and erasure at 15 days. Existing stored deadlines are not recomputed. A missing legacy deadline remains the request time plus 45 days.
- Policy version 2 includes GRIN in the existing purge. `INCLUDE_GRIN_IN_ACCOUNT_PURGE` stays false for legacy jobs. There is no second cron.
- The age gate is self-declared. The server does not store the date. Existing accounts stay unassessed until they pass. There is no reviewer bypass.

## Not sealed

Local diary SQLite stays plaintext. Customer credit, purchase orders, professional packs, and letterhead Firestore documents are still stored as readable fields. An old client can still create business data while the account is unassessed. Rules block an account only after the server has recorded `ineligible`, and they block a restored write when `deletionJobs/{uid}.status` is `completed`.

## Live prerequisites before any deploy

1. Create Secret Manager secret `CONTENT_DATA_KEY` as 32 bytes, base64. Do not reuse the billing KMS key or `EMAIL_OTP_HMAC_SECRET`. Do not put it in the client or in `EXPO_PUBLIC_*`.
2. Confirm the runtime service account can access that secret and cannot be used as a routine human database login. This source change does not prove that IAM.
3. Deploy `recordAgeAssessment`, `sealOwnerContent`, and `openOwnerContent` before or with the client that shows the age gate and writes seals. A client released first will stop unassessed accounts on the gate and cannot open a seal.
4. Deploy `firestore.rules` with those functions. Old plaintext diary rows remain readable. New production rows require the open callable.
5. Do not run a backfill, a live purge, or a key rotation in the same step.

## Rollback

- Stop new seals by setting `CONTENT_SEAL_WRITES_ENABLED` to false and shipping that client. Readers must keep accepting both plaintext and existing envelopes.
- Do not delete sealed fields and do not destroy `CONTENT_DATA_KEY` until every sealed object has been opened and written back, which this change does not do.
- Do not recompute `deletionScheduledFor` on accounts that already have one.
- Redeploying the previous rules removes the ineligible and completed-job checks. It does not restore data the purge has already deleted.
- The age gate is in the client. Rolling the client back returns unassessed accounts to the previous navigation. Leaving the new client in place without `recordAgeAssessment` blocks them.

## Evidence labels

Source tests and the Firestore emulator do not prove live KMS, IAM, deployed functions, or a device restore. Those remain live prerequisites.
