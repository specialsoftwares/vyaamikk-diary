# CURSOR_PROGRESS

Session: 2026-09-21 (IST). Workspace: `/Users/shivamsaurav/Vyaamikk Diary`.

Continuation after human conflict resolution (keep origin/main). Phase 4 (support email) skipped.

---

## SESSION 2026-09-23 16:35 IST — PLAY REVIEW TEST PHONE

FIREBASE TEST PHONE VERIFICATION:
nativePhoneAuth.ts blocks test numbers: NO — E.164 shape check only (`+[1-9]` and 7–14 digits). `+919000000000` passes. No blocklist, allowlist, or external lookup.
confirmOtp rejects code 654321: NO — confirm accepts any 4–8 digit code and does not special-case 654321.
productionMockOtpIsolation test result: PASS
Code 654321 appears in isolation test as blocked: NO
VERDICT: Firebase test number +91 9000000000 / OTP 654321 will work in production: YES

PLAY REVIEW ACCOUNT SETUP COMPLETE: 2026-09-23 16:35 IST

FIREBASE TEST NUMBER VERDICT: +91 9000000000 / OTP 654321 will work: YES
SETUP SCRIPT: scripts/setup-play-review-account.ts — created
DOCUMENTATION: docs/PLAY_REVIEW_SETUP.md — created
ALL TESTS: PASS
- npm run typecheck: PASS
- npm run lint: PASS
- npm run test:production-mock-otp-isolation: PASS
- npm run test:native-phone-auth: PASS
- npm run test:identity-mobile: PASS

FOUNDER ACTIONS REQUIRED BEFORE SUBMITTING TO PLAY:
1. Add +91 9000000000 / code 654321 to Firebase Console test phone numbers
2. Create reviewer@specialsoftwares.com in Google Workspace
3. Install EAS production build on device
4. Sign in with test number and complete full onboarding
5. Run: npm run review:verify-account — confirm all checks pass
6. Fill Google Play Console Sign-in details as documented in docs/PLAY_REVIEW_SETUP.md

PROTECTED SYSTEMS UNTOUCHED: YES
NO CODE CHANGES MADE TO AUTH, FIRESTORE, BILLING, OR NAVIGATION: YES

---

## SESSION 2026-09-22 00:05 IST — CRASHLYTICS / APP CHECK / TELEMETRY CONSENT

HEAD at start: `ad618ec`. Changes are uncommitted.

PRODUCTION HARDENING COMMITTED: `9f5448e74ee05afd7d57f0f59f5e020215a48421`
Files committed:
- app.json
- app/(app)/(tabs)/_layout.tsx
- app/(app)/(tabs)/settings.tsx
- app/_layout.tsx
- firebase.json
- package.json
- package-lock.json
- src/components/TelemetryConsentModal.tsx
- src/components/settings/CrashReportsPreferenceRow.tsx
- src/components/telemetry/TelemetryConsentHost.tsx
- src/services/appCheck/index.ts
- src/services/telemetry/CrashReportingBridge.tsx
- src/services/telemetry/crashReporter.ts
- src/services/telemetry/index.ts
- src/services/telemetry/telemetryConsent.ts
- src/startup/RootErrorBoundary.tsx
- src/startup/coordinator.ts
Pushed to origin/main: YES
`GlobalErrorBoundary.tsx` was not created. The existing `RootErrorBoundary` records to Crashlytics. Not staged: `CURSOR_PROGRESS.md`, `CONTRIBUTING.md`, `.github/pull_request_template.md`.

### STEP 2 — FULL TEST SUITE ON COMMITTED STATE (`9f5448e`)

| Command | Result |
|---|---|
| npm run typecheck | PASS |
| npm run lint | PASS |
| npm run test:identity-mobile | PASS |
| npm run test:save-idempotency | PASS |
| npm run test:formatters | PASS |
| npm run test:i18n | PASS |
| npm run test:letterhead-pdf | PASS |
| npm run test:auth-wrapper | PASS |
| npm run test:pending-email | PASS |
| npm run test:native-phone-auth | PASS |
| npm run test:js-auth-bridge | PASS |
| npm run test:boot-release-gate | PASS |
| npm run test:firestore-rules | PASS |
| npm run test:legal-consent | PASS |
| npm run test:production-mock-otp-isolation | PASS |
| npm run test:pdf-gujarati | PASS |
| npm run test:cash-paid-serial | PASS |

### STEP 3 — LEGAL.TS

Founder values used:
- Grievance officer: Shivam Saurav, Designated Partner
- Effective date: 2026-07-27 (founder correction; replaces 2026-09-22)
- Address: 841, Plot 35, Sector 6, Dwarka, New Delhi, Delhi - 110075, India

`npm run typecheck` PASS. `npm run test:legal-consent` PASS.

LEGAL.TS COMMITTED: `d5ba2d876bf140baae49a0e590f7576a99a44f54`
Effective date corrected: `0da2f58970f23c7ce6cbefae6efffd49c731f44b` sets `LEGAL_EFFECTIVE_DATE` to `2026-07-27`. Pushed to origin/main. The in-progress AAB `0f362a28` was built from `d5ba2d8` and still contains `2026-09-22`.
Pushed to origin/main: YES

### STEP 4 — PRODUCTION BUILD

EAS warning: `android.googleServicesFile` is not in git and will not be uploaded. Same warning as the finished versionCode 19 build. Watch the build logs if native Firebase fails.

FINAL PUBLIC RELEASE BUILD STARTED:
Build ID: 0f362a28-af0e-46c2-a01f-30de7a5fb8f5
EAS URL: https://expo.dev/accounts/vydspecial2026/projects/vyaamikk-diary/builds/0f362a28-af0e-46c2-a01f-30de7a5fb8f5
Commit: d5ba2d876bf140baae49a0e590f7576a99a44f54
versionCode: 20
version: 1.0.0
Status: in_progress (~16 minutes)

THIS IS THE DEFINITIVE PUBLIC RELEASE AAB.
Upload this to Play Console → Production track when:
- Internal testing on versionCode 19 passes on real device
- All 9 Play subscription products show ACTIVE
- PLAY_BILLING_ENABLED is set to true
- RTDN Pub/Sub is configured

════════════════════════════════════════════════
SESSION COMPLETE: 2026-09-22 00:20 IST
HEAD: d5ba2d876bf140baae49a0e590f7576a99a44f54

DONE:
✅ Crashlytics committed — consent-gated, 8-char UID only
✅ App Check confirmed existing — no duplicate init
✅ Telemetry consent modal committed — one-time, AsyncStorage persisted
✅ Crash Reports toggle in Settings committed
✅ Global error boundary records to Crashlytics (existing RootErrorBoundary)
✅ All tests passing
✅ Pushed to origin/main

LEGAL.TS STATUS: committed with real values (`d5ba2d8`)
- Address: 841, Plot 35, Sector 6, Dwarka, New Delhi, Delhi - 110075, India
- Grievance officer: Shivam Saurav, Designated Partner
- Effective date: 2026-07-27

FINAL BUILD STATUS: started — 0f362a28-af0e-46c2-a01f-30de7a5fb8f5
https://expo.dev/accounts/vydspecial2026/projects/vyaamikk-diary/builds/0f362a28-af0e-46c2-a01f-30de7a5fb8f5

REMAINING FOUNDER ACTIONS:
1. Internal AAB upload to Play Console → Internal testing
   https://expo.dev/artifacts/eas/NmkNREapRF_cTxfnXPq7QD8QcTvfH9Nuicu4RlaSTA4.aab
2. Create 9 subscription products in Play Console (guide in earlier CURSOR_PROGRESS.md entry)
3. Configure RTDN Pub/Sub topic in Google Cloud Console
4. Real device purchase test on internal build
5. Enable App Check enforcement in Firebase Console after token verification
6. When all above confirmed: tell Cursor to set PLAY_BILLING_ENABLED=true and deploy functions
7. Upload final versionCode 20 AAB to Production track

PLAY_BILLING_ENABLED: FALSE
PROTECTED SYSTEMS UNTOUCHED: YES
════════════════════════════════════════════════

### PHASE 1 — FIREBASE CRASHLYTICS

`@react-native-firebase/crashlytics` was not in package.json. Installed and pinned to `^24.1.0` so it matches `@react-native-firebase/app`, `auth`, `app-check`, and `functions`. The first `expo install` resolved `^26.4.0`; that was replaced before any build.

Plugin added in `app.json`. `firebase.json` `react-native.crashlytics_auto_collection_enabled` is `false` (iOS otherwise defaults collection on). Android Crashlytics manifest already ships `firebase_crashlytics_collection_enabled=false`.

`src/services/telemetry/crashReporter.ts` — collection off until consent. UID stored as first 8 characters only. Native module is required on use so a missing binary cannot throw at import.
`CrashReportingBridge` in `app/_layout.tsx` reads `vyd_telemetry_consent_v1`. Missing key stays disabled. Signed-in + consent calls `setUserId`. Signed-out calls `clearUser`.

Existing `RootErrorBoundary` already catches render errors and shows `StartupFailureScreen`. Added `recordError(error, "ErrorBoundary")` in `componentDidCatch`. Did not add a second boundary or replace that recovery screen.

### PHASE 2 — FIREBASE APP CHECK

`@react-native-firebase/app-check` `^24.1.0` was already installed. Not reinstalled.

Client init already runs once in `src/startup/coordinator.ts` via `initializeAppCheckLayer`, before Firestore, fail-open:
- Android production: Play Integrity
- iOS production: App Attest with DeviceCheck fallback
- Development: debug provider

A second `initializeAppCheck` from `app/_layout.tsx` would throw on device. `src/services/appCheck/index.ts` re-exports that same layer as `initialiseAppCheck` and does not call native init again. Comment at the real call site: `// App Check initialised here`.

APP CHECK: Client initialised. Enforcement must be enabled in Firebase Console → App Check after real-device testing confirms tokens are issued correctly. Enable enforcement ONLY after verifying no legitimate users are blocked.

No server-side token enforcement was added.

### PHASE 3 — TELEMETRY CONSENT MODAL

`TelemetryConsentModal` plus `TelemetryConsentHost` on the main tab layout only. Shown when the user is signed in, `profileCompletedAt` is set, and `vyd_telemetry_consent_v1` is absent. Allow writes `'true'` and enables Crashlytics. No thanks writes `'false'` and keeps collection off.

Settings → Privacy & legal: `CrashReportsPreferenceRow` using `SettingsPreferenceRow`. Toggle updates the same AsyncStorage key and `setCrashReportingEnabled`.

### PHASE 4 — PRODUCTION BUILD VERIFICATION

Step 4A — `console.log` in auth and billing production paths:
No `console.log` in non-test files under `src/services/auth`, `src/services/billing`, or `src/billing`. The only non-test hit is `functions/src/billing/log.ts`, the structured billing log sink (`info` → `console.log`). Left in place. Test-file `console.log` lines are the test harness and were not changed.

Step 4B — `eas.json` production already has `buildType: app-bundle`, `autoIncrement: false`, `EXPO_PUBLIC_APP_MODE=production`, `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED=1`, `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED=1`. No eas.json edit. No eas commit.

Step 4C — `app.json`: `version` `1.0.0`, `versionCode` `20`, package `com.specialsoftwares.vyaamikkdiary`. `targetSdkVersion` is not set (left unchanged). `android.permissions` is only `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION`, both used by location footprints. None removed.

Step 4D — tests on this tree:

| Command | Result |
|---|---|
| npm run typecheck | PASS (after removing a duplicated settings row function) |
| npm run lint | PASS |
| npm run test:identity-mobile | PASS |
| npm run test:save-idempotency | PASS |
| npm run test:formatters | PASS |
| npm run test:i18n | PASS |
| npm run test:letterhead-pdf | PASS |
| npm run test:auth-wrapper | PASS |
| npm run test:pending-email | PASS |
| npm run test:native-phone-auth | PASS |
| npm run test:js-auth-bridge | PASS |
| npm run test:boot-release-gate | PASS |
| npm run test:firestore-rules | PASS |
| npm run test:legal-consent | PASS |
| npm run test:production-mock-otp-isolation | PASS |

Also PASS: settings presentation, tab bar metrics, boot production startup, app-check static.

Step 4E:

PRODUCTION BUILD DEFERRED — waiting for legal.ts values from founder.
Run this command after legal.ts is committed:
eas build --platform android --profile production --message "Public release versionCode 20 — complete"

════════════════════════════════════════════════
PRODUCTION HARDENING COMPLETE: 2026-09-22 00:05 IST
HEAD: ad618ec (hardening changes uncommitted on this tree)

ADDED THIS SESSION:
✅ Firebase Crashlytics — consent-gated, truncated UID only, auto-collection off
✅ Firebase App Check — already initialised once at startup (Play Integrity / App Attest). No second init.
✅ Telemetry consent modal — one-time, AsyncStorage persisted
✅ Crash reports toggle in Settings Privacy & Legal
✅ Global error boundary — existing RootErrorBoundary now records the error; recovery screen unchanged
✅ console.log — none in auth/billing production source; billing log sink and test harness left as-is
✅ EAS production profile verified (unchanged)

STILL REQUIRED FROM FOUNDER:
⏳ legal.ts values (address extracted from COI; grievance officer not appointed; effective date unconfirmed)
⏳ Firebase Console: enable App Check enforcement after real-device token verification
⏳ Internal AAB upload to Play Console (273df81b) — founder already reported Released
⏳ 9 subscription products created ACTIVE in Play Console
⏳ RTDN Pub/Sub topic configured

PLAY_BILLING_ENABLED: FALSE
PROTECTED SYSTEMS UNTOUCHED: YES
════════════════════════════════════════════════

---

## SESSION 2026-09-21 14:30 IST — REVIEWREFUND COMMIT / RULES / VC20

HEAD at start of this pass: `69cbf31` (eas.json flags, 1 commit ahead of origin). Founder confirmed Internal testing **Released**. `androidRtdn.ts` had **no** ReviewRefund diff (handler lives in `rtdn.ts` + adapter). Not staged.

### PHASE 1 — COMMIT REVIEWREFUND IMPLEMENTATION

Files staged (ReviewRefund only; not `CURSOR_PROGRESS.md`):

- `functions/src/billing/google/rtdn.ts`
- `functions/src/billing/google/androidSubscriptionAdapter.ts`
- `functions/src/billing/google/playApiClient.ts`
- `functions/src/billing/google/playTypes.ts`
- `functions/src/billing/google/playToken.ts`
- `functions/src/billing/log.ts`
- `functions/src/billing/google/androidPlay.unit.test.ts`
- `functions/src/billing/google/googlePlay.emulator.test.ts`
- `functions/.env.example`

REVIEWREFUND COMMITTED: `e6f09b6a9afb37e6ae88cc39e0e27cc2b90a3aab`
Files committed: the 9 paths above
Pushed to origin/main: YES (`a1512ab..e6f09b6` includes eas.json `69cbf31` + ReviewRefund `e6f09b6`)
`PLAY_BILLING_ENABLED` still false.

This pass (post-compaction): `git status` clean except untracked `CURSOR_PROGRESS.md`, `CONTRIBUTING.md`, `.github/pull_request_template.md`. HEAD `e6f09b6` already matches origin/main. No new ReviewRefund commit (would have been empty).

### PHASE 2 — FIREBASE RULES DEPLOY

Auth: `firebase projects:list` succeeded as `support.vyd@specialsoftwares.com`. Project `vyaamikk-diary` is current.

Step 2A — proposed hash:
`b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c  docs/release/rules-compat/proposed/firestore.rules`
MATCHES expected. Proceed.

Step 2B — live export:
`firebase firestore:rules:get` is not a command on firebase-tools 14.20.0. Exported via Firebase Rules API using the signed-in CLI account (equivalent of live get).
Live ruleset: `projects/vyaamikk-diary/rulesets/9c02e187-bd1c-4a5f-bdcc-d8f070e0a5b2`
Live hash: `d8ee0abcd5a8f217f1fbe60af9651e5b4253b07cac72d0746c4e781a48052aa2`
Repo-root `firestore.rules` hash: `233b05b7b810b484171257f4dafe78fd0fdea5762ed6848cf8b49cd327fd58cc` — different from both live and proposed. Default `firebase.json` `"rules": "firestore.rules"` would deploy the WRONG file. Will not run `firebase deploy --only firestore:rules` against repo-root. Deploy will use a temporary `--config` that points only at `docs/release/rules-compat/proposed/firestore.rules`.

Step 2C targeting confirmation:
- Default dry-run: `checking firestore.rules for compilation errors` — would deploy repo-root. NOT used.
- `--config firebase.rules-compat.deploy.json` dry-run: `checking docs/release/rules-compat/proposed/firestore.rules` — correct target. Using this for the real deploy. Temp config is not committed.

Step 2C deploy:
```
cloud.firestore: checking docs/release/rules-compat/proposed/firestore.rules for compilation errors...
firestore: uploading rules docs/release/rules-compat/proposed/firestore.rules...
firestore: released rules docs/release/rules-compat/proposed/firestore.rules to cloud.firestore
Deploy complete!
```
CLI targeted proposed file, not repo-root.

Step 2D post-deploy:
Live ruleset: `projects/vyaamikk-diary/rulesets/a19b4a83-8b3e-4cf5-b8b8-e8d26e9704f9`
Post-deploy hash: `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`
FIRESTORE RULES DEPLOYED AND VERIFIED

Step 2E — deploying Cloud Functions (`firebase deploy --only functions --project vyaamikk-diary --non-interactive`). `PLAY_BILLING_ENABLED` not set true (no functions/.env; `.env.example` remains false).

CLOUD FUNCTIONS DEPLOYED

Created (asia-south1):
- updateBillingDetails
- verifyGstinManual
- getInvoiceDownloadUrl
- generateGstr1WorkingPapers
- markGstr1Filed
- reviewSubscriptionTaxCompliance
- prepareAndroidBillingAccount
- validateAndActivateAndroid
- androidRtdn
- scheduledBillingReconciliation
- retryReconciliationWorkItem
- prepareIOSBillingAccount
- validateAndActivateIOS
- appStoreServerNotificationsV2

Updated (asia-south1):
- resolveOrCreateUserByPhone
- claimMobile
- mintClientAuthToken
- checkMobileQuarantine
- rebindQuarantinedMobileCallable
- confirmVerifiedMobileContactChange
- preflightVerifiedMobileContactChange
- startEmailVerification
- resendEmailVerification
- verifyAndBindEmail
- changeVerifiedEmail
- startAccountRecovery
- completeAccountRecovery
- openManualRecoveryCase
- resolveManualRecoveryCase
- ensureAccountDeletionJob
- retireIdentity
- completeAccountDeletion
- scheduledDeletionCleanup
- startAccountReactivation
- completeAccountReactivation
- registerNewDeviceSecurityEvent
- retryNewDeviceSecurityEmail
- handleWasNotMeToken
- handleWasNotMeTokenHttp

HTTP URLs:
- handleWasNotMeTokenHttp: https://handlewasnotmetokenhttp-j47d4dvikq-el.a.run.app
- androidRtdn: https://asia-south1-vyaamikk-diary.cloudfunctions.net/androidRtdn
- appStoreServerNotificationsV2: https://asia-south1-vyaamikk-diary.cloudfunctions.net/appStoreServerNotificationsV2

CLI warnings (not failures): Node.js 20 deprecation 2026-10-30; firebase-functions package outdated. Billing callables are deployed fail-closed (`PLAY_BILLING_ENABLED` still false).

### PHASE 3 — VERSIONCODE BUMP FOR NEW BUILD

Build `78202b38-c650-4067-b347-99f61539f2af`:
- Status: finished
- Profile: production
- Version: 1.0.0 / versionCode 19
- Commit: a1512ab485cc05191245fd43d955885a8ea011ec
- Archive: https://expo.dev/artifacts/eas/LAh9sLpky5GD4YxdaPk4_gjr6vUYkctFf8uTRiJozic.aab
- Finished: 9/21/2026, 1:51:38 PM

VERSIONCODE BUMPED: 19 → 20
Committed: `ad618ecdeb0a78db90a6307d1a4563c4cef3b297`
Pushed to origin/main: YES
Note: Build 78202b38 is versionCode 19 from a1512ab.
When founder is ready to submit the final public release build, run:
eas build --platform android --profile production --message "Public release versionCode 20 from ad618ec"
This will produce versionCode 20 which Play Console will accept. `version` string remains `"1.0.0"`.

### PHASE 4 — LEGAL.TS UPDATE

Founder supplied Form 16 Certificate of Incorporation (MCA CRC). Extracted 2026-09-21 23:30 IST. `src/config/legal.ts` not edited this pass (grievance officer not appointed; effective date not confirmed).

Certificate of Incorporation (Form 16, LLP Rules 2009 Rule 11(3)):
- Issuing authority: Government of India, Ministry of Corporate Affairs, Central Registration Centre
- LLP name as on certificate: ANANYA ENGINEERED INDUSTRIAL COMPONENTS & PAY SYSTEMS LLP
- LLPIN: ACR-8656
- PAN: ACLFA6299A (as issued by Income Tax Department)
- TAN: DELA85346C (as issued by Income Tax Department)
- Incorporation: section 12(1) of the Limited Liability Partnership Act 2008
- Date of certificate: 7 October 2025 (SEVENTH day of OCTOBER TWO THOUSAND TWENTY FIVE)
- Place: Manesar
- Signatory: Mansi Gokhale, Assistant / Deputy / Registrar of Companies, CRC
- Mailing address as per RoC record:
  ANANYA ENGINEERED INDUSTRIAL COMPONENTS & PAY SYSTEMS LLP
  841, Plot 35, Sector 6, Dwarka, New Delhi, Delhi, Dwarka Sec-6, Dwarka sector 6 police station, New Delhi, South West Delhi- 110075, Delhi, India

App `LEGAL_OPERATOR` already matches the certificate ampersand form (`Ananya Engineered Industrial Components & Pay Systems LLP`).

Founder statement: no grievance officer appointed. Do not invent a name or designation. `LEGAL_GRIEVANCE_OFFICER.name` stays a placeholder. `LEGAL_EFFECTIVE_DATE` stays `2026-07-01` until founder confirms or corrects it.

Still required before `src/config/legal.ts` can be updated:
1. Address: extracted from COI above — awaiting explicit go-ahead to write it into `LEGAL_ENTITY_ADDRESS`
2. Grievance officer full name and designation — none appointed
3. Confirm effective date 2026-07-01 or provide correct date

### PHASE 5 — FULL TEST SUITE

Ran on committed HEAD `ad618ec` (versionCode 20). All commands PASS.

| Command | Result |
|---|---|
| npm run typecheck | PASS |
| npm run lint | PASS |
| npm run test:identity-mobile | PASS |
| npm run test:save-idempotency | PASS |
| npm run test:formatters | PASS |
| npm run test:i18n | PASS |
| npm run test:letterhead-pdf | PASS |
| npm run test:auth-wrapper | PASS |
| npm run test:pending-email | PASS |
| npm run test:native-phone-auth | PASS |
| npm run test:js-auth-bridge | PASS |
| npm run test:boot-release-gate | PASS |
| npm run test:firestore-rules | PASS |
| npm run test:legal-consent | PASS |
| npm run test:production-mock-otp-isolation | PASS |
| npm run test:pdf-gujarati | PASS |
| npm run test:pdf-labels | PASS |
| npm run test:cash-paid-serial | PASS |

No test failures. No code fixes required.

### PHASE 6 — PLAY CONSOLE SUBSCRIPTION PRODUCTS GUIDE

PLAY CONSOLE SUBSCRIPTION PRODUCTS — MANUAL SETUP
Prerequisites: Internal AAB (273df81b versionCode 19) must be processed by Google first (5–30 min after upload). Founder already confirmed Internal testing Released.

Go to: https://play.google.com/console
Path: Your App → Monetise with Play → Products → Subscriptions → Create subscription

Create Product 1:
  Product ID: vyd_starter
  Name: Vyaamikk Diary Starter
  Base plan 1: ID=monthly, Billing period=1 month, Price=₹99, Grace period=3 days
  Base plan 2: ID=quarterly, Billing period=3 months, Price=₹249, Grace period=3 days
  Base plan 3: ID=yearly, Billing period=12 months, Price=₹799, Grace period=3 days
  Benefits: Up to 100 records/month, watermark-free PDF, all 5 languages, statutory reminders
  Activate all three base plans after creating them.

Create Product 2:
  Product ID: vyd_professional
  Name: Vyaamikk Diary Professional
  Base plan 1: ID=monthly, Billing period=1 month, Price=₹249, Grace period=3 days
  Base plan 2: ID=quarterly, Billing period=3 months, Price=₹649, Grace period=3 days
  Base plan 3: ID=yearly, Billing period=12 months, Price=₹1,999, Grace period=3 days
  Benefits: Unlimited records, all AI features, full legal Cash Paid voucher, Business Insights
  Activate all three base plans after creating them.

Create Product 3:
  Product ID: vyd_business
  Name: Vyaamikk Diary Business
  Base plan 1: ID=monthly, Billing period=1 month, Price=₹499, Grace period=3 days
  Base plan 2: ID=quarterly, Billing period=3 months, Price=₹1,299, Grace period=3 days
  Base plan 3: ID=yearly, Billing period=12 months, Price=₹3,999, Grace period=3 days
  Benefits: Everything in Professional plus 3 business profiles, CSV/Excel export, priority support
  Activate all three base plans after creating them.

After creating all products, confirm all 9 base plans show status ACTIVE.
Then tell Cursor to proceed with enabling PLAY_BILLING_ENABLED.

Internal AAB artifact (273df81b versionCode 19):
https://expo.dev/artifacts/eas/NmkNREapRF_cTxfnXPq7QD8QcTvfH9Nuicu4RlaSTA4.aab

PR26 AAB (78202b38 versionCode 19, also cannot be uploaded to the same track as a duplicate versionCode):
https://expo.dev/artifacts/eas/LAh9sLpky5GD4YxdaPk4_gjr6vUYkctFf8uTRiJozic.aab

BillDesk APK URL:
https://expo.dev/artifacts/eas/_QhXqHdQwmTtpgXQ1JBVbh-AyrjP9zbFiRPJuIERX0I.apk

═══════════════════════════════════════════════
SESSION COMPLETE: 2026-09-21 14:43 IST
HEAD: ad618ecdeb0a78db90a6307d1a4563c4cef3b297

COMPLETED THIS SESSION:
- ReviewRefund committed and pushed (`e6f09b6`)
- versionCode bumped to 20 and committed (`ad618ec`)
- Firebase rules deployed — live-compat proposed file; post-deploy hash `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`
- Cloud Functions deployed — identity/email/deletion updated; billing/GST/Apple/Play callables created fail-closed
- legal.ts not updated — founder values not provided
- All tests passing

BLOCKING ON HUMAN ACTION:
1. Firebase reauth — DONE this session (`support.vyd@specialsoftwares.com`)
2. Manual Internal AAB upload in Play Console — 273df81b artifact URL above (founder already reported Released)
3. Legal.ts values — registered address, grievance officer name, effective date
4. Play Console subscription product creation — after Internal AAB processes (guide above)
5. BillDesk KYC — founder-only, APK URL above

PLAY_BILLING_ENABLED: FALSE — do not change until Play products active and Functions deployed
(Functions are now deployed; Play products still required before enabling.)

NEXT BUILD FOR PUBLIC RELEASE:
Run after legal.ts is updated and internal testing passes:
eas build --platform android --profile production --message "Public release versionCode 20"
This will produce versionCode 20 for Play production track submission.

PROTECTED SYSTEMS UNTOUCHED: YES
═══════════════════════════════════════════════

---

## SESSION 2026-09-21 13:34 IST — PUBLIC RELEASE CONTINUATION

HEAD verified: `a1512ab485cc05191245fd43d955885a8ea011ec` matches `origin/main`.

### PHASE 1 — FIREBASE CLI VERIFICATION AND RULES DEPLOY

`firebase projects:list` (this pass):

```text
Authentication Error: Your credentials are no longer valid. Please run firebase login --reauth
```

No further Firebase commands run this pass (`firestore:rules:get` / `firebase deploy` not executed). `firebase.json` still points at repo-root `firestore.rules` (not the proposed compat file) — Step 1C would have aborted even with auth until that targeting is handled after reauth.

HUMAN ACTION REQUIRED — BLOCKING PHASE 1:
Open Terminal and run: firebase login --reauth
Sign in as: support.vyd@specialsoftwares.com
Complete authentication fully in the browser.
Then run: firebase projects:list
Confirm vyaamikk-diary appears.
Then return to Cursor and run Phase 1 again.

Skipping to Phase 2 while waiting.

### PHASE 2 — FRESH PRODUCTION AAB BUILD FROM CURRENT HEAD

Command:

```text
eas build --platform android --profile production --message "Public release candidate from a1512ab — PR26 merged"
```

Ran with `--non-interactive --no-wait` so the ID could be captured without blocking later phases. Did **not** pass `--auto-submit` or `--track`.

EAS warning: `android.googleServicesFile` is not in git and “won't be uploaded to the builder.” Watch this build’s logs; a missing `google-services.json` would be a native Firebase failure.

EAS production environment on the server does **not** currently include `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` or `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` (Phase 5 commits those into `eas.json` after this build is already queued).

FRESH AAB BUILD STARTED:
Build ID: 78202b38-c650-4067-b347-99f61539f2af
Commit: a1512ab
Message: Public release candidate from a1512ab — PR26 merged
EAS URL: https://expo.dev/accounts/vydspecial2026/projects/vyaamikk-diary/builds/78202b38-c650-4067-b347-99f61539f2af
Status: in_progress
Expected duration: ~16 minutes

### PHASE 3 — LEGAL PLACEHOLDER AUDIT

`src/config/legal.ts` read in full. File **not** edited.

LEGAL PLACEHOLDERS REQUIRING HUMAN INPUT:

1. EFFECTIVE DATE (line 11): Currently "2026-07-01" — marked as unconfirmed.
   HUMAN ACTION: Confirm this date with counsel or confirm it is correct.

2. REGISTERED ADDRESS (line 16): Currently "[REGISTERED ADDRESS — Delhi NCR, India — confirm with counsel]"
   HUMAN ACTION: Provide exact registered address of Ananya Engineered Industrial Components and Pay Systems LLP as on MCA records.

3. GRIEVANCE OFFICER NAME (line 22): Currently "[GRIEVANCE OFFICER NAME — confirm with counsel]"
   HUMAN ACTION: Provide full name and designation of the grievance officer. This is typically the founder or a named responsible person.
   Note: grievance@specialsoftwares.in is already set as the email — only the name is missing.

Do NOT edit src/config/legal.ts until the founder provides these values.
When the founder provides values, make exactly these replacements and no others:
  - Replace "[REGISTERED ADDRESS — Delhi NCR, India — confirm with counsel]" with the provided address
  - Replace "[GRIEVANCE OFFICER NAME — confirm with counsel]" with the provided name and designation
  - Update LEGAL_EFFECTIVE_DATE if the founder confirms a different date
Then run npm run typecheck and commit: git commit -am "fix(legal): populate legal.ts placeholders for store submission"

### PHASE 4 — REVIEWREFUND IMPLEMENTATION

Replaced the HTTP 503 stub in `functions/src/billing/google/rtdn.ts`. `pendingRefundReviewNotification` is a chargeback-review signal (`pendingRefundToken` + `orderId`), not a purchase token. Handler now:

1. Calls Play `orders.reviewrefund` with `NEUTRAL` when `orderId` is present (24h ReviewRefund gate; Google ignores duplicate calls).
2. Resolves uid via `_playAccountIndex` / financial ledger for that order (`_companyBilling/{uid}` holds the encrypted current purchase token).
3. Loads live state with existing `PlayApiClient.getSubscriptionV2` after decrypting the current credential — never treats `pendingRefundToken` as a purchase token.
4. If Play order is already `REFUNDED`, applies the existing voided-purchase / `applySubscriptionTransition` path (audit + ledger + `users/{uid}/subscription/status`). Schema has no `{ status: "refunded" }` field; refunds set `billingStatus: "expired"`, history type `refunded`, `entitlementActive: false`.
5. If subscription is still active / pending refund, logs and does not change entitlement.
6. HTTP 200 for handled notifications (orphaned token: first 8 chars as `tokenPrefix` only). Idempotent via `_processedBillingEvents`. Retryable Play API failures still 503 so Pub/Sub can redeliver inside the 24h window.
7. `PLAY_BILLING_ENABLED` remains **false**.

REVIEWREFUND IMPLEMENTED:
Files changed: [list]
- functions/src/billing/google/rtdn.ts
- functions/src/billing/google/androidSubscriptionAdapter.ts
- functions/src/billing/google/playApiClient.ts
- functions/src/billing/google/playTypes.ts
- functions/src/billing/google/playToken.ts
- functions/src/billing/log.ts
- functions/src/billing/google/androidPlay.unit.test.ts
- functions/src/billing/google/googlePlay.emulator.test.ts
- functions/.env.example
Tests run: [list with pass/fail]
- `npm --prefix functions run lint` (`tsc --noEmit`): PASS (after installing declared functions deps including `@apple/app-store-server-library`)
- `npm run test:billing-google-play`: PASS
- `npm run test:billing-privacy`: PASS
PLAY_BILLING_ENABLED can now be set to true after:
- Functions are deployed: firebase deploy --only functions --project vyaamikk-diary
- Play Console subscription products are created
- RTDN Pub/Sub topic is configured
- KMS secrets are confirmed

Do **not** set `PLAY_BILLING_ENABLED=true` in this session.

### PHASE 5 — COMMIT CLIENT FLAGS TO EAS.JSON

Added `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED=1` and `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED=1` to **production** and **preview** `env` only. Development profiles unchanged.

Commit: `69cbf31` — `chore: commit subscription client flags to eas.json production and preview profiles`

EAS.JSON FLAGS COMMITTED

(The Phase 2 AAB `78202b38` was already queued from `a1512ab` before this commit, so it will not include these `eas.json` flags.)

### PHASE 6 — INSTALL EXPO-IAP PERMANENTLY

`npm install` → up to date (expo-iap 5.6.0 already present from prior session + lockfile).

`npm run typecheck` → PASS

NPM INSTALL COMPLETE — TYPECHECK PASS

### PHASE 7 — TEST SUITE

`test:pending-email` listed twice; ran once.

| Command | Result |
|---------|--------|
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run test:identity-mobile` | **PASS** |
| `npm run test:save-idempotency` | **PASS** |
| `npm run test:formatters` | **PASS** |
| `npm run test:i18n` | **PASS** |
| `npm run test:letterhead-pdf` | **PASS** |
| `npm run test:auth-wrapper` | **PASS** |
| `npm run test:pending-email` | **PASS** |
| `npm run test:native-phone-auth` | **PASS** |
| `npm run test:js-auth-bridge` | **PASS** |
| `npm run test:boot-release-gate` | **PASS** |
| `npm run test:pdf-gujarati` | **PASS** |
| `npm run test:pdf-labels` | **PASS** |
| `npm run test:cash-paid-serial` | **PASS** |
| `npm run test:legal-consent` | **PASS** |
| `npm run test:production-mock-otp-isolation` | **PASS** |
| `npm run test:firestore-rules` | **PASS** (emulator; expected PERMISSION_DENIED in logs) |

No regressions. ReviewRefund unit coverage is in `npm run test:billing-google-play` (PASS, Phase 4).

### PHASE 8 — FRESH BUILD STATUS

`eas build:list --platform android --limit 1` (2026-09-21 ~13:47 IST):

```
ID          78202b38-c650-4067-b347-99f61539f2af
Status      in progress
Profile     production
Commit      a1512ab485cc05191245fd43d955885a8ea011ec
Version code 19
Started at  9/21/2026, 1:35:59 PM
Logs        https://expo.dev/accounts/vydspecial2026/projects/vyaamikk-diary/builds/78202b38-c650-4067-b347-99f61539f2af
```

Same versionCode **19** as the existing finished AAB — Play will reject a second upload of vc19. After this build finishes, bump `versionCode` before Internal/Production upload of the new AAB.

════════════════════════════════════════════════
FOUNDER MANUAL ACTION LIST — DO IN THIS ORDER
════════════════════════════════════════════════

MANUAL ACTION 1 — FIREBASE REAUTH (if not done)
Terminal: firebase login --reauth
Account: support.vyd@specialsoftwares.com
Verify: firebase projects:list shows vyaamikk-diary
Then tell Cursor to run Phase 1 again.

MANUAL ACTION 2 — UPLOAD AAB TO PLAY CONSOLE INTERNAL TRACK
Do this with the EXISTING finished AAB (versionCode 19) to unlock subscription product creation.
Do not wait for the new build.
Go to: https://play.google.com/console
Path: Your App → Testing → Internal testing → Create new release
Upload this AAB directly:
https://expo.dev/artifacts/eas/NmkNREapRF_cTxfnXPq7QD8QcTvfH9Nuicu4RlaSTA4.aab
Save and roll out to internal testers.
Wait 5–30 minutes for Google to process it.

MANUAL ACTION 3 — CREATE SUBSCRIPTION PRODUCTS IN PLAY CONSOLE
After internal AAB is processed, go to:
Monetise with Play → Products → Subscriptions → Create subscription

Create exactly these three products with these base plans:

Product ID: vyd_starter
  monthly — ₹99 — 1 month billing period
  quarterly — ₹249 — 3 month billing period
  yearly — ₹799 — 12 month billing period

Product ID: vyd_professional
  monthly — ₹249 — 1 month billing period
  quarterly — ₹649 — 3 month billing period
  yearly — ₹1,999 — 12 month billing period

Product ID: vyd_business
  monthly — ₹499 — 1 month billing period
  quarterly — ₹1,299 — 3 month billing period
  yearly — ₹3,999 — 12 month billing period

MANUAL ACTION 4 — LEGAL PLACEHOLDERS IN SRC/CONFIG/LEGAL.TS
Provide Cursor with these three values:
a) Registered address of Ananya Engineered Industrial Components and Pay Systems LLP (exact as on MCA records)
b) Grievance officer full name and designation
c) Confirm effective date 2026-07-01 or provide correct date
Cursor will make the edit and commit once you provide these.

MANUAL ACTION 5 — BILLDESK MERCHANT REGISTRATION (KYC — founder only)
APK URL for form: https://expo.dev/artifacts/eas/_QhXqHdQwmTtpgXQ1JBVbh-AyrjP9zbFiRPJuIERX0I.apk
Gather: PAN card, Aadhaar, Ananya LLP bank account details, GST certificate.
This does not block Play IAP — it is a separate payment gateway.

MANUAL ACTION 6 — DEPLOY CLOUD FUNCTIONS (after ReviewRefund is implemented by Cursor)
Terminal: firebase deploy --only functions --project vyaamikk-diary
Verify functions are live in Firebase Console.
Note: ReviewRefund source is implemented locally but **not committed**. Commit those billing files before deploy (`functions/src/billing/google/*`, `functions/src/billing/log.ts`, `functions/.env.example`).

MANUAL ACTION 7 — ENABLE PLAY BILLING (only after ALL of these are true)
- ReviewRefund implemented and Functions deployed
- Play Console subscription products created and active
- RTDN Pub/Sub topic configured in Google Cloud Console
- KMS secrets confirmed
Set PLAY_BILLING_ENABLED=true in Firebase Remote Config or Functions environment.
Build fresh AAB and submit to internal track for billing testing.

MANUAL ACTION 8 — PUBLIC RELEASE SUBMISSION
After internal billing testing passes on a real device:
Go to Play Console → Production track → Create new release
Upload the fresh AAB built from a1512ab in Phase 2.
Fill store listing, content rating, data safety form.
Submit for review.

════════════════════════════════════════════════

SESSION COMPLETE: 2026-09-21 ~13:47 IST
PHASES COMPLETED: Phase 2 (AAB queued), Phase 3 (legal audit, no edit), Phase 4 (ReviewRefund implemented + tests), Phase 5 (eas.json flags committed as 69cbf31), Phase 6 (npm install + typecheck), Phase 7 (all listed tests pass), Phase 8 (build still in progress + founder list)
PHASES BLOCKED ON HUMAN ACTION:
- Phase 1: Firebase CLI `login --reauth` as support.vyd@specialsoftwares.com (rules not deployed)
- Phase 3 file edit: waiting for founder legal values
- Phase 2/8 upload: EAS Google Play service account still missing; use Manual Action 2
- Phase 8: wait for AAB 78202b38 to finish; bump versionCode before uploading that AAB (vc19 already used)
ALL TESTS: PASS (Phase 7 list + billing-google-play + billing-privacy)
FRESH BUILD ID: 78202b38-c650-4067-b347-99f61539f2af
REVIEWREFUND STATUS: implemented (uncommitted working tree; PLAY_BILLING_ENABLED still false)
PROTECTED SYSTEMS UNTOUCHED: YES
NEXT SESSION SHOULD START WITH: (1) `firebase login --reauth` then Phase 1 rules deploy; (2) commit ReviewRefund billing files if not already committed; (3) check EAS build 78202b38
ESTIMATED STEPS TO PUBLIC RELEASE: 8 founder actions above, plus versionCode bump for the new AAB, Functions deploy, RTDN/KMS, then Internal billing test before any production-track submit. Still weeks for paid live IAP, not hours.

---

## PHASE 0 — SAFE GIT SYNC (completed earlier + resolved this pass)

### Step 0A — Stash

```text
Saved working directory and index state On main: email-otp-changes-pre-pull-20260921-130658
```

### Step 0B — Pull

Fast-forward `ce2fc75` → `a1512ab` (no pull merge conflicts).

`git log --oneline -1`:

```text
a1512ab Merge pull request #26 from specialsoftwares/release/public-android-combined
```

HEAD (full): `a1512ab485cc05191245fd43d955885a8ea011ec`  
Matches `origin/main`.

### Step 0C — Stash pop conflicts, then human-directed resolution

Pop originally conflicted. Human instruction: keep origin/main for both files.

**Conflict 1 — `package.json` — origin/main kept**

- `ci:verify`: origin/main (live-rules-compat, storage-rules, billing emulators, invoice renderer).
- `test:otp-countdown`: origin/main (`otpCountdownFormat.test.ts` **and** `otpVerifyCta.presentation.test.ts`).

**Conflict 2 — `src/auth-v2/screens/EmailOtpScreen.tsx` — origin/main kept**

- Uses `t("authV2.emailOtp.sending")` and `t("authV2.emailOtp.sendFailed")`.
- Stash hardcoded English discarded (violates i18n).

Commands run:

```text
git add package.json src/auth-v2/screens/EmailOtpScreen.tsx
git stash drop
```

Dropped stash: `6a42ffa0dc7ea414abc46ee00396247527eb61a4` (`email-otp-changes-pre-pull-20260921-130658`).

`git stash list` after drop: **empty**. Confirmed `stash@{0}: email-otp-changes-pre-pull-20260921-130658` no longer appears.

Tracked working tree matches origin/main. Remaining untracked: `.github/pull_request_template.md`, `CONTRIBUTING.md`, `CURSOR_PROGRESS.md`.

Email-OTP policy/lifecycle files already on origin/main were **not** overwritten by stash (pop could not restore those untracked paths). Unique stash extras that remain untracked: CONTRIBUTING.md + PR template.

### Step 0D — POST-PULL BILLING ASSESSMENT

```text
ls functions/src/billing/     → BILLING DIR EXISTS
ls src/services/billing/      → IAP SERVICE DIR MISSING
ls src/config/subscriptionFeatures.ts → SUBSCRIPTION FEATURES MISSING
ls src/hooks/useSubscription.ts       → USE SUBSCRIPTION MISSING
```

Path-note (same tree, different locations than the ls probes):

- IAP client lives at `src/billing/iap/` (`iapNative.ts` expo-iap 5.6.0 adapter, `iapBackend.ts`, `purchaseEntryGate.ts`).
- Feature matrix lives at `src/subscription/subscriptionFeatures.ts`.
- Hook lives at `src/subscription/SubscriptionProvider.tsx` (`useSubscription`).

`PLAY_BILLING_ENABLED` files:

- `src/billing/iap/purchaseEntryGate.ts`
- `src/billing/iap/iapBackend.ts`
- `functions/src/billing/callables/prepareAndroidBillingAccount.ts`
- `functions/src/billing/callables/validateAndActivateAndroid.ts`
- `functions/src/billing/callables/androidRtdn.ts`
- `functions/src/billing/google/playConstants.ts`

This tree `eas.json` production env is only `EXPO_PUBLIC_APP_MODE=production`. It does **not** bake `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` or `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED`.

---

## PHASE 1 — FIREBASE CLI REAUTH

`firebase projects:list`:

```text
Authentication Error: Your credentials are no longer valid. Please run firebase login --reauth
```

**HUMAN ACTION REQUIRED — BLOCKING:**

Open Terminal and run: `firebase login --reauth`  
Sign in as: `support.vyd@specialsoftwares.com`  
Complete the authentication fully.  
Then run: `firebase projects:list`  
Confirm `vyaamikk-diary` appears in the list.  
Then tell Cursor to continue Firebase rules deploy (Phase 1 remainder).

**No Firebase commands were run after this failure.** Live rules were not fetched. Live-compat rules were not deployed.

Hashes that **can** be computed offline (not live):

- Proposed live-compat: `docs/release/rules-compat/proposed/firestore.rules` **exists**  
  `shasum -a 256` = `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`
- Repo-root `firestore.rules`: `233b05b7b810b484171257f4dafe78fd0fdea5762ed6848cf8b49cd327fd58cc`  
  (this is **not** the historical live baseline `d8ee0abcd5a8f217f1fbe60af9651e5b4253b07cac72d0746c4e781a48052aa2`; comparison to production requires a live `firestore:rules:get` after reauth)

Phase 2 proceeded while waiting, as instructed.

---

## PHASE 2 — INTERNAL TRACK SUBMISSION

Command as written:

```text
eas submit --platform android --track internal --id 273df81b-4543-4003-ab55-f2a255c1119e
```

eas-cli 24.7.0 (account `vydspecial2026` / `shivamsaurav.special@gmail.com`):

1. `--track` is **not a CLI flag**. Rejected: `Nonexistent flag: --track`.
2. Track is taken from `eas.json` submit profile; **default is `internal`** when unset (`eas.json` `submit.production` is `{}`).
3. Retry without `--track`, with `--non-interactive`:

```text
Looking up credentials configuration for com.specialsoftwares.vyaamikkdiary...
Google Service Account Keys cannot be set up in --non-interactive mode.
Error: submit command failed.
```

`eas submit:list --platform android`: **no submissions**.

AAB was **not** uploaded to Play Internal. No production track was used.

**HUMAN ACTION REQUIRED:**

1. Create/upload a Google Play Android Publisher service account JSON into EAS credentials for `com.specialsoftwares.vyaamikkdiary`.
2. Re-run (internal by default):

```text
npx eas-cli submit --platform android --id 273df81b-4543-4003-ab55-f2a255c1119e --non-interactive
```

Or upload the finished AAB in Play Console → Internal testing (manual file pick). Artifact: `https://expo.dev/artifacts/eas/NmkNREapRF_cTxfnXPq7QD8QcTvfH9Nuicu4RlaSTA4.aab` (build `273df81b-4543-4003-ab55-f2a255c1119e`, versionCode 19).

BILLDESK APK PUBLIC URL:

https://expo.dev/artifacts/eas/_QhXqHdQwmTtpgXQ1JBVbh-AyrjP9zbFiRPJuIERX0I.apk

**HUMAN ACTION REQUIRED:**  
Use this URL for BillDesk merchant registration form.  
KYC documents (PAN, Aadhaar, bank details for Ananya LLP) must be provided by the founder personally.

---

## PHASE 3 — LEGAL PLACEHOLDERS (src/config/legal.ts not edited)

`grep -rn "GRIEVANCE OFFICER\|REGISTERED ADDRESS\|\[.*\]" src/config/legal.ts`

**HUMAN ACTION REQUIRED — do not invent values. Founder/counsel must supply:**

| Line | Placeholder / unconfirmed text |
|------|--------------------------------|
| 11 | `LEGAL_EFFECTIVE_DATE = "2026-07-01"` — comment on line 10: “Placeholder until counsel confirms publication date.” Not bracket-syntax, still unconfirmed. |
| 16 | `"[REGISTERED ADDRESS — Delhi NCR, India — confirm with counsel]"` |
| 22 | `name: "[GRIEVANCE OFFICER NAME — confirm with counsel]"` |

Founder must provide:

- Grievance officer name and designation (email currently `grievance@specialsoftwares.in` — not a `[…]` placeholder; still confirm with counsel)
- Registered address of Ananya Engineered Industrial Components and Pay Systems LLP
- Effective date of the legal documents

`src/config/legal.ts` was **not** edited.

---

## PHASE 4 — SUPPORT EMAIL

**SKIPPED** per instruction. `legal.supportEmail` / `EXPO_PUBLIC_SUPPORT_EMAIL` not touched.

---

## PHASE 5 — LEGAL URL HTTP CODES

| URL | HTTP |
|-----|------|
| https://vyaamikk.specialsoftwares.com/privacy | **200** |
| https://vyaamikk.specialsoftwares.com/terms | **200** |
| https://vyaamikk.specialsoftwares.com/delete-account | **200** |
| https://vyaamikk.specialsoftwares.in/privacy | **000** (curl 6: Could not resolve host; no A/AAAA) |
| https://vyaamikk.specialsoftwares.in/terms | **000** (same) |
| https://vyaamikk.specialsoftwares.in/delete-account | **000** (same) |

Non-200 = release blocker.

LEGAL PAGE MISSING — HUMAN ACTION REQUIRED — DEPLOY TO VERCEL (and/or DNS): `vyaamikk.specialsoftwares.in` does not resolve. Not a 404; the host has no DNS records. `.com` legal paths return 200. App defaults in `src/config/env.ts` already point at `.com`.

---

## PHASE 6 — TESTS ON SYNCED CODEBASE

First `npm run typecheck` after stash resolve failed:

```text
src/billing/iap/iapNative.ts(41,8): error TS2307: Cannot find module 'expo-iap'
```

Cause: `expo-iap@5.6.0` is declared in `package.json` but was missing from this workspace’s real (non-symlink) `node_modules` (stale local install vs origin/main). Not a source regression.

Fix (environment only; `package.json` / lockfile unchanged): `npm install expo-iap@5.6.0 --no-save`.

| Command | Result |
|---------|--------|
| `npm run typecheck` | **PASS** (after expo-iap install) |
| `npm run lint` | **PASS** |
| `npm run test:identity-mobile` | **PASS** (`identity.mobile.test.ts: ok`) |
| `npm run test:save-idempotency` | **PASS** |
| `npm run test:formatters` | **PASS** |
| `npm run test:i18n` | **PASS** (i18n + key consistency + consentLocale) |
| `npm run test:letterhead-pdf` | **PASS** |
| `npm run test:auth-wrapper` | **PASS** |
| `npm run test:pending-email` | **PASS** (lifecycle + `pendingEmailPolicy.unit.test.ts`) |
| `npm run test:native-phone-auth` | **PASS** (12 files) |
| `npm run test:js-auth-bridge` | **PASS** |
| `npm run test:boot-release-gate` | **PASS** |

No source test regressions from the pull were found. No origin/main source was changed to make tests pass.

---

## PHASE 7 — BILLING COMPLETE VS STUB (assess only; nothing implemented)

`functions/src/billing/` **exists**. Billing is **not** missing from origin/main. Do not treat “path names from older diagnostics” as missing implementations.

### Cloud Functions exported from `functions/src/index.ts`

| Export | Verdict |
|--------|---------|
| `prepareAndroidBillingAccount` | **Complete** handler (`ensurePlayAccountIndex`). Production **fail-closed** unless `PLAY_BILLING_ENABLED=true`. |
| `validateAndActivateAndroid` | **Complete** Play purchase validation. Uses `PlayApiClient` → Android Publisher v3 REST (`getSubscriptionV2` / acknowledge) with ADC tokens + fetch. **Not** a throw-stub. Fail-closed unless `PLAY_BILLING_ENABLED=true`. |
| `androidRtdn` | **Complete** Pub/Sub push handler with OIDC (`pubsubOidc.ts`). Fail-closed unless `PLAY_BILLING_ENABLED=true`. **Partial:** `pendingRefundReviewNotification` is **unimplemented** (`functions/src/billing/google/rtdn.ts` ~116–127) → `pending_refund_review_unimplemented`, HTTP 503, never persists `pendingRefundToken`. Hard go-live gate in `functions/.env.example`. |
| `scheduledBillingReconciliation` | **Complete** scheduled worker (`runBillingReconciliationTick` + Play/Apple revalidators). Fail-closed unless `BILLING_RECONCILIATION_ENABLED=true`. |
| `retryReconciliationWorkItem` | **Complete** admin requeue. Fail-closed unless `BILLING_RECONCILIATION_OPERATOR_ENABLED=true`. |
| `prepareIOSBillingAccount` | **Complete** handler. Fail-closed unless `APPSTORE_BILLING_ENABLED=true`. Even if that flag is true, `assertAppStoreLiveBillingAllowed()` hard-fails: `APP_STORE_FINANCIAL_REPORTING_AUTHORITY_IMPLEMENTED=false` and `APP_STORE_PRODUCT_IDENTIFIERS_CONFIRMED=false`. |
| `validateAndActivateIOS` | **Complete** JWS path via `@apple/app-store-server-library` `SignedDataVerifier`. Same App Store hard gates. |
| `appStoreServerNotificationsV2` | **Complete** ASSN v2 handler; verifies notification JWS **before** mutation. Same App Store hard gates. |
| `updateBillingDetails` | **Complete** GST/address writer. Fail-closed unless `UPDATE_BILLING_DETAILS_ENABLED=true`. |
| `verifyGstinManual` | Handler exists; **production export is a hard stub** — always `failed-precondition` “Admin GSTIN verification is not production-enabled in VYD-40.” |
| `getInvoiceDownloadUrl` | `createInvoiceDownloadUrl` is a **complete** signed-URL implementation; **production export is a hard stub** — always “Invoice download callable is not production-enabled in VYD-40.” |
| `generateGstr1WorkingPapers` | Handler exists; **production export is a hard stub** (VYD-40). |
| `markGstr1Filed` | Handler exists; **production export is a hard stub** (VYD-40). |
| `reviewSubscriptionTaxCompliance` | Handler exists; **production export is a hard stub** (VYD-40). |

### Not Cloud Functions (still real)

- **Quota / “enforce record creation”:** no `enforceRecordCreation.ts` / `monthlyUsageReset.ts`. Enforcement is **Option-C** client `src/billing/optionC/atomicBillableCreate.ts` + `firestore.rules` `usageCurrent`. Complete for that architecture.
- **Invoices:** tax math/finalization under `functions/src/billing/tax/*` is substantial; issuance fail-closed until PlatformTaxPolicy / seller GST identity confirmed. Separate invoice renderer service + `test:invoice-renderer-*` in `ci:verify`.
- **IAP UI:** `src/components/billing/SubscriptionManagementScreen.tsx` + `src/subscription/subscriptionManagementRuntime.ts`. Purchase entry gated by `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED === "1"` (off in this `eas.json`).

### Do not enable

`PLAY_BILLING_ENABLED=true` must stay **fail-closed** until ReviewRefund (24h) is implemented. Not flipped this session.

Android catalog in source (Play Console products **not** created this session): `vyd_starter` / `vyd_professional` / `vyd_business` × base plans `monthly` | `quarterly` | `yearly`. Expected paise: starter 9900/24900/79900, professional 24900/64900/199900, business 49900/129900/399900.

---

═══════════════════════════════════════  
RELEASE READINESS REPORT — 2026-09-21 IST  
═══════════════════════════════════════

### CONFIRMED READY

- Git: `main` = `origin/main` = `a1512ab` (PR #26 merge). Stash `email-otp-changes-pre-pull-20260921-130658` **dropped**. Working tree tracked-clean.
- `package.json` `ci:verify` and `test:otp-countdown` = origin/main (fuller scripts).
- `EmailOtpScreen` i18n keys (not hardcoded English).
- Proposed live-compat Rules file present; sha256 `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`.
- Local `app.json` android `versionCode` **19** (matches finished EAS AAB).
- EAS production AAB `273df81b-4543-4003-ab55-f2a255c1119e` previously FINISHED (artifact URL above).
- Preview APK public HTTPS URL for BillDesk (above).
- `.com` privacy / terms / delete-account HTTP **200**.
- Typecheck, lint, and all listed Phase 6 tests **PASS** after installing declared `expo-iap@5.6.0` into local `node_modules`.
- Billing **source** is on origin/main: Play REST validator, RTDN+OIDC, Apple SignedDataVerifier, Option-C quota, GST modules, reconciliation scheduler. Client IAP adapter is real expo-iap 5.6.0 (not a missing `src/services/billing` stub).
- `PLAY_BILLING_ENABLED` remains false. Production Play track unused.

### COMPLETED THIS SESSION

- Resolved stash conflicts **in favour of origin/main**; `git add`; `git stash drop`; confirmed stash list empty.
- Recorded Firebase unauthenticated state; did not deploy Rules.
- Attempted Internal-track EAS submit; recorded GSA/credential block.
- Flagged legal.ts placeholders with line numbers; did not edit the file.
- Curled six legal URLs; recorded codes.
- Installed missing declared `expo-iap@5.6.0` (`--no-save`) so typecheck matches origin/main.
- Ran Phase 6 test list; all passed.
- Assessed billing complete vs stub (no billing implementation).
- Skipped Phase 4 (support email).

### HUMAN ACTION REQUIRED BEFORE SUBMISSION

1. `firebase login --reauth` as `support.vyd@specialsoftwares.com`, then `firebase projects:list`, then continue Phase 1 live Rules get/deploy.
2. Legal placeholder values in `src/config/legal.ts` (grievance officer, registered address, counsel-confirmed effective date). Do not invent them.
3. BillDesk form — use APK URL above — KYC is founder-only.
4. Play Console: EAS Google service account (or manual Internal AAB upload), then create subscription products (`vyd_starter` / `vyd_professional` / `vyd_business` × monthly/quarterly/yearly) **after** Internal artifact is on the track.
5. Legal pages — `.com` is 200; **`vyaamikk.specialsoftwares.in` has no DNS**. Fix DNS and/or deploy `.in` (Vercel) if that hostname is required. Not a 404.
6. Implement `pendingRefundReviewNotification` / ReviewRefund (24h) **before** any `PLAY_BILLING_ENABLED=true`.
7. Confirm GST/KMS/Functions deploy, tax-policy env, and (separately) whether to bake client purchase/upsell flags into a **new** EAS build. Current HEAD AAB `273df81b` is from earlier commit `63a7075`, not `a1512ab`.

### CODE WORK REMAINING

- ReviewRefund RTDN path (hard Play go-live gate).
- Wire VYD-40 GST callables from hard export stubs to production-enabled paths only after CA/legal identity is confirmed.
- Apple: financial reporting authority + confirmed App Store product IDs before `APPSTORE_BILLING_ENABLED`.
- Optional: persist `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` / `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` in committed `eas.json` if those flags should ship (they are not in this tree).
- Functions not deployed this session; live Firestore Rules not deployed this session.
- Untracked `CONTRIBUTING.md` / `.github/pull_request_template.md` — decide keep vs discard.

### ESTIMATED TIME TO PUBLIC RELEASE

- **Internal testing binary on Play:** hours–1 day of **human** work (Firebase reauth, EAS Play JSON or Console upload). Not blocked on more app source for that upload.
- **Paid subscriptions live in production:** **weeks**, not hours. Blockers: ReviewRefund, Play products, Functions+KMS+RTDN, GST identity, legal counsel placeholders, counsel-confirmed pages, `PLAY_BILLING_ENABLED` still correctly off. BillDesk is last and does not unblock Play IAP.
- **Public Play listing / production track:** not authorized this session; listing/legal/KYC still open.

### PROTECTED SYSTEMS CONFIRMED UNTOUCHED: YES

No edits to `src/config/legal.ts`, support email, i18n locale tables, `PLAY_BILLING_ENABLED`, production Play track, or Firebase production. No billing implementation. Stash conflict resolution kept origin/main only.

═══════════════════════════════════════

### REPLACEMENT PUBLIC AAB STARTED

- Build ID: `03a0e221-c48c-47f5-be11-5efed91abf40`
- EAS URL: https://expo.dev/accounts/vydspecial2026/projects/vyaamikk-diary/builds/03a0e221-c48c-47f5-be11-5efed91abf40
- Commit: `0da2f58970f23c7ce6cbefae6efffd49c731f44b`
- versionCode: `20`
- version: `1.0.0`
- Status: in queue
- DO NOT UPLOAD build `0f362a28` / the me8I7mhe artifact (wrong effective date 2026-09-22)
- `PLAY_BILLING_ENABLED` remains false
- No eas submit, no production track
