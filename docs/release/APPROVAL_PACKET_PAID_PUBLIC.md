# Approval packet 2 — full paid public candidate

**Do not approve paid public release from this packet. End-to-end evidence is still missing.**

## Remaining source / PR set

- Keep original #20–#25 HOLD until independently accepted
- Combined candidate `release/public-android-combined` contains their union plus VYD-38/39 and App Check source
- Independently retrieved Actions on reviewed head `d0de2f4`: run `35464695768` job `105954793956` SUCCESS; merge into main `79d405d`; `test:all` **139/139** in 379.1s; `ci:verify` PASS including Expo config and invoice-renderer Docker. **Do not reuse that run for this packet’s later HEAD.**
- This continuation adds core-app corrections at `e08a26f21b997eb8cde3687fe27a95aa018979aa` and paid-backend follow-up at `a1bd2a5bb72f19af6f98222cb8f5e983bca33ec6`. Local `test:all` **139/139 in 254.3s**. **Require fresh Actions on the branch HEAD (this packet’s docs commit) and its tested merge-ref**.

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
- Billing Functions deploy: `validateAndActivateAndroid`, `prepareAndroidBillingAccount`, `androidRtdn`, `updateBillingDetails`, `scheduledBillingReconciliation` — **still undeployed** (Firebase `functions:list` this project: identity/auth/deletion only)
- Flags still default closed: `PLAY_BILLING_ENABLED`, `UPDATE_BILLING_DETAILS_ENABLED`, `BILLING_RECONCILIATION_ENABLED`, `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED`, `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED`
- Readable `subscription/status` + `usageCurrent` + history + billingDetails (compat patch or full Rules)
- RTDN Pub/Sub + IAM — **Play Console 2026-09-20: Pub/Sub topic name empty**. Creating the topic remains a gated store/GCP write. Missing `gcloud` is not the blocker.
- KMS + diagnostic secret — still required before paid activation; not present as a completed live config in this source packet
- Play products/base-plans matching `vyd_*` catalog — **Play Console 2026-09-20: no subscription products exist yet** (empty catalog). Creating products remains a gated store write. This closeout did not repeat Console inspection.
- License testers — two email lists present (Known Testers: 2 users; Owner: 3 users); response `RESPOND_NORMALLY`. Licence testing does not cover Play Integrity.
- App Check: native tokens on a Play-installed binary, then monitor, then optional enforcement. JS CustomProvider **not accepted** (app-identity constraint). Phone Auth ≠ App Check.

## Management / reconciliation / GST

- Settings → Subscription & billing uses separate load/save/restore/manage identities and masks retired snapshots against live auth UID + session generation. Draft/save/restore/manage/upgrade callbacks bind the originating session; Save completion keeps a newer unsaved edit.
- Quota presentation compares `monthKey` to current IST month; 80% warning on the subscription screen **and** a You-dashboard banner that opens Settings → Subscription (no purchase CTA; purchase-entry remains default-off)
- Billing details: incomplete drafts may save; invoice-ready needs recipient, address1, 6-digit PIN, GST state. GSTIN optional; never client-verified
- Purchase entry is default-off independent of the quota-upsell gate
- Reconciliation: unique invocation IDs, live leases unclaimable, lease-checked worker complete (webhook resolve remains distinct), operator restores attempt budget and refuses active leases, config-disabled does not terminal-burn jobs, paginated due scan + indexes, structured adapter outcomes, stale-company maintenance via **document-id pagination** with sidecar backoff **fenced by the admitted maintenance lease** and current time, ledger actual-vs-estimated commission reporting with paginated complete `_revenueReports` (purchase/renewal inflows only in gross; refund/chargeback only in refunds; delayed older `scanStartedAt` cannot replace a newer complete report; nulls stay unknown; net never invented). Flags closed. No production backfill of omitted `lastReconciledAt`.
- Tax-document handoff is a separate deploy dependency; ledger insertion does not create an invoice
- Owner/CA must still confirm tax-responsibility policy

## Real-store test matrix (pending a binary)

Purchase, restore, acknowledge, renewal, cancel-with-remaining-access, expiry, refund vs revocation, RTDN delayed/duplicate, process death during purchase, manage/cancel URL, license-tester vs non-tester.

## Legal / listing / KYC

Drafts in `docs/release/play-listing/DRAFTS.md`. Owner fact request in `OWNER_LEGAL_FACT_REQUEST.md`. Merchant KYC is owner-handled via Play payment profile/support; authenticity of any PA-CB email is not established here. No Console submit.

## External actions still gated

Main merge, EAS production AAB, Play upload, production flags, public rollout.
