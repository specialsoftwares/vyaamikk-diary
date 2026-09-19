# App Check design (REL-08)

Status: preparatory design only. No SDK install, Console enablement, Rules deploy, or enforcement is authorized by this document. Live App Check / Rules / Functions comparison remains blocked on REL-10.

Audited source: `origin/main` `79d405d0b626d5067a33541887ac3c70689b8724` plus stacked PR #22 head `8adcd7b604257d00b43635e70d90e4e97e5bcd57` (App Check surface is unchanged on #22).

Installed product is Expo `~54.0.36`. AGENTS.md points at Expo 56 docs; that discrepancy is not permission to upgrade.

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

Absent: `@react-native-firebase/app-check`, `firebase/app-check` imports, `initializeAppCheck`, `ReactNativeFirebaseAppCheckProvider`, Expo config plugin for App Check. `app.json` plugins list `@react-native-firebase/app` and `@react-native-firebase/auth` only.

Related but not App Check: `src/services/device/deviceIntegrity.ts` is a dormant placeholder (`probeDeviceIntegrity` returns `unavailable`). It is not called from login. `EXPO_PUBLIC_SKIP_DEVICE_INTEGRITY=1` must never ship in a store binary.

## Boot / auth / backend paths

### Native Firebase (`@react-native-firebase/*`)

- Native `[DEFAULT]` app is configured by the RNFirebase Expo plugins at native boot (`FirebaseApp.configure()`).
- Phone OTP: `src/services/auth/firebase.ts` `startOtp` → `startNativePhoneOtp`; `confirmOtp` → `confirmNativePhoneOtp` (`src/services/auth/nativePhoneAuth.ts`). Expo Go cannot send real OTP.
- Identity callables: `src/services/auth/identityCallable.ts` prefers `@react-native-firebase/functions` `httpsCallable` in `asia-south1` when native auth is linked (`tryNativeFunctionsForRegion`). Fallback is JS `firebase/functions`.
- Native Phone Auth attestation (Play Integrity / reCAPTCHA / APNs) is **Firebase Authentication device verification for SMS**, not App Check. A native App Check token does not by itself prove SMS will be silent, and silent Play Integrity for Phone Auth does not attach App Check tokens to JS SDK calls.

### JS Firebase (`firebase/*`)

- Lazy app: `src/config/firebase.ts` `initializeApp` / `getFirestore` / `getStorage` / `initializeAuth` (JS Auth with AsyncStorage persistence).
- JS Auth session is a **separate** auth instance from native Auth. `src/services/auth/jsAuthBridge.ts` mints a custom token (`mintClientAuthToken`) and `signInWithCustomToken` so Firestore/Storage `request.auth.uid` matches. Without the bridge, JS Firestore/Storage run unauthenticated and Rules deny them.
- Billing: `src/billing/iap/iapBackend.ts` uses **only** JS `getFunctions` + `httpsCallable` (`prepareAndroidBillingAccount`, `validateAndActivateAndroid`, iOS equivalents). Native App Check on the RNFirebase app would **not** automatically stamp these calls.

### Functions / Rules / Storage

- Callables are `firebase-functions/v2/https` `onCall` in `asia-south1`. Example: `functions/src/email/verification.ts` `startEmailVerification` comments that App Check is not enforced so emulator / Expo Go remain usable.
- Repo search: no `enforceAppCheck`, no `request.appCheck` in `firestore.rules` / `storage.rules`.
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
| `iapBackend` billing callables | `firebase/functions` | JS App Check only. Native-only init would fail closed once Functions enforcement is on. |
| Firestore / Storage | `firebase/firestore`, `firebase/storage` | JS App Check only. Native App Check does not satisfy JS Rules `request.appCheck`. |
| `mintClientAuthToken` | whichever Functions transport is used | Must match that transport’s App Check context. |

A later implementation would need **both**:

- `@react-native-firebase/app-check` on the native app (`getApp()` from `@react-native-firebase/app`).
- `initializeAppCheck` on the JS `getFirebaseApp()` instance (`firebase/app-check`), typically via a `CustomProvider` that reuses the native token or a documented JS provider. Web-only `ReCaptchaV3Provider` / `ReCaptchaEnterpriseProvider` do not attest the Android/iOS store app.

## Supported providers (primary docs)

Sources: [Firebase App Check overview](https://firebase.google.com/docs/app-check), [Play Integrity provider (Android)](https://firebase.google.com/docs/app-check/android/play-integrity-provider), [RNFirebase App Check usage](https://rnfirebase.io/app-check/usage/).

- Android store: Play Integrity (`playIntegrity`). Play-distributed install is required to fetch production tokens. SafetyNet is deprecated.
- iOS store: App Attest (`appAttest`) or `appAttestWithDeviceCheckFallback`. Supported RNFirebase Apple strings: `debug`, `deviceCheck`, `appAttest`, `appAttestWithDeviceCheckFallback`. Unsupported strings can silently leave a debug factory installed — do not invent provider names.
- Development: debug provider only. RNFirebase documents `debugToken` / `FIREBASE_APP_CHECK_DEBUG_TOKEN` for emulators, simulators, Expo dev clients, and CI.
- Web (if ever enforced): reCAPTCHA v3 / Enterprise. Not the Android/iOS production path.

Sibling package for the installed native stack would be `@react-native-firebase/app-check@^24.1.0`. RNFirebase v26 requires New Architecture; this design does not authorize that upgrade.

Firebase Android BoM in current Play Integrity docs is `34.18.0`; RNFirebase Auth 24.1.0 historically pulled BOM `34.14.0`. Exact native BOM after adding app-check must be verified at install time — not assumed here.

## Initialization order (when later authorized)

RNFirebase requires App Check registration **before** `FirebaseApp.configure()`:

- iOS: `RNFBAppCheckModule.sharedInstance()` then `FirebaseApp.configure()`; Expo plugin only registers the native module, JS still must call `initializeAppCheck`.
- JS: `initializeAppCheck` before any Firestore / Storage / Functions / Auth backend use. Until configured, `getToken` fails with `appCheck/provider-not-ready`.

Recommended product order after a later install (not done now):

1. Native App Check module + plugin.
2. `initializeAppCheck` on RNFirebase `getApp()` with Play Integrity / App Attest in store builds; debug provider only in non-store profiles.
3. `initializeAppCheck` on JS `getFirebaseApp()` so billing + Firestore/Storage send tokens.
4. Then Phone Auth, identity callables, JS auth bridge, record writes.

Phone Auth must be re-tested after step 2. App Check is complementary to Authentication; enabling Auth App Check enforcement (preview) can fail SMS/session calls if tokens are missing. Sideloaded APKs already use browser reCAPTCHA for Phone Auth when Play Integrity cannot attest a Play install — the same class of install will not obtain Play Integrity **App Check** tokens.

## Debug versus release

| Build | Provider | Debug token |
| --- | --- | --- |
| Local emulator / Expo Go | Not a store attestation path. Expo Go cannot load RNFirebase App Check. | N/A; do not claim protection. |
| EAS `development` / `development-production-otp` | Debug provider only, if App Check is initialized at all | Console-registered debug tokens only. Never copy tokens into the register or git. |
| EAS `preview` internal APK | Play Integrity usually **fails** (not Play-distributed). Treat as debug or unenforced. | No production debug-token bypass. |
| EAS `production` AAB / Play install | Play Integrity / App Attest | Forbidden. `eas.json` must not gain `FIREBASE_APP_CHECK_DEBUG_TOKEN` on production. |

No production debug-token bypass. Do not leave the debug provider installed when an unsupported Apple provider string fails to match.

## Telemetry, staging, failure, rollback, old clients

1. **Monitor, do not enforce.** Console App Check metrics for Functions, Firestore, Storage until verified-token ratio is stable on a Play-installed candidate.
2. **Enforce Functions callables** only after both native identity and JS billing transports present tokens. Expected failure: `unauthenticated` / failed-precondition style callable errors; UI must already treat billing/auth failures as recoverable (no entitlement write).
3. **Enforce Firestore/Storage** only after JS App Check is proven; otherwise every record save/upload fails `permission-denied` despite a valid JS Auth uid.
4. **Auth App Check (preview)** last, after Phone Auth matrix on Play-installed Android and App Store iOS.
5. **Rollback:** Console enforcement off (product by product). Keep source able to run without tokens until old binaries are gone. No live Rules edit is authorized here.
6. **Old clients:** current source binaries have **zero** App Check tokens. Enforcement would fail-closed for every existing debug/sideload/internal APK. There is no Play-installed production fleet to grandfather yet (store listings empty). Any enforcement date must wait until a Play-distributed build that already sends tokens is the only supported client.

HTTP RTDN/ASSN paths stay on their existing authenticators. App Check does not monitor those.

## Test matrix (later, not run)

| Case | Prerequisite | Expect |
| --- | --- | --- |
| Monitor-mode Play-installed Android | REL-09 SHA-256, Play Integrity linked | Tokens accepted; Phone Auth still completes |
| Sideload preview APK | Unenforced | Play Integrity App Check token fetch fails; Phone Auth may use reCAPTCHA; app still usable |
| JS billing callable with only native App Check | Functions unenforced | Call succeeds today; would fail after Functions enforcement — proves dual-init requirement |
| Firestore save after JS bridge, no JS App Check | Storage/Firestore unenforced | Succeeds today; would fail after Rules `request.appCheck` |
| Debug provider in production profile | Forbidden | Must not be configurable |

## Unverified until Firebase / Play access (REL-09 / REL-10)

- Whether App Check is already registered or enforced in Console.
- Deployed Functions/Rules revision vs this repo.
- Play Integrity API linkage and Play App Signing vs upload SHA-256.
- Phone Auth SHA-1/SHA-256 registration (`check:firebase-client` currently warns `oauth_client` count 0 in google-services.json — hashes live in Console, not in that file).
- Live `PLAY_BILLING_ENABLED` / App Check interaction.
- iOS App Attest environment and Apple team setup.

This plan is not production protection.
