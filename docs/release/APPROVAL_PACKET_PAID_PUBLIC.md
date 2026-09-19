# Approval packet 2 — full paid public candidate

**Do not approve paid public release from this packet. End-to-end evidence is still missing.**

## Remaining source / PR set

- Keep original #20–#25 HOLD until independently accepted
- Combined candidate `release/public-android-combined` @ `5d148f355a82a6bfae8b176d101ebce0b9877d16` contains their union plus VYD-38/39 and App Check source
- Local `test:all` **139/139 PASS** (2026-09-19) on this candidate. GitHub Actions `ci:verify` has not run on this SHA. Invoice-renderer Docker is not in `test:all`; include it in CI. Label local skips.

## Backend / config still required (later approved deploys)

- Canonical quota Firestore Rules (not only the billing-off compat patch) if enforcement-true accounts should save
- Billing Functions deploy: `validateAndActivateAndroid`, `prepareAndroidBillingAccount`, `androidRtdn`, `updateBillingDetails`, `scheduledBillingReconciliation`
- Flags still default closed: `PLAY_BILLING_ENABLED`, `UPDATE_BILLING_DETAILS_ENABLED`, `BILLING_RECONCILIATION_ENABLED`
- Readable `subscription/status` + `usageCurrent` + history + billingDetails (compat patch or full Rules)
- RTDN Pub/Sub + IAM
- KMS + diagnostic secret
- Play products/base-plans matching `vyd_*` catalog — **store-unverified this session**
- License testers
- App Check: native+JS tokens on a Play-installed binary, then monitor, then optional enforcement. CustomProvider bridge **not accepted**. Phone Auth ≠ App Check.

## Management / reconciliation / GST

- Settings → Subscription & billing is wired in source
- Billing details save is fail-closed until `UPDATE_BILLING_DETAILS_ENABLED`
- Reconciliation consumer exists; scheduler fail-closed; does not grant from notification type
- GSTIN: format only; no automatic ITC promise
- Owner/CA must still confirm tax-responsibility policy

## Real-store test matrix (pending a binary)

Purchase, restore, acknowledge, renewal, cancel-with-remaining-access, expiry, refund vs revocation, RTDN delayed/duplicate, process death during purchase, manage/cancel URL, license-tester vs non-tester.

## Legal / listing

Drafts in `docs/release/play-listing/DRAFTS.md`. Owner fact request in `OWNER_LEGAL_FACT_REQUEST.md`. No Console submit.

## External actions still gated

Main merge, EAS production AAB, Play upload, production flags, public rollout.
