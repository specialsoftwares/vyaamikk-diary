# Billing ops deployment manifest (not executed)

Status: proposed configuration only. Flags default closed. Enabling a client flag is not backend completion.

## Already exported in source (not live)

`functions/src/index.ts` exports billing callables. Continuation 3 `firebase functions:list` did not include them. Deploying them is a later approved Functions deploy.

| Export | Flag (default closed) | Notes |
| --- | --- | --- |
| `prepareAndroidBillingAccount` / `validateAndActivateAndroid` / `androidRtdn` | `PLAY_BILLING_ENABLED=true` | Server-authoritative Play verification + acknowledgement |
| `prepareIOSBillingAccount` / `validateAndActivateIOS` / `appStoreServerNotificationsV2` | `APPSTORE_BILLING_ENABLED=true` | Not required for Android public |
| `updateBillingDetails` | `UPDATE_BILLING_DETAILS_ENABLED=true` | GSTIN format-valid only; never client-verified |
| `scheduledBillingReconciliation` | `BILLING_RECONCILIATION_ENABLED=true` | Scheduler; not a public HTTP worker |
| `retryReconciliationWorkItem` | `BILLING_RECONCILIATION_OPERATOR_ENABLED=true` plus admin claim + `BILLING_ADMIN_IDENTITY_PROVISIONED=true` | Operator requeue only |

## Validators / account preparation

- Play package `com.specialsoftwares.vyaamikkdiary`
- Products/base plans must match `functions/src/billing/products.ts` / `src/billing/iap/iapCatalog.ts`
- License testers for the first paid track
- Cloud KMS key `BILLING_KMS_KEY_NAME` for credential envelopes
- `BILLING_DIAG_UID_SECRET` for diagnostic HMAC
- RTDN: Pub/Sub push to `androidRtdn` with OIDC; App Check does not authenticate RTDN
- Firestore: canonical quota Rules **or** the hashed live-compat artifact, after drift compare — not both silently
- Owner-readable `subscription/status`, `usageCurrent`, `billingDetails`, `subscriptionBillingHistory`

## Rollback

Redeploy previous Functions revision. Set flags back to unset/false. Console App Check enforcement is separate and is not enabled by this source.

## Still pending (external)

Real-store validation, RTDN delivery proof, Play product creation (catalog empty as of 2026-09-20 Console read; this closeout did not re-inspect), IAM for Android Publisher, KMS key + diagnostic secret, invoice-renderer remaining CI if skipped locally. Billing Functions remain undeployed. Source now fences refund gross, report `scanStartedAt`, and lease-checked maintenance backoff; those corrections do not authorize a Functions deploy.
