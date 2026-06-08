# Vyaamikk Diary

**by SPECIAL SOFTWARES**

A simple digital diary to record daily work, business activity, issues, production
notes, site updates and follow-ups. Built as an independent, mobile-first V1 with
its own clean identity system — the Vyaamikk ID (UEID).

> Positioning: *Record your daily work, business activity, issues and important notes in one simple diary.*

---

## Table of Contents

- [Stack](#stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [App modes](#app-modes-development-vs-production)
- [Vyaamikk ID (UEID) — Identity model](#vyaamikk-id-ueid--identity-model)
- [Golden flow](#golden-flow)
- [Security & privacy](#security--privacy)
- [Going to production](#going-to-production)
- [Roadmap (deferred features)](#roadmap-deferred-features)

---

## Stack

| Concern | Choice |
|---|---|
| Framework | Expo SDK 56 + React Native 0.85 (New Architecture) |
| Language | TypeScript (strict) |
| Navigation | Expo Router (file-based) |
| Forms | React Hook Form + Zod |
| Auth | Pluggable: mock (dev) or Firebase Auth (prod) |
| Data | Pluggable: AsyncStorage (dev) or Firestore (prod) |
| Session | `expo-secure-store` (native) / AsyncStorage (web) |
| Network status | `@react-native-community/netinfo` |

## Project structure

```
Vyaamikk Diary/                # workspace root (run `npm` commands here)
├── app/                       # Expo Router routes (file-based)
│   ├── _layout.tsx            # Root layout (providers, gesture root, splash)
│   ├── index.tsx              # Splash / Boot — resolves auth, picks route
│   ├── (auth)/                # Logged-out flow
│   │   ├── login.tsx          #   Mobile number + consent
│   │   ├── otp.tsx            #   OTP verification
│   │   └── ueid.tsx           #   Welcome + UEID created/fetched
│   └── (app)/                 # Logged-in flow
│       ├── dashboard.tsx
│       ├── profile.tsx
│       ├── diary/
│       │   ├── index.tsx      #   History (search + filter)
│       │   ├── new.tsx        #   Add entry (Save / Save & Share)
│       │   ├── [id].tsx       #   Entry detail (Edit / Share / Delete)
│       │   └── edit/[id].tsx  #   Edit entry
│       └── settings/
│           ├── index.tsx
│           ├── about.tsx
│           └── delete.tsx     #   Delete account request flow
│
├── src/
│   ├── components/
│   │   ├── ui/                # Buttons, Cards, TextField, Loader, …
│   │   └── diary/             # EntryRow, EntryForm, CategoryPicker
│   ├── config/
│   │   ├── env.ts             # Reads EXPO_PUBLIC_* env, derives mode
│   │   └── firebase.ts        # Lazy Firebase init + FirebaseNotConfiguredError
│   ├── domain/
│   │   ├── types.ts           # UserProfile, DiaryEntry, etc.
│   │   ├── categories.ts
│   │   └── errors.ts          # AppError + userFacingMessage
│   ├── services/
│   │   ├── auth/              # AuthService abstraction (+ mock + firebase)
│   │   ├── diary/             # DiaryRepository abstraction (+ mock + firebase)
│   │   └── session.ts         # SecureStore-backed session persistence
│   ├── state/
│   │   ├── auth.tsx           # AuthProvider + useAuth()
│   │   ├── network.ts         # useIsOnline()
│   │   └── useDiaryList.ts    # List + refresh hook
│   ├── theme/                 # colors, spacing, typography
│   └── utils/                 # phone, ueid, date, share, validation, logger
│
├── firestore.rules            # Production Firestore security rules
├── app.json                   # Expo config (scheme, plugins, bundle IDs)
├── .env.example               # Copy to .env and fill in for production
└── README.md
```

## Getting started

```bash
cd "Vyaamikk Diary"            # workspace root — where package.json lives
npm install --legacy-peer-deps # only needed once
cp .env.example .env           # (optional) leave EXPO_PUBLIC_APP_MODE=development
npm run start                  # press i / a / w for iOS / Android / Web
```

Out of the box the app runs in **development mode** — no Firebase project
needed. You can log in with any valid 10-digit Indian mobile number and the OTP
is **`123456`** (also surfaced in a small banner on the OTP screen for clarity).

## App modes: development vs production

Selected by `EXPO_PUBLIC_APP_MODE` in your `.env`:

| Mode | Auth | Storage | Behavior |
|---|---|---|---|
| `development` (default) | Mock OTP service (`123456`) | AsyncStorage | Stable UEID registry persists across reloads. Great for UI work & demos. |
| `production` | Firebase Auth (phone OTP) | Firestore | Requires all `EXPO_PUBLIC_FIREBASE_*` values + the native phone verifier (see below). |

Both modes go through the same `AuthService` / `DiaryRepository` interfaces.
Screens never touch the concrete adapter — switching modes is a config flag.

## Vyaamikk ID (UEID) — Identity model

The UEID is the **first identity registry of the SPECIAL SOFTWARES ecosystem**,
issued by Vyaamikk Diary. It is intentionally future-compatible so the same
mobile → UEID mapping can be migrated into Vyaamikk Samadhaan later **without
changing the user's ID**.

```
Format:   VYD-YYYY-XXXXXX
Example:  VYD-2026-8K4P9X
Alphabet: 23456789ABCDEFGHJKMNPQRSTUVWXYZ  (no 0/O, 1/I/L — ambiguity-free)
```

Rules enforced by the auth service:

- One verified mobile number ⇒ exactly one UEID, forever.
- UEIDs never change and are never re-issued.
- Returning users (same mobile) always get the **same** UEID back.
- UEIDs do not encode or reveal the mobile number.
- UEIDs are indexed server-side; the index is **not** publicly enumerable
  (`firestore.rules` denies all client reads on `phoneIndex` / `ueidIndex`).

The production implementation uses a Firestore transaction to:
1. Look up `phoneIndex/{phone}` — return existing user if present.
2. Otherwise: generate a candidate UEID, check `ueidIndex/{ueid}` for
   collision, retry up to 8 times, then atomically write:
   - `users/{uid}` (full profile),
   - `phoneIndex/{phone} → uid`,
   - `ueidIndex/{ueid} → uid`.

## Golden flow

```
Splash → Login → OTP → UEID screen → Dashboard
              ↘ (returning user goes straight to Dashboard)

Dashboard → Add Entry → Save / Save & Share → Entry Detail
         ↘ View Diary  → Search / Filter → Entry Detail → Edit / Share / Delete
         ↘ My Vyaamikk ID (Profile)
         ↘ Settings → About / Privacy / Terms / Delete Account / Logout
```

## Security & privacy

Implemented today:

- OTP codes are never logged in production (`utils/logger.ts` redacts `otp`,
  `code`, `verificationCode`).
- Mobile numbers are masked in logs (`+91 98••••3210`).
- Sessions live in `expo-secure-store` (Keychain / EncryptedSharedPreferences).
- No secrets are bundled — Firebase keys come from environment variables.
- Soft-delete is the default for both entries and accounts.
- Firestore rules restrict diary entries to their owner and lock down
  the identity indexes entirely (see `firestore.rules`).

Avoided (per V1 scope):

- No surveillance language, geo-tracking, attendance/payroll, KYC, or
  regulated-finance functionality.
- No marketing of legal compliance.
- No third-party SDKs beyond Firebase.

## Going to production

This V1 is intentionally a clean foundation. Before shipping to the stores:

1. **Wire native phone OTP.** The Firebase JS SDK doesn't ship a native phone
   verifier; install [`@react-native-firebase/auth`](https://rnfirebase.io/auth/phone-auth)
   (or your SMS provider) and fill in the two integration seams in
   `src/services/auth/firebase.ts`:
   - `startOtp` — call `verifyPhoneNumber`, return `{ verificationId, phoneE164, devCodeHint: null }`.
   - `confirmOtp` — build `PhoneAuthCredential`, `signInWithCredential`, then
     `resolveOrCreateUser(authUid, phoneE164)` (already implemented).
2. **Deploy `firestore.rules`** to your Firestore project.
3. **Move profile / phoneIndex / ueidIndex writes behind a Cloud Function**
   in strict-prod mode so clients can never tamper with the registry.
4. **Configure `.env`** with real Firebase keys and set
   `EXPO_PUBLIC_APP_MODE=production`.
5. **Replace branding placeholders**: app icon, splash image, adaptive icon
   layers in `app.json`, and the placeholder Privacy/Terms URLs.
6. **Privacy / Data deletion**: the app exposes a Delete Account request that
   marks the user + entries as deleted. Add a backend job that completes hard
   deletion after a grace period (App Store / Play Store both require a
   user-initiated deletion path).
7. **Build with EAS**: `eas build -p ios` / `eas build -p android` and submit.

## Roadmap (deferred features)

Out of scope for V1 (and explicitly **not** in this codebase, per product spec):
roles & connections, DMs, approvals, payroll, attendance, punch / geo-tracking,
CCTV, lending, marketplace, KYC, admin panel, AI features, multi-product
ecosystem screens. The architecture deliberately keeps the identity layer
extensible so these can be layered on later without rewriting screens.
