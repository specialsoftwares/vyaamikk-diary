# Native Firebase Auth — Dev / EAS Build Setup

Production phone OTP uses `@react-native-firebase/auth`. **Expo Go cannot send real SMS OTP.**

## Prerequisites

1. Firebase project with **Phone** sign-in enabled (Authentication → Sign-in method).
2. iOS: APNs key uploaded to Firebase (for silent verification fallback).
3. Android: SHA-1 + SHA-256 of your signing keystore added in Firebase Console.

## Native config files (do not commit secrets)

Download from Firebase Console → Project settings → Your apps:

| Platform | File | Path |
|----------|------|------|
| Android | `google-services.json` | `./google-services.json` |
| iOS | `GoogleService-Info.plist` | `./GoogleService-Info.plist` |

These paths are gitignored. Copy from Firebase before `eas build`.

## Build commands

```bash
# Install deps (after freeing disk space)
npm install

# Development client (internal testing with real OTP in production mode)
eas build --profile development --platform ios
eas build --profile development --platform android

# Production store build
EXPO_PUBLIC_APP_MODE=production eas build --profile production --platform all
```

## Deploy Cloud Functions (required for production login)

```bash
cd functions && npm install && npm run build
firebase deploy --only functions,firestore:rules
```

Region must match `EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION` (default `asia-south1`).

## Local emulator (optional)

```bash
# Terminal 1
cd functions && npm run serve

# Terminal 2 — set in .env
EXPO_PUBLIC_FUNCTIONS_EMULATOR_HOST=127.0.0.1:5001
```

## Verify on device

1. Set `EXPO_PUBLIC_APP_MODE=production` in EAS secrets / `.env`.
2. Install dev or preview build (not Expo Go).
3. Sign in with real mobile → receive SMS → confirm OTP.
4. New user reaches email / business identity onboarding.
5. Kill app → reopen → session persists via SecureStore.
