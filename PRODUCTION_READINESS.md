# Production Readiness — Auth & Identity Track

**Date:** 2026-06-04 (OTP wiring verified on disk 2026-06-08)  
**Status:** OTP client wiring complete in repo — requires EAS dev build + Firebase deploy + device QA

---

## Implementation checklist (completed in repo)

| Phase | Item | Status |
|-------|------|--------|
| 1 | `@react-native-firebase/auth` integration | ✅ Code |
| 1 | `nativePhoneAuth.ts` lazy loader | ✅ |
| 1 | `firebase.ts` OTP wired (`startOtp`, `confirmOtp`, `signOut`) | ✅ Verified in repo |
| 1 | Dev modes unchanged (mock `123456`) | ✅ |
| 1 | `eas.json` dev/production profiles | ✅ |
| 2 | `functions/` Cloud Functions project | ✅ |
| 2 | `resolveOrCreateUserByPhone` | ✅ |
| 2 | `startEmailVerification` / `verifyAndBindEmail` | ✅ (provider TBD) |
| 2 | `retireIdentity` / `completeAccountDeletion` | ✅ |
| 2 | `scheduledDeletionCleanup` | ✅ |
| 2 | Client `identityCallable.ts` | ✅ |
| 3 | `firestore.rules` — index collections blocked | ✅ |
| 3 | `retiredPhones` / `pendingEmailVerifications` server-owned | ✅ |
| 4 | Legal URL defaults → `vyaamikk.specialsoftwares.in` | ✅ |
| 4 | `.env.example` updated | ✅ |

---

## 1. Production OTP status

- **Before:** `startOtp` / `confirmOtp` threw `auth_not_configured` (imports existed but methods were stubs).
- **Now (verified in `firebase.ts`):**
  - `startOtp` → `startNativePhoneOtp(phoneE164)`
  - `confirmOtp` → `confirmNativePhoneOtp` → `callResolveOrCreateUserByPhone` when `useIdentityCallables()` is true; otherwise throws `Identity callables not available.`
  - `signOut` → JS Firebase sign-out, then `signOutNativePhoneAuth()`
- **Expo Go:** Still cannot test real OTP (native module not linked). Use EAS dev build.

## 2. Native Firebase Auth integration

| Package | Purpose |
|---------|---------|
| `@react-native-firebase/app` | Native Firebase app |
| `@react-native-firebase/auth` | Phone OTP |
| `@react-native-firebase/functions` | Callable identity (shares native auth token) |
| `expo-build-properties` | iOS `useFrameworks: static` |

See `docs/NATIVE_FIREBASE_SETUP.md`.

## 3. Real-device test result

**Not executed in this session** — requires:

1. `google-services.json` + `GoogleService-Info.plist` on build machine.
2. `eas build --profile development`.
3. Physical device + Firebase Phone Auth enabled.
4. `firebase deploy --only functions,firestore:rules`.

## 4. Cloud Functions implemented

| Function | File |
|----------|------|
| `resolveOrCreateUserByPhone` | `functions/src/identity/resolveOrCreateUserByPhone.ts` |
| `claimMobile` | alias of above |
| `startEmailVerification` | `functions/src/email/verification.ts` |
| `verifyAndBindEmail` | same |
| `changeVerifiedEmail` | alias |
| `retireIdentity` | `functions/src/deletion/lifecycle.ts` |
| `completeAccountDeletion` | same |
| `scheduledDeletionCleanup` | same (cron) |

## 5. Identity transaction model

- **Production:** Admin SDK transactions in Cloud Functions write `users/{uid}`, `phoneIndex`, `ueidIndex`, `emailIndex`.
- **Client:** Never writes index collections in `firebase-production` mode.
- **shared-dev:** Unchanged — mock OTP + client transactions + `firestore.rules.dev`.

## 6. Firestore rules changes

- `phoneIndex`, `ueidIndex`, `emailIndex`: client read/write **false** (unchanged).
- Added `retiredPhones`, `pendingEmailVerifications`: client read/write **false**.

## 7. Client auth service changes

| File | Change |
|------|--------|
| `src/services/auth/nativePhoneAuth.ts` | New — native OTP |
| `src/services/auth/identityCallable.ts` | New — CF client |
| `src/services/auth/firebase.ts` | `startOtp` / `confirmOtp` / `signOut` wired to native helpers + CF resolve; skip client emailIndex in prod |
| `src/services/auth/emailVerificationService.ts` | Calls `startEmailVerification` CF |

## 8. Dev / shared-dev behaviour preserved

| Mode | OTP | Identity writes |
|------|-----|-----------------|
| `local-mock` | `123456` | AsyncStorage registry |
| `firebase-shared-dev` | `123456` | Client Firestore txn + dev rules |
| `firebase-production` | Real SMS | Cloud Functions only |

## 9. Legal URL status

Defaults now point to `https://vyaamikk.specialsoftwares.in/{privacy,terms,delete-account,legal}` and `support@specialsoftwares.in`.

**Counsel review** of hosted page content is still required before store submission.

## 10. Remaining blockers

1. **Device QA** — real OTP on iOS/Android dev build not run here.
2. **Firebase deploy** — Functions + production rules must be deployed to live project.
3. **Native config files** — `google-services.json` / `GoogleService-Info.plist` required for builds.
4. **Email delivery provider** — `verifyAndBindEmail` rejects non-emulator codes until SendGrid/etc. wired.
5. **Hosted legal pages** — URLs set in config; pages must exist and be reviewed.
6. **Account deletion E2E** — validate grace → `completeAccountDeletion` on device after deploy.

## 11. Commands to run

```bash
npm install
npm run typecheck
npm run test:identity-mobile
npm run test:identity-email
npm run test:native-phone-auth
npm run functions:build

# Deploy (requires Firebase CLI login + project)
firebase deploy --only functions,firestore:rules

# Device build
eas build --profile development --platform ios
```

## 12. Files changed (this track)

- `src/services/auth/nativePhoneAuth.ts` (new)
- `src/services/auth/identityCallable.ts` (new)
- `src/services/auth/firebase.ts`
- `src/services/auth/emailVerificationService.ts`
- `src/types/react-native-firebase.d.ts` (new)
- `src/config/env.ts`
- `app.json`, `package.json`, `eas.json` (new)
- `firebase.json` (new), `firestore.indexes.json` (new)
- `firestore.rules`
- `functions/**` (new)
- `.env.example`
- `docs/NATIVE_FIREBASE_SETUP.md` (new)
- `PRODUCTION_READINESS.md` (this file)

---

**Store-readiness:** NOT claimed until real-device OTP + deployed Functions + hosted legal pages are verified.

---

## Final pre-build corrections (2026-06-08)

| Item | Status |
|------|--------|
| Human-readable PDF export filenames (`src/services/pdf/pdfFileNames.ts`) | ✅ Wired on diary, CPV, PO, letterhead, Dukaan, pro-pack exports |
| Cash Paid denomination / bank-note bifurcation removed | ✅ UI, validation, export, PDF Mode B |
| Dev placeholder banners hidden in production UI | ✅ Mock OTP banner dev-only; backend banner removed; dev reset `__DEV__`-only |
| Deletion-mode reactivation hardened | ✅ `resolveOrCreateUserByPhone` returns `deletion_pending`; `startAccountReactivation` + `completeAccountReactivation` callables; Firestore rules block client status changes |
