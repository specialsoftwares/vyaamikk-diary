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

## Authenticated Play Console (2026-09-20, read-only)

Session: `aeadmin@specialsoftwares.com` / SPECIAL SOFTWARES. Developer `5171346189091805855`. App `4972339006118168782`, package `com.specialsoftwares.vyaamikkdiary`. No Save, create, upload, or other mutation.

| Surface | Finding |
| --- | --- |
| App dashboard | Draft app; Production **Inactive**; temporary unreviewed package name |
| App list | Installed audience **0**; status Draft / Internal testing; last updated **26 Aug 2026**; Android developer verification: all apps successfully registered |
| Subscriptions catalog | **Empty** — Console heading “Your app doesn't have any subscriptions yet”. Source catalog remains 3 products × 3 base plans (`vyd_starter` / `vyd_professional` / `vyd_business` × `monthly` / `quarterly` / `yearly`). No products were created. |
| Monetisation setup / RTDN | Pub/Sub topic name **empty** (0/300). Notification content radio: **Subscriptions and voided purchases only**. Subscription pause **Enabled**. Play Billing license RSA public key **present** (not copied into the repo). Alternative billing / external offers / billing choice **not enrolled**. Billing-profile setup still shown as incomplete for alternative billing. **Save changes was not pressed.** |
| Licence testing | Email lists **Known Testers (2 users)** and **Owner (3 users)**; response **RESPOND_NORMALLY**. Licence testing explicitly does **not** support Play Integrity API. **Save changes disabled / not pressed.** Email addresses were not opened or recorded. |
| Internal testing | Track **Active**; latest release **Internal Testing RC4 vc17**; 1 version code; released 26 Aug 23:01; not reviewed. Testers tab: same two email lists (2 and 3 users); join-on-the-web is available. **Create new release / Copy link / Save not used.** |

`gcloud` CLI and Python `googleapiclient` remain absent. That is not the Play Console blocker; catalog emptiness and empty RTDN topic are Console-visible configuration gaps, not a missing-tooling finding.

## Merchant KYC (human payments-readiness)

Separate from app code, developer verification, and App Check. Owner handles Google/BillDesk merchant KYC / PA-CB business and representative verification via the existing Play payment profile and Play Console payments support.

- Authenticity of any specific PA-CB email is **not established** from this assignment.
- Record only owner-supplied **status / date / reference**.
- No PAN, Aadhaar, OTP, video, or document copies in source or PRs.
- Owner-supplied status this handoff: **pending owner confirmation** (no date or reference supplied). Owner stated they will handle merchant KYC separately.
