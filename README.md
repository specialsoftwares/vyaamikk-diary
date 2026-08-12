# Vyaamikk Diary

**Repository:** [github.com/specialsoftwares/vyaamikk-diary](https://github.com/specialsoftwares/vyaamikk-diary)

**by SPECIAL SOFTWARES** · Legally operated by Ananya Engineered Industrial Components & Pay Systems LLP

> **All your business needs, in one place.** · We support your business.

Independent business diary product (not coupled to Vyaamikk Samadhaan backends). Auth v2 journey: Phone → OTP → Email OTP / linking → Complete Profile → Profile Review → UEID → Onboarding → Location → You dashboard.

Canonical readiness status for this stabilization pass: [`STABILIZATION_AND_RELEASE_READINESS.md`](./STABILIZATION_AND_RELEASE_READINESS.md).

---

## Stack (current)

| Concern | Choice |
|---|---|
| Framework | Expo SDK **54** + React Native **0.81.5** (managed EAS; no checked-in `ios/` / `android/`) |
| Navigation | Expo Router 6 (file-based under `app/`) |
| Language | TypeScript (strict) |
| Auth (production) | `@react-native-firebase/auth` phone OTP + Cloud Functions email OTP (Resend server-side) |
| Auth (Expo Go) | Local-mock OTP `000000` only (never in preview/store) |
| Data | Owner-scoped Firestore `users/{uid}/…` (production) · AsyncStorage/SQLite (local-mock) |
| Session | `expo-secure-store` + Auth SDK |

---

## Canonical environments & builds

| Goal | How | Backend | OTP |
|---|---|---|---|
| Mock UI / Expo Go | `npm run start:expo-go` | `local-mock` | `000000` (not shown in UI) |
| Native Firebase phone OTP (dev client + Metro) | Install EAS `development` or `development-production-otp` APK, then `npm run start:prod-dev-client` | `firebase-production` | Real SMS |
| Standalone internal APK (no Metro) | `eas build --profile preview` | `firebase-production` or fail-closed | Real SMS / Functions — **never** mock |
| Play-oriented AAB | `eas build --profile production` | `firebase-production` or fail-closed | Real SMS / Functions |

**Important distinctions**

- A **development-client** APK shows the Expo Dev Client launcher and needs Metro. EAS profiles `development` and `development-production-otp` both bake `EXPO_PUBLIC_APP_MODE=production` so runtime isolation accepts them.
- A **preview** APK is a release-style standalone binary (`distribution: "internal"` → APK). It opens the app directly. It must never use local-mock OTP. Explicit `android.buildType: "apk"` is **not** required for internal distribution to produce an APK.
- Starting a development client with `EXPO_PUBLIC_APP_MODE=development` is **rejected** by runtime isolation — use `npm run start:prod-dev-client`.
- Local `.env` must set `EXPO_PUBLIC_APP_MODE=production` for development-client Metro. Expo’s client `expo/virtual/env` merges `.env*` **over** shell `process.env`, so a shell-only override is not enough.
- There is **no** staging Firebase profile in this repo until the owner supplies a real staging project and approves a clearly named EAS profile.

```bash
cp .env.example .env   # fill EXPO_PUBLIC_FIREBASE_* for production-auth paths
npm install
npm run start:expo-go              # mock UI
npm run start:prod-dev-client      # after installing a development-client APK
npm run android:live               # emulator + Metro + open existing dev client
npm run check:firebase-client      # native google-services vs JS EXPO_PUBLIC_* (no secret dump)
# Standalone beta APK (after Firebase Phone Auth + Functions/rules are live):
# npx eas-cli@latest build --profile preview --platform android
```

Acceptance checklist for the standalone APK: [`docs/BETA_PREVIEW_ANDROID_ACCEPTANCE_SHEET.md`](./docs/BETA_PREVIEW_ANDROID_ACCEPTANCE_SHEET.md).

---

## Validation (local)

```bash
npm run typecheck
npm run lint                 # typecheck + correctness ESLint gate (scoped)
npm run test:env-resolution
npm run test:production-mock-otp-isolation
npm run test:wizard-nav-race
npm run test:save-idempotency
npm run test:save-hardening
npm run test:auth-policy-matrix
npm run test:local-mock-mobile-otp
npm run test:local-mock-email-otp
npm run test:native-phone-auth
npm run test:customer-credit-save
npm run test:letterhead-pdf
npm run test:cooling-off
npm run test:storage-paths
npm run test:local-business-date
npm run functions:build
npx expo-doctor              # expect 18/18
```

`npm run audit:records` remains **dry-run** and refuses production. It never auto-repairs.

Firestore rules emulator (when Java + Firebase tooling available):

```bash
npm run test:firestore-rules
```

---

## Product journey (Auth v2)

Phone → OTP → Email OTP / email linking → Complete Profile → Profile Review → UEID (Vyaamikk ID) → Onboarding Introduction → Location Onboarding → You dashboard.

Primary tabs: You, Calendar, Saved Records (when retained), Settings. Wizard navigation is owned synchronously by `wizardNavigationController` (no awaited AsyncStorage before Back).

---

## Security boundaries (do not weaken)

- Standalone / preview / store / development-client: never silent local-mock fallback.
- Identity indexes (`phoneIndex`, `ueidIndex`, `emailIndex`, …) are **server-owned**.
- Letterhead Matter PDFs contain **no** Vyaamikk branding, UEID, or operator footer; diary link is ``${clientRecordId}_matter``.
- Purchase-order serial allocation occurs only after the idempotent existence check.
- Customer-credit payments dedupe on `clientPaymentId`.
- Device integrity probe is **dormant** and not wired into login until an approved SDK is configured.
- Android background location remains disabled.

External operations (SMS fingerprints, Resend DNS, Functions/rules deploy, App Check console enforcement, store credentials) are **not** completed merely because source exists — see the readiness report.

---

## Docs map

| Document | Role |
|---|---|
| [`STABILIZATION_AND_RELEASE_READINESS.md`](./STABILIZATION_AND_RELEASE_READINESS.md) | Authoritative stabilization / channel readiness report |
| [`MASTER_AUTH_ONBOARDING_EXECUTION_TRACKER.md`](./MASTER_AUTH_ONBOARDING_EXECUTION_TRACKER.md) | Auth/onboarding execution tracker |
| [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md) | Historical auth-track notes — superseded for channel readiness by the report above |
| [`.env.example`](./.env.example) | Environment semantics |

---

## Roadmap (explicitly out of product scope)

Roles/connections, DMs, org graph, payroll, attendance, continuous geo-tracking, KYC, marketplace, Samadhaan coupling. Architecture may stay migration-friendly without importing those contracts.
