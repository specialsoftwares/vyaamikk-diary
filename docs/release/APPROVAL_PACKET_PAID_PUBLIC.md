# Approval packet 2 — full paid public candidate

**Do not approve paid public release from this packet. End-to-end evidence is still missing.**

## Remaining source / PR set

- Keep original #20–#25 HOLD until independently accepted
- Combined candidate `release/public-android-combined` contains their union plus VYD-38/39 and App Check source
- Independently retrieved Actions on reviewed head `6c46a70`: run `35446043899` job `105905020493` SUCCESS; checkout `40ba879` merge into main `79d405d`; `test:all` **139/139** in 370.3s; `ci:verify` PASS including Expo config and invoice-renderer Docker
- This continuation adds source after that head. Application commit `fe55c226c07a1263d88663036e5f86d985cbb494`. Local `test:all` **139/139 in 429.5s**; `LIVE_RULES_COMPAT` PASS including production save callers. **Require fresh Actions on `fe55c22` (and any later docs-only SHA) and its tested merge-ref**. Do not reuse 139/139 from `6c46a70` as the count for the new head.

## Gates (keep separate)

| Gate | Status |
| --- | --- |
| Source combination + VYD-38/39/App Check/Rules-compat source | Implemented on isolated branch; not independently re-reviewed after this continuation |
| Deploy (Rules, billing Functions, flags, RTDN/IAM/KMS) | HOLD |
| Device (Play-installed production AAB) | HOLD — not built |
| Store (products, license testers, upload, listing) | HOLD |
| Legal / owner facts | HOLD — `OWNER_LEGAL_FACT_REQUEST.md` |
| Merchant KYC / payments readiness | **Human owner work, separate from app code** — see audit note. Not an app-source gate. |

## Backend / config still required (later approved deploys)

- Canonical quota Firestore Rules (not only the billing-off compat patch) if enforcement-true accounts should save
- Billing Functions deploy: `validateAndActivateAndroid`, `prepareAndroidBillingAccount`, `androidRtdn`, `updateBillingDetails`, `scheduledBillingReconciliation`
- Flags still default closed: `PLAY_BILLING_ENABLED`, `UPDATE_BILLING_DETAILS_ENABLED`, `BILLING_RECONCILIATION_ENABLED`, `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED`, `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED`
- Readable `subscription/status` + `usageCurrent` + history + billingDetails (compat patch or full Rules)
- RTDN Pub/Sub + IAM
- KMS + diagnostic secret
- Play products/base-plans matching `vyd_*` catalog — **store-unverified this session unless a later read-only pass succeeds**
- License testers
- App Check: native tokens on a Play-installed binary, then monitor, then optional enforcement. JS CustomProvider **not accepted** (app-identity constraint). Phone Auth ≠ App Check.

## Management / reconciliation / GST

- Settings → Subscription & billing is session-owned (UID+generation+op)
- Quota presentation compares `monthKey` to current IST month; 80% warning on the subscription screen **and** a You-dashboard banner that opens Settings → Subscription (no purchase CTA; purchase-entry remains default-off)
- Billing details: incomplete drafts may save; invoice-ready needs recipient, address1, 6-digit PIN, GST state. GSTIN optional; never client-verified
- Purchase entry is default-off independent of the quota-upsell gate
- Reconciliation: unique invocation IDs, live leases unclaimable, lease-checked worker complete (webhook resolve remains distinct), operator restores attempt budget and refuses active leases, config-disabled does not terminal-burn jobs, paginated due scan + indexes, structured adapter outcomes, stale-company **and never-reconciled (`lastReconciledAt == null`)** maintenance, ledger actual-vs-estimated commission reporting (nulls stay unknown). Flags closed. Documents that omit the `lastReconciledAt` field entirely are still outside the Firestore equality query.
- Tax-document handoff is a separate deploy dependency; ledger insertion does not create an invoice
- Owner/CA must still confirm tax-responsibility policy

## Real-store test matrix (pending a binary)

Purchase, restore, acknowledge, renewal, cancel-with-remaining-access, expiry, refund vs revocation, RTDN delayed/duplicate, process death during purchase, manage/cancel URL, license-tester vs non-tester.

## Legal / listing / KYC

Drafts in `docs/release/play-listing/DRAFTS.md`. Owner fact request in `OWNER_LEGAL_FACT_REQUEST.md`. Merchant KYC is owner-handled via Play payment profile/support; authenticity of any PA-CB email is not established here. No Console submit.

## External actions still gated

Main merge, EAS production AAB, Play upload, production flags, public rollout.
