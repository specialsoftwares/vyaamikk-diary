# App Check source integration (unenforced)

Implemented on the isolated combined candidate. **No Console enforcement, no callable `enforceAppCheck: true`, no Rules `request.appCheck` (that field does not exist).**

## Dual SDK

| SDK | Init | Token coverage |
| --- | --- | --- |
| `@react-native-firebase/app-check@^24.1.0` | Attempted after native default app is present (Android Play Integrity, iOS App Attest + DeviceCheck fallback). Optional `getToken` is probed and **not** copied into JS. | Native Phone Auth / native Functions only, once a store binary exists |
| `firebase/app-check` (JS `firebase@^12`) | Module + CustomProvider/`initializeAppCheck` **API probe only** | **Not initialized** — JS appId is the web app, not the native Android/iOS app |

## App-identity constraint (not a mock failed-proof)

`evaluateNativeToJsCustomProvider` records that a native token string is present or absent, then returns `acceptedAsDualSdkCoverage: false`. Production bootstrap **does not** pass `mocked-native-app-check-token`.

Evidence used in source tests (injected SDK/port, not a live Play binary):

- JS `CustomProvider` and `initializeAppCheck` APIs are present on firebase@12
- `initializeAppCheck` is **not** called on the JS app
- Native iOS reports `appAttest`, never `playIntegrity`
- Native Android reports `playIntegrity`
- JS `app.options.appId` (web) is distinct from the native app id; copying `getToken` does not bind JS Firestore/Functions to the native app

Viable later path: independently attested JS provider (reCAPTCHA / Enterprise) on the web appId, plus native Play Integrity on the Android app — still two tokens. Do not use production debug tokens. Do not weaken live Play Integrity `NO_INTEGRITY` merely to obtain tokens.

## Ordering and observability

Startup: native Firebase probe → JS `getFirebaseApp()` → `initializeAppCheckLayer`. Native init probes `getToken(false)` then `getToken(true)` (force-refresh) and does not copy either string into JS. The report is stored (`getLastAppCheckInitReport`) and retained by the coordinator. Failures do not crash startup while enforcement is off.

Production `evaluateProductionConfig` refuses `EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` and `FIREBASE_APP_CHECK_DEBUG_TOKEN`. `eas.json` production/preview must not gain those keys.

## Later enforcement (not authorized)

1. Monitor Console metrics on a Play-installed binary  
2. Deploy callable `enforceAppCheck` per function  
3. Console Firestore/Storage/Auth toggles  
4. Auth App Check preview last, after Phone Auth retest  

Phone Auth Play Integrity for SMS is separate. Native attestation needs a later suitable binary/device; source tests cannot close it.
