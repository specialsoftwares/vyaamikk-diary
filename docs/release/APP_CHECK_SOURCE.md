# App Check source integration (unenforced)

Implemented on the isolated combined candidate. **No Console enforcement, no callable `enforceAppCheck: true`, no Rules `request.appCheck` (that field does not exist).**

## Dual SDK

| SDK | Init | Token coverage |
| --- | --- | --- |
| `@react-native-firebase/app-check@^24.1.0` | Bounded `initializeAppCheck` after native default app is present (Android Play Integrity, iOS App Attest + DeviceCheck fallback). Optional `getToken` is a detached diagnostic and is **not** copied into JS. | Native Phone Auth / native Functions only, once a store binary exists |
| `firebase/app-check` (JS `firebase@^12`) | Module + CustomProvider/`initializeAppCheck` **API probe only** | **Not initialized** — JS appId is the web app, not the native Android/iOS app |

## App-identity constraint (implementation boundary, not a universal impossibility proof)

`evaluateNativeToJsCustomProvider` records whether a native token string is present, whether the JS and native app IDs are both non-empty and equal (`appIdentityCompatible`), and always returns `acceptedAsDualSdkCoverage: false`.

That boolean is the **current candidate's decision**: JS `initializeAppCheck` is not called, so a native token is not dual-SDK coverage. A helper hardcoded to `false` is not proof that every native-to-JS bridge is impossible in every product. Production bootstrap **does not** pass `mocked-native-app-check-token`.

Evidence used in source tests (injected SDK/port, not a live Play binary):

- JS `CustomProvider` and `initializeAppCheck` APIs are present on firebase@12
- `initializeAppCheck` is **not** called on the JS app
- Native iOS reports `appAttest`, never `playIntegrity`
- Native Android reports `playIntegrity`
- Injected tests use distinct JS (web) and native app IDs; copying `getToken` would not bind JS Firestore/Functions to the native app when those IDs differ

A later independently attested JS provider (for example reCAPTCHA / Enterprise on a **web** appId) is not an implemented, supported React Native JS runtime path in this candidate. Do not treat browser reCAPTCHA as proven for RN JS without that path and evidence. Do not use production debug tokens. Do not weaken live Play Integrity `NO_INTEGRITY` merely to obtain tokens.

## Ordering and observability

Startup: native Firebase probe → JS `getFirebaseApp()` → `initializeAppCheckLayer`, which awaits **bounded native provider initialize only**. Optional `getToken(false)` runs detached after routing is unblocked. Boot does **not** call `getToken(true)`. An explicit `probeNativeAppCheckTokens({ forceRefresh: true })` / `runAppCheckForceRefreshProbe` path exists for diagnostics.

The init report is stored (`getLastAppCheckInitReport`). Late diagnostics cannot replace a newer attempt. Init budget timeout marks native `failed` without waiting forever; hanging initialize is detached. Failures do not crash startup while enforcement is off. Production config/DB failures remain fail-closed.

Production `evaluateProductionConfig` refuses `EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` and `FIREBASE_APP_CHECK_DEBUG_TOKEN`. `eas.json` production/preview must not gain those keys.

## Later enforcement (not authorized)

1. Monitor Console metrics on a Play-installed binary  
2. Deploy callable `enforceAppCheck` per function  
3. Console Firestore/Storage/Auth toggles  
4. Auth App Check preview last, after Phone Auth retest  

Phone Auth Play Integrity for SMS is separate. Native attestation needs a later suitable binary/device; source tests cannot close it.
