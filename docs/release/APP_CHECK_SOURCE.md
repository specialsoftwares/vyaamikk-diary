# App Check source integration (unenforced)

Implemented on the isolated combined candidate. **No Console enforcement, no callable `enforceAppCheck: true`, no Rules `request.appCheck` (that field does not exist).**

## Dual SDK

| SDK | Init | Token coverage |
| --- | --- | --- |
| `@react-native-firebase/app-check@^24.1.0` | Attempted after native default app is present | Native Phone Auth / native Functions only, once a store binary exists |
| `firebase/app-check` (JS `firebase@^12`) | Module import only | **Not initialized** — CustomProvider bridge failed proof |

## Failed CustomProvider proof

`attemptNativeToJsCustomProviderBridge({ nativeToken: "mocked-native-app-check-token" })` returns `mockedTokenReturned: true` and `acceptedAsDualSdkCoverage: false`.

A token string from native `getToken` copied into JS `CustomProvider.getToken` does not prove:

- JS appId / project binding
- refresh / expiry
- Firebase backend acceptance of that token on JS Firestore, Storage, or billing callables

Viable alternatives (later, not done): keep dual `initializeAppCheck` with independently attested providers; or a vendor-supported RN/JS shared provider if one is documented for this exact pair of versions. Do not use production debug tokens. Do not weaken live Play Integrity `NO_INTEGRITY` merely to obtain tokens.

## Ordering

Startup: native Firebase probe → JS `getFirebaseApp()` → `initializeAppCheckLayer` (native Play Integrity attempt, JS init skipped). Failures do not crash startup while enforcement is off.

Production `evaluateProductionConfig` refuses `EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` and `FIREBASE_APP_CHECK_DEBUG_TOKEN`. `eas.json` production/preview must not gain those keys.

## Later enforcement (not authorized)

1. Monitor Console metrics  
2. Deploy callable `enforceAppCheck` per function  
3. Console Firestore/Storage/Auth toggles  
4. Auth App Check preview last, after Phone Auth retest  

Phone Auth Play Integrity for SMS is separate. Native attestation needs a later suitable binary/device; source tests cannot close it.
