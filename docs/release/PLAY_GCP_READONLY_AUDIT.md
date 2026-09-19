# Play / GCP read-only audit (source + prior inspection)

This session did **not** create products, change prices, IAM, or subscriptions.

## Source catalog (canonical)

Android product IDs: `vyd_starter`, `vyd_professional`, `vyd_business`  
Base plans: `monthly`, `quarterly`, `yearly`  
Package: `com.specialsoftwares.vyaamikkdiary`

## Prior authenticated Play inspection (Continuation 3 / assignment)

Dated: 2026-09-19. Recheck before any upload.

- versionCodes present: 17, 16, 15, 14, 13, 10
- 19 unused at inspection (proposed first internal code, not reserved for all later AABs)
- Upload and Play App Signing SHA-1/SHA-256 matched Firebase Android app hashes recorded in APP_CHECK_DESIGN.md
- Play Console Play Integrity **API** was “not integrated” — separate from Firebase App Check Play Integrity provider registration

## This session

Live Play Developer API product/base-plan availability vs catalog was **not re-fetched** here (no store writes; no new sign-in task). Treat catalog mapping as **source-defined, store-unverified** until a later read-only Console/API pass.

License-testing setup, payments profile, Android Publisher API access, RTDN/Pub/Sub/IAM: **not independently re-verified** in this session. Proposed missing configuration lives in `BILLING_OPS_DEPLOY_MANIFEST.md`.
