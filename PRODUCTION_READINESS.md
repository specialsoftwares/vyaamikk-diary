# Production Readiness — Auth & Identity Track

**Date:** 2026-06-04 (OTP wiring verified on disk 2026-06-08) · **Hardened Firestore rules live:** 2026-07-15 ~02:02 IST (UTC+5:30)  
**Status:** OTP client wiring complete in repo — hardened Firestore rules (`9c4369a`) + client compatibility (`11503ce`) deployed to `vyaamikk-diary`; requires EAS dev build + remaining Firebase deploys + device QA

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
| 3 | `firestore.rules` — hardened production rules (`9c4369a`) | ✅ Live on `vyaamikk-diary` 2026-07-15 ~02:02 IST |
| 3 | Client profile patch compatibility (`11503ce`) | ✅ In repo — server email bind + minimal merge writes |
| 3 | `retiredPhones` / `pendingEmailVerifications` server-owned | ✅ |
| 4 | Legal URL defaults → `vyaamikk.specialsoftwares.com` | ✅ |
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

### Hardened production rules deployment (2026-07-15 ~02:02 IST)

| Field | Value |
|-------|-------|
| **Project ID** | `vyaamikk-diary` |
| **Rules commit** | `9c4369a` — Security: harden production Firestore access rules |
| **Client compatibility commit** | `11503ce` — Fix: route email identity writes through server (in app repo; not part of rules deploy) |
| **Deploy time** | 2026-07-15 ~02:02 IST (UTC+5:30) |
| **Deploy account** | `support.vyd@specialsoftwares.com` |
| **Deploy scope** | Firestore rules only (`firebase deploy --only firestore:rules`) — no Functions, Storage, Hosting, or indexes |
| **Pre-deploy tests** | ✅ All **25** `npm run test:firestore-rules` checks passed |
| **Compile + release** | ✅ Rules compiled and released successfully |
| **No test-mode expiry** | ✅ `firestore.rules` contains no `request.time < timestamp.date(...)` |
| **No public wildcard** | ✅ `firestore.rules` contains no `allow read, write: if true` (permissive rules remain in `firestore.rules.dev` only) |
| **Firebase Console timestamp** | ✅ **Verified** — newest Rules revision matches this deployment (Firebase Console → Firestore Database → Rules) |

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

Defaults now point to `https://vyaamikk.specialsoftwares.com/{privacy,terms,support,contact,delete-account,download}` and `support.vyd@specialsoftwares.com`.

**Counsel review** of hosted page content is still required before store submission.

## 10. Remaining blockers

| Blocker | Status |
|---------|--------|
| Hardened Firestore rules (`9c4369a`) live in production | ✅ Complete — deployed 2026-07-15 ~02:02 IST |
| Client rules compatibility (`11503ce`) | ✅ Complete — in repo; server email bind + patch-only writes |
| Production smoke testing | ❌ Not complete |
| Expo Go environment isolation | ✅ Complete (`3bc2e2e`) |
| Native OTP verification on device | ❌ Not complete |
| App Check | ❌ Not installed |
| Storage rules verification / deploy | ❌ Not complete |
| Fable runtime pass | ✅ Implemented — native device verification pending |
| Device QA — real OTP on iOS/Android dev build | ❌ Not run |
| Firebase deploy — Functions | ❌ Still required |
| Native config files — `google-services.json` / `GoogleService-Info.plist` | ❌ Required for builds |
| Email delivery provider — `verifyAndBindEmail` non-emulator codes | ❌ Until SendGrid/etc. wired |
| Hosted legal pages — counsel review | ❌ Required before store submission |
| Marketing/legal website (Lovable) | ✅ **Published** at `https://vyaamikk.specialsoftwares.com` — see `docs/WEBSITE_STORE_INTEGRATION.md` |
| Public website DNS / publication | ✅ Complete |
| Final canonical domain | ✅ `https://vyaamikk.specialsoftwares.com` |
| App Store / Play Store live listing URLs | ❌ Empty by design until listings exist |
| LLPIN / registered office / Grievance Officer | ❌ Pending counsel |
| OG image / CSP / HSTS / Data Safety alignment | ❌ Pending website hardening |
| Account deletion E2E on device | ❌ Validate after Functions deploy |

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

---

## Re-initialization audit (2026-07-14)

Full report: `docs/PRELAUNCH_HARDENING_REPORT.md`. Architecture:
`docs/REINITIALIZATION_ARCHITECTURE_MAP.md`. Device QA: `docs/PRELAUNCH_DEVICE_QA.md`.

### New P0 found and fixed in repo: JS-SDK auth bridge

The production OTP session lives only in `@react-native-firebase/auth`, but
Firestore/Storage run on the firebase JS SDK, which was **never signed in** — so in
a production build every direct record write (customer credit, PO, letterhead,
professional pack, diary sync) and every Storage upload was `request.auth == null`
→ permission-denied. Boot revalidation also read the client-forbidden `phoneIndex`,
which would have signed users out on every relaunch.

Fixed:

- `functions/src/identity/mintClientAuthToken.ts` — new callable (asia-south1),
  mints a custom token for the native uid.
- `src/services/auth/jsAuthBridge.ts` — `ensureJsAuthSession()` signs the JS SDK in
  via `signInWithCustomToken`; verified uid match; single-flight; never throws.
- `src/config/firebase.ts` — JS auth uses AsyncStorage persistence on native.
- Wired at OTP confirm, boot revalidation (now reads own `users/{uid}` instead of
  `phoneIndex`), `updateProfile`, `finishReactivation`.
- Boot revalidation now keeps the cached session on transient failure and only
  signs out on a confirmed missing/blocked profile.

**Deployment prerequisites:**

1. ~~`firebase login --reauth`~~ ✅ (2026-07-15)
2. ~~`firebase deploy --only firestore:rules --project vyaamikk-diary`~~ ✅ (2026-07-15 ~02:02 IST — hardened rules `9c4369a`; 25 emulator tests passed; account `support.vyd@specialsoftwares.com`)
3. ~~Client compatibility (`11503ce`)~~ ✅ — server email bind + minimal profile merge writes
4. ~~Firebase Console → Firestore → Rules → published timestamp~~ ✅ Verified 2026-07-15
5. `firebase deploy --only storage --project vyaamikk-diary`
6. `firebase deploy --only functions --project vyaamikk-diary`
7. Grant the functions runtime service account **Service Account Token Creator**
   (required by `createCustomToken`).

### Other corrections (2026-07-14)

| Item | Status |
|------|--------|
| `app.json`: duplicate location permissions + unused `RECORD_AUDIO` removed; `expo-image-picker` `microphonePermission: false` | ✅ |
| Accidental `// loading={busy}` on Dukaan PDF button reverted | ✅ |
| Test matrix: typecheck + functions build + 32 tsx suites | ✅ all pass |
| `npm run lint` | ⚠ alias for typecheck only — no ESLint pass exists |
| Grievance officer name / registered address in `src/config/legal.ts` | ❌ still placeholders — owner input required before store submission |
| i18n | ⚠ hi missing 67 keys (consent/materialMovement/workTeam); ta/te/gu missing 22 (English fallback works) |
| App Check / crash reporting | ❌ not installed (P2, post-candidate) |

---

## 2026-07-16 — Core runtime stabilization (verified in repo)

Full evidence: `docs/CORE_RUNTIME_STABILIZATION_AUDIT.md`. Manual device steps: `docs/CORE_MANUAL_QA_MATRIX.md`.

| Item | Status |
|------|--------|
| Stable root providers (`4a1a529`) | ✅ Preserved — always LocalDb→Auth→Sync |
| Language / touch-trap (`bfc2968`) | ✅ Preserved — no I18n remount |
| Public origin + link validation (`0b12fb4`, `900c46e`, `4d04786`) | ✅ Preserved |
| Session sync lock cleared on auth identity transition | ✅ Fixed in repo — `syncLockIdentityPolicy` + SyncProvider |
| Mailto opener fail-soft | ✅ Fixed in repo — `openSafeMailto` |
| Automated regression batch (providers, links, language, consent, sync-lock, mailto, save-idempotency, reactivation, env, typecheck) | ✅ Pass |
| Device OTP / deletion / dual-device sync QA | ❌ Not executed this pass — matrix pending |
| `expo-doctor` dependency skew | ⚠ Reported only — no version bump |
| Unstaged locale-loader (`i18n.ts`, `validateLocales.ts`) | ⚠ Left uncommitted; not part of readiness claim |
