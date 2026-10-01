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

Targeted closeout 2 (2026-09-20) did **not** repeat Play Console inspection. The empty catalog, empty RTDN topic, licence lists, and Internal RC4 vc17 findings above remain a **historical 2026-09-20** Console read. They are **not** the current Internal Testing release as of 2026-10-01.

## Purchase-entry closeout session (2026-10-01 morning, CLI-only — superseded by Console read below)

Worktree: `release/android-source-candidate`. Historical workspace was not used. This CLI pass did **not** obtain Play inventory. Missing `gcloud` / `eas` on PATH / `googleapiclient` was **not** a claim that Play or EAS services were unavailable.

| Tool | Result |
| --- | --- |
| `gcloud` | not on PATH |
| `eas` on PATH / repo `node_modules` | absent |
| Python `googleapiclient` | not installed |
| `firebase` 14.20.0 | credentials no longer valid; reauth not performed |

The incomplete-inventory conclusion of that CLI pass is **superseded** by the Play Console read in the next section.

## Fresh Play Console (2026-10-01, read-only, authenticated browser)

Session: `aeadmin@specialsoftwares.com` / SPECIAL SOFTWARES. Developer `5171346189091805855`. App `4972339006118168782`. Package `com.specialsoftwares.vyaamikkdiary`. Draft app; temporary unreviewed package name. No Save, create, upload, Pause, Promote, or Create new release.

| Surface | Fresh finding | Timestamp (UTC) |
| --- | --- | --- |
| All app bundles (`…/bundle-explorer-selector`) | Unfiltered pager **1–9 of 9**. Version codes **22 Active** (1.0.0, uploaded 23 Sept 2026 08:56); **20, 19, 17, 16, 15, 14, 13, 10 Inactive**. **21, 18, 23 absent.** | 2026-10-01T13:29:51Z |
| Latest releases | Release **Vyaamikk Diary (Vc22)**, latest version **22**, track **Internal testing**, available to internal testers, full roll-out, 23 Sept 2026 14:28 | 2026-10-01 (releases overview, same session) |
| Internal testing | Track **Active**. Latest release **Vyaamikk Diary (Vc22)**. Version codes **22**. | 2026-10-01T13:30:32Z |
| Production | **Inactive**. No production release. | 2026-10-01T13:31:03Z |
| Protected with Play | Play Integrity API **not integrated**. Prevent unofficial installs 1 of 1 active. Certificate fingerprints not copied. | 2026-10-01T13:31:39Z |

**Owner-reported vs this read:** EAS vc21 `5e1e124b-…` is **finished** on EAS and **not** in the Play AAB inventory. EAS vc22 `72cb7254-…` is **finished** on EAS **and** present as Internal Testing Active 22. A finished EAS build is not itself a Play upload.

**Proposed next unused versionCode: 23** (strictly greater than highest uploaded 22). Do not re-upload 22. Source preparation later set `app.json` `android.versionCode` to 23 on `6e3dbba9b2173fbb5ffde8ffbbccd5b7dac3e559`. That does **not** reserve 23. Recheck inventory before any later authorized build/upload. Recheck 2026-10-01T14:02:46Z still showed pager **1–9 of 9** (no tenth uploaded bundle). A search for `23` did not finish rendering a table in that session.

## Fresh EAS CLI (2026-10-01, npx eas-cli@16.28.0, not repo node_modules)

Account `vydspecial2026` (Owner). Project `@vydspecial2026/vyaamikk-diary` `00bb47ff-b22f-4a64-ace8-a0e7275fd2a1`. Expo website was a login wall; CLI session was used. No remote env write. No build. Secret/sensitive values were not printed (`--include-sensitive` not used). Purchase-entry / quota-upsell names absent from remote production and preview env lists. `EXPO_PUBLIC_APP_MODE` exists remotely as SENSITIVE (value unread).

Pinned `eas-cli@16.28.0` `packages/eas-cli/src/build/evaluateConfigWithEnvVarsAsync.ts` merges `{ ...serverEnvVars, ...buildProfile.env }` (profile env wins on overlap). `eas config --platform android --profile production` (2026-10-01, configuration-resolution only — not a build-worker or artifact): selected profile **production**, EAS environment **production**, `distribution=store`, `autoIncrement=false`, no profile `extends`. Overlap warning: remote and profile both define `EXPO_PUBLIC_APP_MODE`; **build profile values are used**. Resolved public flags from the production profile env:

- `EXPO_PUBLIC_APP_MODE=production`
- `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED=0`
- `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED=0`

`app.config.js` only remaps `googleServicesFile` from env; it does not change versionCode or those flags. No `eas-build-*` hooks in this candidate. Later authorized AAB evidence must still record the same three values from the build worker/artifact.

Recent Android production AABs include vc22 `72cb7254-0be9-4f92-a514-dbfab2b1150d` (FINISHED, git `0da2f58`, `isGitWorkingTreeDirty` absent from JSON) and vc21 `5e1e124b-7a8c-49ec-a4bb-2b7264844dc4` (FINISHED). Preview profile history remains APK/`INTERNAL`.

## Fresh Firebase (2026-10-01, session restored, read-only)

CLI user `support.vyd@specialsoftwares.com`. Project `vyaamikk-diary` (`982505811909`). `firebase use` → `vyaamikk-diary`. Android app `1:982505811909:android:784cb8df7f5523beea25ac`. No Rules/Functions/IAM deploy. No secret values printed. Deprecated `functions:config:get` payload was empty (`{}`); that is not a billing-enablement proof.

Live Rules hashes: see `docs/release/rules-compat/live-export-2026-10-01/META.json` and `LIVE_RULES_COMPAT.md`. Firestore live sha256 `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` (proposed compat patch, ruleset `a19b4a83-…`, updated 2026-09-21). Storage still `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5`.

Deployed Functions (asia-south1, nodejs20) **include** billing/tax handlers that were absent on 2026-09-19, among them: `androidRtdn`, `prepareAndroidBillingAccount`, `prepareIOSBillingAccount`, `validateAndActivateAndroid`, `validateAndActivateIOS`, `updateBillingDetails`, `scheduledBillingReconciliation`, `retryReconciliationWorkItem`, `reviewSubscriptionTaxCompliance`, `generateGstr1WorkingPapers`, `getInvoiceDownloadUrl`, `markGstr1Filed`, plus identity/auth/deletion callables. Handler presence is **not** `PLAY_BILLING_ENABLED=true`. Client purchase-entry flags remain `"0"`. Do not treat this list as a live billing-on finding.

Android SHA certificates registered in Firebase (2026-10-01 `apps:android:sha:list`):

- SHA-1 `20f8150e213c9c3f84fdcac51e9e4dcceea242ad`
- SHA-1 `d223f0a5effd8e2e421752d35ad7a00e19f82e59`
- SHA-256 `e688fa0ba5fa3bd30585114f8c2143e1efdda1acbfdb9daadc42da896178752a`
- SHA-256 `b9c521e3b57eab0c3d3dc7b85de91d67ef9f2abd90cc6950c5700b4f2636ce92`

Play Console App signing (2026-10-01T14:06Z, read-only, no key change/reset): upload-key SHA-1 `20:F8:15:0E:…:42:AD` and SHA-256 `E6:88:FA:0B:…:75:2A` match the first Firebase SHA-1 and first Firebase SHA-256. Digital Asset Links app-signing SHA-256 `B9:C5:21:E3:…:CE:92` matches the second Firebase SHA-256. Play App signing SHA-1 was a copy-control without the colon value in page text; it was **not** newly matched to Firebase SHA-1 `d223f0a5…` from that text. `APP_CHECK_DESIGN.md` is not in this candidate, so the 2026-09-19 “matched APP_CHECK_DESIGN.md” note was not re-opened against a repo file.

## Merchant KYC (human payments-readiness)

Separate from app code, developer verification, and App Check. Owner handles Google/BillDesk merchant KYC / PA-CB business and representative verification via the existing Play payment profile and Play Console payments support.

- Authenticity of any specific PA-CB email is **not established** from this assignment.
- Record only owner-supplied **status / date / reference**.
- No PAN, Aadhaar, OTP, video, or document copies in source or PRs.
- Owner-supplied status this handoff: **pending owner confirmation** (no date or reference supplied). Owner stated they will handle merchant KYC separately.
