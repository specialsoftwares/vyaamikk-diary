# Approval packet 2 — full paid public candidate

**Do not approve paid public release from this packet. End-to-end evidence is still missing.**

## Remaining source / PR set

- Keep original #20–#25 HOLD until independently accepted
- Combined candidate `release/public-android-combined` contains their union plus VYD-38/39 and App Check source
- Independently retrieved Actions on reviewed head `f875356`: run `35454180029` job `105926441702` SUCCESS; merge into main `79d405d`; `test:all` **139/139** in 374.4s; `ci:verify` PASS including Expo config and invoice-renderer Docker. **Do not reuse `6c46a70` / `35446043899`.**
- This continuation adds core-app corrections at `b5cfbf7050e1e75d30acf274e82ca90259f02950` and paid-backend follow-up at `24595dbd4ff6fe3c9c0031926e93ddeafae83954`. Local `test:all` **139/139 in 250.4s**; `test:billing-maintenance-emulator` PASS. **Require fresh Actions on the branch HEAD (this packet’s docs commit) and its tested merge-ref**. Do not reuse 139/139 from `f875356` as the count for the new head.

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
- Play products/base-plans matching `vyd_*` catalog — **Play Console 2026-09-20: no subscription products exist yet** (empty catalog). RTDN Pub/Sub topic empty. Creating products remains a gated store write.
- License testers — two email lists present (Known Testers: 2 users; Owner: 3 users); response `RESPOND_NORMALLY`. Licence testing does not cover Play Integrity.
- App Check: native tokens on a Play-installed binary, then monitor, then optional enforcement. JS CustomProvider **not accepted** (app-identity constraint). Phone Auth ≠ App Check.

## Management / reconciliation / GST

- Settings → Subscription & billing uses separate load/save/restore/manage identities and masks retired snapshots against live auth UID + session generation
- Quota presentation compares `monthKey` to current IST month; 80% warning on the subscription screen **and** a You-dashboard banner that opens Settings → Subscription (no purchase CTA; purchase-entry remains default-off)
- Billing details: incomplete drafts may save; invoice-ready needs recipient, address1, 6-digit PIN, GST state. GSTIN optional; never client-verified
- Purchase entry is default-off independent of the quota-upsell gate
- Reconciliation: unique invocation IDs, live leases unclaimable, lease-checked worker complete (webhook resolve remains distinct), operator restores attempt budget and refuses active leases, config-disabled does not terminal-burn jobs, paginated due scan + indexes, structured adapter outcomes, stale-company maintenance via **document-id pagination** (null, omitted, and aged watermarks; sidecar backoff; overlapping-tick lease), ledger actual-vs-estimated commission reporting with paginated complete `_revenueReports` (nulls stay unknown; net never invented). Flags closed. No production backfill of omitted `lastReconciledAt`.
- Tax-document handoff is a separate deploy dependency; ledger insertion does not create an invoice
- Owner/CA must still confirm tax-responsibility policy

## Real-store test matrix (pending a binary)

Purchase, restore, acknowledge, renewal, cancel-with-remaining-access, expiry, refund vs revocation, RTDN delayed/duplicate, process death during purchase, manage/cancel URL, license-tester vs non-tester.

## Legal / listing / KYC

Drafts in `docs/release/play-listing/DRAFTS.md`. Owner fact request in `OWNER_LEGAL_FACT_REQUEST.md`. Merchant KYC is owner-handled via Play payment profile/support; authenticity of any PA-CB email is not established here. No Console submit.

## External actions still gated

Main merge, EAS production AAB, Play upload, production flags, public rollout.
