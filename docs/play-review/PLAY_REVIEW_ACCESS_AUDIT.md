# PLAY REVIEW ACCESS AUDIT — Vyaamikk Diary

**Date:** 2026-07-21  
**App ID:** `com.specialsoftwares.vyaamikkdiary`  
**Firebase project:** `vyaamikk-diary`  
**HEAD at audit:** current workspace (post-`6f397d3` + local uncommitted play-review helpers)  
**Nature:** Repository readiness for Google Play reviewer access via Firebase **fictional test phone numbers**. Not a Play Console completion certificate.

**Layers (do not conflate):**

1. **Repository / app** — inspected here; minimal contract tests added.  
2. **Firebase Console** — owner configures fictional phone + fixed code (external).  
3. **Play Console Sign-in details** — owner pastes placeholders (external).

**No real credentials in this document. No deploy / push / Console automation.**

---

## 1. Compatibility verdict

| Question | Answer |
|----------|--------|
| Compatible with Firebase fictional test numbers? | **Yes**, if the number is a valid **Indian** E.164 (`+91` + 10 digits starting 6–9) and the build is a **production-like** EAS/store binary (not Expo Go mock). |
| Hardcoded OTP in repo? | **No** for production path. Mock `123456` exists only for `local-mock` / `shared-dev`. |
| Special reviewer backdoor? | **None found / none added.** |
| App device PIN? | **Not implemented** — no app-lock PIN in current codebase. |
| Prepared account required? | **Yes** — email step + profile/onboarding gates for new numbers. |

---

## 2. Production vs mock isolation (CODE VERIFIED)

| Runtime | Backend | OTP |
|---------|---------|-----|
| Expo Go | Forced development / local-mock | Mock `123456` (`shared-dev` / mock services) |
| Development client with production mode | `firebase-production` | Native `@react-native-firebase/auth` |
| Store / standalone production | `firebase-production` | Native phone auth + identity callables |

Evidence: `src/config/runtimeEnvironment.ts`, `src/services/auth/index.ts`, `src/services/auth/nativePhoneAuth.ts`, `src/services/auth/firebase.ts`.

Play review **must** use a genuine Android release/internal-testing build wired to `vyaamikk-diary`, **not** Expo Go.

---

## 3. Phone formatting contract (CODE VERIFIED)

| Rule | Evidence |
|------|----------|
| UI country code fixed `+91` | `DEFAULT_AUTH_V2_COUNTRY_CODE`, `PhoneEntryScreen` |
| Local: exactly 10 digits, start `6–9` | `isValidIndianLocalMobile` |
| E.164 = `+91` + local | `toE164FromDraft` / `normalizeIndianMobile` |
| Server `phoneIndex` key | `normalizePhoneE164` (preserves `+…`) |
| US-style Firebase sample numbers (`+1 650…`) | **Rejected by UI** — do not use for this app |

Regression: `npm run test:play-review-phone` (`playReviewPhoneContract.ts`).

**Owner implication:** In Firebase → Phone numbers for testing, register a **fictional Indian** number that passes the UI rules (placeholder only in docs).

---

## 4. End-to-end state map (reviewer path)

| State | Source | Expected | Blockers | Reviewer without owner? |
|-------|--------|----------|----------|-------------------------|
| Clean install | Boot | Auth entry `/(auth)/v2` | DB ready | Yes |
| Country + phone | `PhoneEntryScreen` | Valid IN local | Offline / invalid | Yes |
| Legal consent | `LegalConsentCheckboxes` | Terms+Privacy | Must tick | Yes |
| Send OTP | `startNativePhoneOtp` → Firebase | Challenge | Native module; rate limits | Yes if Firebase test number configured |
| Enter fixed code | `OtpVerificationScreen` → `confirmNativePhoneOtp` | Auth UID | Wrong code | Yes with Console fixed code |
| Identity bridge | `callResolveOrCreateUserByPhone` | UEID + profile | Functions deploy; Auth | Yes after Auth success — **no SMS dependency** |
| JS Auth bridge | `ensureJsAuthSession` | Firestore rules auth | mint token Function | Yes if Functions healthy |
| Email gate (new) | `AuthFlowGate` email step | Must set business email | Production email verify | **Blocked unless pre-onboarded** |
| Complete profile | `/(auth)/complete-profile` | `profileCompletedAt` | display name required | **Pre-onboard** |
| UEID release | `/(auth)/ueid` | `ueidReleasedAt` | — | Pre-onboard |
| Intro | `onboarding-intro` | `onboardingIntroSeenAt` | — | Pre-onboard |
| Location onboarding | `location-onboarding` | consent shown flag | Optional GPS later | Pre-onboard or Not Now |
| Main app | `/(app)/(tabs)/you` | Dashboard | Sync/DB | Yes if prepared |
| Logout / relogin | Auth signOut + OTP | Same account | Firebase test code reusable | Yes |
| Reinstall | Clean + OTP | Cloud restore | Same Firebase number | Yes; no app PIN |
| Wrong OTP | confirm fails | Error banner | — | Yes |
| Pending deletion | `account_pending_deletion` | Blocked screen | — | Use non-pending review account |
| Deleted / retired phone | Auth / index | Reject / new empty account | — | Keep review number active |
| App PIN | — | **N/A** | — | N/A |

---

## 5. Mandatory pre-submission account preparation

For a **new** Firebase test number, the app will force:

1. Terms / Privacy checkboxes  
2. OTP (fictional)  
3. **Business email** entry (+ production verification code flow if `requiresServerEmailBinding`)  
4. Complete profile (display name; optional business fields)  
5. UEID screen  
6. Onboarding intro  
7. Location onboarding (consent shown; permission optional)

**Owner must complete all of these once** on a production-like build before Play submission so reviewers land on the main app after OTP.

Placeholders (never commit real values):

- `[REVIEW PHONE E.164 — DO NOT COMMIT]` — must match India UI rules  
- `[REVIEW OTP CODE — DO NOT COMMIT]` — Firebase fixed code  
- `[REVIEW ACCOUNT EMAIL — DO NOT COMMIT]` — linked before submission  

---

## 6. App PIN

**Not present** in the repository (no device passcode / app-lock module found).  
Play Sign-in details should **omit** an app PIN unless a future build adds one. Do not invent a universal PIN.

---

## 7. Reviewer feature matrix (material access)

| Area | Accessible after prepared login? | Notes |
|------|----------------------------------|-------|
| Dashboard / You | Yes | |
| New Record / composer | Yes | Seed demo data beforehand |
| History / saved | Yes | |
| PDF generate | Yes | Optional share sheet |
| Calendar | Yes | |
| Reminders | Optional notif permission | Decline OK |
| Language | Yes | |
| Profile / identity | Yes | Warn: do not change phone/email |
| Settings / Privacy / Terms / Support | Yes | HTTPS / mailto |
| Delete Account screen | Yes (inspect only) | **Do not confirm DELETE** |
| Location | Optional | Decline OK |
| Offline | Partial | Local DB when signed in |

---

## 8. Security boundaries

| Store credentials in | Allowed? |
|----------------------|----------|
| Firebase Console test phones | Yes (owner) |
| Play Console Sign-in details | Yes (owner) |
| Git / docs / `.env` / Cursor chat | **No** |
| App binary / hardcoded OTP | **No** |

Post-review: rotate Firebase test number/code; remove from Play Sign-in details when appropriate (`PLAY_REVIEW_CREDENTIAL_ROTATION_CHECKLIST.md`).

---

## 9. Code changes in this pass

| Change | Why |
|--------|-----|
| `src/auth-v2/playReviewPhoneContract.ts` + test | Document/test India E.164 review contract; reject US sample numbers |
| `package.json` `test:play-review-phone` | Runnable regression |

**No auth behaviour change** for normal users. No backdoor.

---

## 10. Tests run

```
npm run test:play-review-phone   # ok
npm run test:auth-wrapper        # ok
npm run test:native-phone-auth   # ok
npm run test:js-auth-bridge      # ok
npm run test:env-resolution      # ok
npm run test:root-providers      # ok
npm run test:sync-lock-identity  # ok
npm run test:reactivation-routing # ok
npm run typecheck                # ok
npx expo-doctor                  # 17/18; version skew only (not upgraded)
```

---

## 11. Remaining owner actions

1. Firebase: add Indian fictional test phone + fixed code (runbook).  
2. Prepare onboarded account on production-like Android build.  
3. Seed harmless demo dataset.  
4. Play Console Sign-in details (template).  
5. Manual QA matrix on clean install.  
6. Confirm account not pending deletion / not retired.

**Repository status:** Ready for owner Firebase + Play configuration **after** prepared account exists.  
**Play Sign-in details:** Not complete until manual QA passes with those credentials.
