# Billing ops deployment manifest (not executed)

Status: proposed configuration only. Flags default closed. Enabling a client flag is not backend completion.

## Already exported in source (not an authorization to enable)

`functions/src/index.ts` exports billing callables. A 2026-10-01 read-only Cloud Functions v2 list showed the Android/iOS prepare/validate/RTDN/reconciliation/updateBillingDetails handlers **ACTIVE** in `asia-south1`. That supersedes older “necessarily undeployed” statements. Enablement flags were **not** proven true or false (see inspection section).

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

## Read-only live inspection (2026-10-01)

Corrects older lines in this file that said billing handlers were necessarily absent.

- Cloud Functions v2, region `asia-south1`, state ACTIVE: `prepareAndroidBillingAccount`, `validateAndActivateAndroid`, `androidRtdn`, `scheduledBillingReconciliation`, `updateBillingDetails`, `prepareIOSBillingAccount`, `validateAndActivateIOS` (and listed siblings from the same billing export set).
- `functions:config:get` returned `{}`. That empty runtime config **does not** prove `PLAY_BILLING_ENABLED=false`.
- On those v2 services, `PLAY_BILLING_ENABLED`, `UPDATE_BILLING_DETAILS_ENABLED`, `BILLING_RECONCILIATION_ENABLED`, `BILLING_RECONCILIATION_OPERATOR_ENABLED`, and `APPLE_BILLING_ENABLED` / `APPSTORE_BILLING_ENABLED` were **absent** from `serviceConfig.environmentVariables` and were **not** present as `secretEnvironmentVariables` keys.
- Source enablement is fail-closed (`=== "true"`). Absence is therefore **not** a stored `"false"` string. Effective enablement is recorded as **unknown** (no live purchase invocation; no secret values read).
- Client `eas.json` purchase-entry / quota-upsell remain explicit `"0"` on preview/production profiles. Hidden buttons are not used as proof of server flags.

This inspection did not change flags, invoke purchases, or mutate live data.

## Still pending (external)

Real-store validation, RTDN delivery proof, Play product creation, IAM for Android Publisher, KMS key + diagnostic secret, invoice-renderer remaining CI if skipped locally. **Handlers exist in Cloud Functions v2** as of 2026-10-01; they are not “necessarily undeployed.” Enablement flags remain **unknown**. Source still fences refund gross, report `scanStartedAt`, and lease-checked maintenance backoff; those corrections do not authorize a Functions deploy or billing activation.
