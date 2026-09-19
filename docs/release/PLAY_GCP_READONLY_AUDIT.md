# Play / GCP read-only audit (source + inspection)

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

## This continuation (2026-09-19)

Firebase CLI session: `support.vyd@specialsoftwares.com` (read-only). Project `vyaamikk-diary` (number `982505811909`). `gcloud` CLI was **not** on PATH (`gcloud_missing`). Python `googleapiclient` was **not** installed. Play Developer API product/base-plan/license-tester reads therefore **failed locally** — exact blocker: no Android Publisher client/session in this environment.

Firebase `apps:list`:

| Display name | App ID | Platform |
| --- | --- | --- |
| Vyaamikk Diary Android | `1:982505811909:android:784cb8df7f5523beea25ac` | ANDROID |
| Vyaamikk Diary | `1:982505811909:ios:2b8bba64b939f97bea25ac` | IOS |
| Vyaamikk Diary Web | `1:982505811909:web:fdf3f817c35465b3ea25ac` | WEB |

This is the app-identity split recorded for App Check (native vs JS/web appId).

Firebase `functions:list` (asia-south1, nodejs20): identity/auth/deletion callables and `scheduledDeletionCleanup` only. **No live billing handlers** (`validateAndActivateAndroid`, `prepareAndroidBillingAccount`, `androidRtdn`, `updateBillingDetails`, `scheduledBillingReconciliation`) are deployed. Billing remains source-only; flags stay closed.

Treat Play product/base-plan mapping as **source-defined, store-unverified** until a later Android Publisher/Console pass. Proposed missing configuration lives in `BILLING_OPS_DEPLOY_MANIFEST.md`.

`check:firebase-client` this continuation: ok, with warnings that JS appId differs from Android appId (expected) and `google-services.json` has zero `oauth_client` entries.

## Merchant KYC (human payments-readiness)

Separate from app code, developer verification, and App Check. Owner handles Google/BillDesk merchant KYC / PA-CB business and representative verification via the existing Play payment profile and Play Console payments support.

- Authenticity of any specific PA-CB email is **not established** from this assignment.
- Record only owner-supplied **status / date / reference**.
- No PAN, Aadhaar, OTP, video, or document copies in source or PRs.
- Owner-supplied status this handoff: **pending owner confirmation** (no date or reference supplied). Owner stated they will handle merchant KYC separately.
