# App Check design (REL-08)

Status: preparatory design only. No SDK install, Console enablement, Rules deploy, or enforcement is authorized by this document.

Audited source: `origin/main` `79d405d0b626d5067a33541887ac3c70689b8724` plus stacked PR #22 head `8adcd7b604257d00b43635e70d90e4e97e5bcd57` (App Check surface is unchanged on #22).

Installed product is Expo `~54.0.36`. AGENTS.md points at Expo 56 docs; that discrepancy is not permission to upgrade.

Live Console/API comparison: REL-10 read-only inspection on 2026-09-19 as Firebase CLI user `support.vyd@specialsoftwares.com`, project `vyaamikk-diary` (number `982505811909`). No enforcement, deploy, or flag write was performed.

## Current packages (source)

| Package | Declared version | Role |
| --- | --- | --- |
| `expo` | `~54.0.36` | App runtime. Do not upgrade for App Check. |
| `firebase` (JS SDK) | `^12.14.0` | Firestore, Storage, JS Auth bridge, billing callables |
| `@react-native-firebase/app` | `^24.1.0` | Native Firebase app |
| `@react-native-firebase/auth` | `^24.1.0` | Native Phone Auth |
| `@react-native-firebase/functions` | `^24.1.0` | Native identity callables when native auth is linked |
| `firebase-admin` | `^13.4.0` | Functions Admin |
| `firebase-functions` | `^6.3.2` | v2 `onCall` / `onRequest` |

Absent: `@react-native-firebase/app-check`, `firebase/app-check` imports, `initializeAppCheck`, `ReactNativeFirebaseAppCheckProvider`, Expo config plugin for App Check. `app.json` plugins list `@react-native-firebase/app` and `@react-native-firebase/auth` only. Repo search: no `enforceAppCheck` in Functions source.

Related but not App Check: `src/services/device/deviceIntegrity.ts` is a dormant placeholder (`probeDeviceIntegrity` returns `unavailable`). It is not called from login. `EXPO_PUBLIC_SKIP_DEVICE_INTEGRITY=1` must never ship in a store binary.

## What App Check is not

- App Check is not user authentication. Phone OTP and the JS custom-token bridge still establish `request.auth`.
- App Check is not Security Rules authorization. [Firestore `Request`](https://firebase.google.com/docs/reference/rules/rules.firestore.Request) exposes `auth`, `method`, `path`, `query`, `resource`, and `time`. There is **no** `request.appCheck` field. Do not add Rules conditions that assume one.
- App Check is not Firebase Authentication’s Play Integrity / reCAPTCHA / APNs **SMS device verification**. Silent Phone Auth and App Check tokens are separate controls.
- App Check service enforcement (Firestore, Storage, Authentication) is configured in Firebase Console and can be turned off there product-by-product. Callable enforcement is **deployed function configuration** (`enforceAppCheck: true` on `onCall`); changing it requires the corresponding reviewed Functions deployment. A Console switch is not a complete callable rollback.
- On callables, verified app information is `request.app` (v2) after App Check succeeds. That is Functions request metadata, not a Rules field.

## Boot / auth / backend paths

### Native Firebase (`@react-native-firebase/*`)

- Native `[DEFAULT]` app is configured by the RNFirebase Expo plugins at native boot (`FirebaseApp.configure()`).
- Phone OTP: `src/services/auth/firebase.ts` `startOtp` → `startNativePhoneOtp`; `confirmOtp` → `confirmNativePhoneOtp` (`src/services/auth/nativePhoneAuth.ts`). Expo Go cannot send real OTP.
- Identity callables: `src/services/auth/identityCallable.ts` prefers `@react-native-firebase/functions` `httpsCallable` in `asia-south1` when native auth is linked (`tryNativeFunctionsForRegion`). Fallback is JS `firebase/functions`.
- Native Phone Auth attestation is **Firebase Authentication device verification for SMS**, not App Check. A native App Check token does not by itself prove SMS will be silent, and silent Play Integrity for Phone Auth does not attach App Check tokens to JS SDK calls.

### JS Firebase (`firebase/*`)

- Lazy app: `src/config/firebase.ts` `initializeApp` / `getFirestore` / `getStorage` / `initializeAuth` (JS Auth with AsyncStorage persistence).
- JS Auth session is a **separate** auth instance from native Auth. `src/services/auth/jsAuthBridge.ts` mints a custom token (`mintClientAuthToken`) and `signInWithCustomToken` so Firestore/Storage `request.auth.uid` matches. Without the bridge, JS Firestore/Storage run unauthenticated and Rules deny them.
- Billing: `src/billing/iap/iapBackend.ts` uses **only** JS `getFunctions` + `httpsCallable` (`prepareAndroidBillingAccount`, `validateAndActivateAndroid`, iOS equivalents). Native App Check on the RNFirebase app would **not** automatically stamp these calls.

### Functions / Rules / Storage (source)

- Callables are `firebase-functions/v2/https` `onCall` in `asia-south1`. Example: `functions/src/email/verification.ts` `startEmailVerification` comments that App Check is not enforced so emulator / Expo Go remain usable.
- HTTP handlers (Play RTDN, App Store Server Notifications) are not callable-App-Check surfaces; they use OIDC / SignedDataVerifier. App Check does not replace those authenticators.

## Native vs JS App Check context

Do not assume native initialization protects JS SDK calls. There are two client app instances:

1. RNFirebase `[DEFAULT]` — Phone Auth and native Functions.
2. JS `firebase/app` — Firestore, Storage, JS Auth, billing Functions.

App Check tokens attach per SDK:

| Client call | SDK | Token source if App Check were added |
| --- | --- | --- |
| `signInWithPhoneNumber` / confirm | `@react-native-firebase/auth` | Native App Check **if** Auth App Check is enabled (Firebase Auth App Check is preview). Independent of JS `initializeAppCheck`. |
| `identityCallable` native transport | `@react-native-firebase/functions` | Native App Check token after RNFirebase `initializeAppCheck(getApp(), …)`. |
| `identityCallable` JS fallback | `firebase/functions` | JS App Check token only after `initializeAppCheck` on the **JS** app. |
| `iapBackend` billing callables | `firebase/functions` | JS App Check only. Native-only init would fail closed once callable `enforceAppCheck` is deployed. |
| Firestore / Storage | `firebase/firestore`, `firebase/storage` | JS App Check only, consumed by **Console service enforcement**, not by a Rules `request.appCheck` field. Native App Check does not satisfy JS SDK traffic. |
| `mintClientAuthToken` | whichever Functions transport is used | Must match that transport’s App Check context. |

A later implementation would need **both**:

- `@react-native-firebase/app-check` on the native app (`getApp()` from `@react-native-firebase/app`).
- `initializeAppCheck` on the JS `getFirebaseApp()` instance (`firebase/app-check`).

A `CustomProvider` that copies a native token onto the JS app is **unproven** on this project. Acceptance of that bridge must cover app/project binding, refresh/expiry, initialization ordering, and controlled failure using the declared dependency versions (`firebase` ^12.14.0 and `@react-native-firebase/*` ^24.1.0). Do not install or upgrade SDKs now. Web-only `ReCaptchaV3Provider` / `ReCaptchaEnterpriseProvider` do not attest the Android/iOS store app.

## Supported providers (primary docs)

Sources: [Firebase App Check overview](https://firebase.google.com/docs/app-check), [Play Integrity provider (Android)](https://firebase.google.com/docs/app-check/android/play-integrity-provider), [service enforcement](https://firebase.google.com/docs/app-check/enable-enforcement), [callable enforcement](https://firebase.google.com/docs/app-check/cloud-functions), [RNFirebase App Check usage](https://rnfirebase.io/app-check/usage/).

- Android: Play Integrity (`playIntegrity`). Firebase supports apps distributed on Play, outside Play, or both. Required `PLAY_RECOGNIZED` / `LICENSED` labels and the minimum device-integrity verdict are **configuration**, not a universal sideload ban. A sideloaded build may or may not obtain tokens depending on those settings and Play Integrity eligibility. Do not claim a sideloaded app can never obtain Play Integrity App Check tokens. Do not weaken live verdict requirements or propose a production debug-token bypass.
- iOS store: App Attest (`appAttest`) or `appAttestWithDeviceCheckFallback`. Supported RNFirebase Apple strings: `debug`, `deviceCheck`, `appAttest`, `appAttestWithDeviceCheckFallback`. Unsupported strings can silently leave a debug factory installed — do not invent provider names.
- Development: debug provider only. RNFirebase documents `debugToken` / `FIREBASE_APP_CHECK_DEBUG_TOKEN` for emulators, simulators, Expo dev clients, and CI.
- Web (if ever enforced): reCAPTCHA v3 / Enterprise. Not the Android/iOS production path.

Sibling package for the installed native stack would be `@react-native-firebase/app-check@^24.1.0`. RNFirebase v26 requires New Architecture; this design does not authorize that upgrade.

Firebase Android BoM in current Play Integrity docs is `34.18.0` / `34.19.0`; RNFirebase Auth 24.1.0 historically pulled BOM `34.14.0`. Exact native BOM after adding app-check must be verified at install time — not assumed here.

## Initialization order (when later authorized)

RNFirebase requires App Check registration **before** `FirebaseApp.configure()`:

- iOS: `RNFBAppCheckModule.sharedInstance()` then `FirebaseApp.configure()`; Expo plugin only registers the native module, JS still must call `initializeAppCheck`.
- JS: `initializeAppCheck` before any Firestore / Storage / Functions / Auth backend use. Until configured, `getToken` fails with `appCheck/provider-not-ready`.

Recommended product order after a later install (not done now):

1. Native App Check module + plugin.
2. `initializeAppCheck` on RNFirebase `getApp()` with Play Integrity / App Attest in store builds; debug provider only in non-store profiles.
3. `initializeAppCheck` on JS `getFirebaseApp()` so billing + Firestore/Storage send tokens (proven provider or a later-accepted CustomProvider bridge).
4. Then Phone Auth, identity callables, JS auth bridge, record writes.

Phone Auth must be re-tested after step 2. Enabling Auth App Check enforcement (preview) can fail SMS/session calls if tokens are missing.

## Debug versus release

| Build | Provider | Debug token |
| --- | --- | --- |
| Local emulator / Expo Go | Not a store attestation path. Expo Go cannot load RNFirebase App Check. | N/A; do not claim protection. |
| EAS `development` / `development-production-otp` | Debug provider only, if App Check is initialized at all | Console-registered debug tokens only. Never copy tokens into the register or git. |
| EAS `preview` internal APK | Token fetch depends on Play Integrity eligibility **and** this project’s Play Integrity App Check settings. Treat as unenforced until a device measurement exists. | No production debug-token bypass. |
| EAS `production` AAB / Play install | Play Integrity / App Attest | Forbidden. `eas.json` must not gain `FIREBASE_APP_CHECK_DEBUG_TOKEN` on production. |

No production debug-token bypass. Do not leave the debug provider installed when an unsupported Apple provider string fails to match.

## Enforcement and rollback (split by product)

1. **Monitor, do not enforce.** Console App Check metrics for Firestore, Storage, Authentication, and callable traffic until verified-token ratio is stable on the intended distribution.
2. **Callable Functions:** set `enforceAppCheck: true` on each `onCall` and **deploy** those functions. Expected failure without tokens: callable errors (`unauthenticated` / failed-precondition style). Rollback is a reviewed Functions deploy that removes or sets `enforceAppCheck: false`. Console Firestore/Storage enforcement does not roll this back.
3. **Firestore / Storage / Authentication service enforcement:** Console product toggle ([enable enforcement](https://firebase.google.com/docs/app-check/enable-enforcement)). Rollback is the matching Console switch (can take up to ~15 minutes). This does not change callable `enforceAppCheck`.
4. **Auth App Check (preview)** last, after Phone Auth matrix on the intended Android/iOS distribution.
5. **Old clients:** current source binaries have **zero** App Check tokens. Enforcement would fail-closed for every client that does not send tokens. Blank listing URLs and previously inaccessible Console pages do **not** prove there is no Play-installed fleet. REL-09 Play inspect is still required before any fleet/grandfathering claim. Any enforcement date must wait until the supported clients already send tokens.

HTTP RTDN/ASSN paths stay on their existing authenticators. App Check does not monitor those.

## Test matrix (later, not run)

| Case | Prerequisite | Expect |
| --- | --- | --- |
| Monitor-mode Play-installed Android | REL-09 SHA-256 vs Play App Signing; Play Integrity Cloud project link still unread in Play Console | Tokens may be accepted according to live Play Integrity App Check settings; Phone Auth still completes |
| Sideload preview APK | Unenforced | Token fetch is configuration-dependent; app must remain usable while enforcement is off |
| JS billing callable with only native App Check | Callables unenforced | Call succeeds today; would fail after a deployed `enforceAppCheck: true` — proves dual-init requirement |
| Firestore save after JS bridge, no JS App Check | Firestore service unenforced | Succeeds today; would fail after Console Firestore enforcement, not because of a Rules `request.appCheck` field |
| Debug provider in production profile | Forbidden | Must not be configurable |

## REL-10 live facts (2026-09-19, read-only)

Project apps (ACTIVE): Android / iOS / Web. Android/iOS namespace `com.specialsoftwares.vyaamikkdiary`.

Registered Android SHA hashes (Console; `oauth_client` count in `google-services.json` is not fingerprint evidence):

| Type | Hash |
| --- | --- |
| SHA_1 | `20f8150e213c9c3f84fdcac51e9e4dcceea242ad` |
| SHA_1 | `d223f0a5effd8e2e421752d35ad7a00e19f82e59` |
| SHA_256 | `e688fa0ba5fa3bd30585114f8c2143e1efdda1acbfdb9daadc42da896178752a` |
| SHA_256 | `b9c521e3b57eab0c3d3dc7b85de91d67ef9f2abd90cc6950c5700b4f2636ce92` |

Which hash is upload vs Play App Signing vs debug is **not** established until REL-09.

App Check providers are **registered**; backend enforcement is **not** on:

| Surface | Live observation |
| --- | --- |
| Firestore App Check | `enforcementMode: UNENFORCED` (updated 2026-06-13) |
| Authentication / Identity Toolkit App Check | `UNENFORCED` (updated 2026-06-13) |
| Storage App Check | Service record present; no `enforcementMode` field; `updateTime` 1970-01-01 — treat as not enforced / never toggled |
| Data Connect App Check | `UNENFORCED` (not used by this app) |
| Callable `enforceAppCheck` | Deployed callable triggers are empty objects; source has no `enforceAppCheck` |
| Android Play Integrity App Check | Config exists; `tokenTtl` 3600s; API payload `deviceIntegrity.minDeviceRecognitionLevel: NO_INTEGRITY`. `PLAY_RECOGNIZED` / `LICENSED` fields were **not** present in this API payload — do not invent them as verified |
| iOS App Attest / DeviceCheck | Configs exist; `tokenTtl` 3600s |
| Web reCAPTCHA v3 | Config exists; `tokenTtl` 86400s; `minValidScore` 0.5 |

Do not change these settings in this continuation. `NO_INTEGRITY` is recorded as observed, not as a recommended production bar.

Deployed Functions (asia-south1, nodejs20, ACTIVE): identity / email / recovery / deletion / security only, including `mintClientAuthToken`. Source also **exports** billing/GST callables (`updateBillingDetails`, `prepareAndroidBillingAccount`, `validateAndActivateAndroid`, `androidRtdn`, iOS equivalents, GST helpers). Those names are **absent** from `firebase functions:list`. Live `PLAY_BILLING_ENABLED` / `APPSTORE_BILLING_ENABLED` therefore cannot be observed on a deployed billing handler. Deployed identity function environment variables do not include those flags.

Deployed Rules ≠ current repo files (hashes differ). Neither live nor repo Rules mention `appCheck` / `request.appCheck`.

- Firestore release `cloud.firestore`, ruleset `9c02e187-bd1c-4a5f-bdcc-d8f070e0a5b2`, last release update 2026-08-12. Live file sha256 `d8ee0abcd5a8f217f1fbe60af9651e5b4253b07cac72d0746c4e781a48052aa2`. Repo `firestore.rules` sha256 `ac19cea6c4ae4618686f90e7017d27aacd5bfef7cba717866349439e052bc14b`. Repo adds subscription/quota/billing match paths (`quotaEnforcementOn`, `usageCurrent`, billing ledgers) that are **not** in the live ruleset. Live ordinary CREATE for diary/PO/CC/pack does not apply that monthly quota gate.
- Storage release for bucket `vyaamikk-diary.firebasestorage.app`, ruleset `a2a0ddf7-9746-4dd2-bd48-29c9abc0e41f`, last update 2026-07-23. Live sha256 `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5`. Repo adds explicit deny matches for `company/invoices` and `company/gstr1-reports`; live already has a catch-all deny.

Phone Auth (Identity Toolkit config, secrets withheld): phone sign-in enabled; SMS region allowlist `IN` only; MFA `DISABLED`; authorized domains `localhost`, `vyaamikk-diary.firebaseapp.com`, `vyaamikk-diary.web.app`. Test phone numbers exist (count 5); values are not recorded here. Firebase Auth SMS Play Integrity vs reCAPTCHA fallback is **not** a field in this Identity Toolkit config payload.

Still unread (Play Console / user documents): Play Integrity API Cloud-project link, tracks, uploaded versionCodes, which SHA is Play App Signing, per-user `quotaEnforcementEnabled` documents, EAS secret values.

This plan is not production protection. Current backends are not App Check–enforced.
