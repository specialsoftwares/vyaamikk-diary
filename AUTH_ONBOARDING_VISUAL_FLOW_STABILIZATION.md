# AUTH ONBOARDING VISUAL FLOW — STABILIZATION REPORT

**Date:** 2026-07-23  
**Repo:** `/Users/shivamsaurav/Vyaamikk Diary`  
**Branch:** `main`  
**Mode:** Narrow shared-application navigation stabilization (no broad UI rewrite).

---

## 1. Verdict

Proven shared-JavaScript races (review-intent AsyncStorage lag, competing mount-time `replace` owners, numeric progress flash) are corrected in application code.

| Item | Status |
|------|--------|
| In-memory sync review intent | **DONE** — `wizardNavigationController.ts` |
| Persistence secondary / non-blocking | **DONE** |
| Canonical navigation owner + priority | **DONE** |
| Constrained AuthFlowGate / boot / complete-profile / app-layout | **DONE** |
| Remove redundant mount-time forward replaces during review | **DONE** |
| Deduplicate nav + reject stale generations | **DONE** |
| Exactly one logical Back step | **DONE** — `logicalBackTarget` + sync mark-then-replace |
| Progress from visible logical step only | **DONE** — Account / Identity / Review (no “Step N of M”) |
| Race-focused integration tests | **DONE** — `npm run test:wizard-nav-race` |
| Expo Go verification (Fast Refresh off) | **RUN / PENDING device confirmation** |
| Development-build paired comparison | **NOT YET PROVEN** — explicitly pending |

---

## 2. Ownership model (decision priority)

Highest → lowest:

1. **Terminal restrictions** (signed out / account deletion) — outside controller  
2. **Final dashboard handoff** when onboarding fully complete  
3. **User-directed wizard** (`reviewPreviousStep` / active `continueForward` in memory)  
4. **Cold-start restore** from AsyncStorage (only when memory has no active session)  
5. **Incomplete-step / boot resolution** last  

Canonical owner: `src/auth/wizardNavigationController.ts`  
Secondary persistence: `src/auth/onboardingNavigationStore.ts` (never awaited on Back)  
Screen helpers: `src/auth/onboardingGuardPolicy.ts` (`markReviewing*` / `markContinuing*` are synchronous)

---

## 3. Files touched (stabilization)

- `src/auth/wizardNavigationController.ts` (new)
- `src/auth/wizardNavigationController.race.test.ts` (new)
- `src/auth/onboardingGuardPolicy.ts`
- `src/auth/onboardingNavigationStore.ts`
- `src/auth/onboardingWizard.ts` (+ test)
- `src/auth-v2/components/WizardProgress.tsx`
- `src/auth-v2/AuthFlowGate.tsx`
- `src/auth-v2/screens/BusinessIdentityScreen.tsx`
- `src/auth-v2/screens/ProfileReviewScreen.tsx`
- `src/auth-v2/screens/UeidReleaseOnboardingScreen.tsx`
- `app/(auth)/complete-profile.tsx`
- `app/(auth)/profile-review.tsx`
- `app/(auth)/ueid.tsx`
- `app/(auth)/onboarding-intro.tsx`
- `app/(auth)/location-onboarding.tsx`
- `app/(app)/_layout.tsx`
- `package.json` (`test:wizard-nav-race`)

Protected / not staged: `src/i18n/i18n.ts`, `src/i18n/validateLocales.ts`, `.expo-export-audit/`, `.env`

---

## 4. Expo Go verification

With Fast Refresh disabled:

```bash
npx expo start --lan --clear
# In Expo Go: disable Fast Refresh, cold-start new-user journey
# Critical check: Profile → Back → Email stays on email (Account stage); no auto-forward to profile
```

Development-build validation remains **explicitly pending** (see §5).

---

## 5. Development build — still pending (non-blocking)

Dual-runtime comparison remains `NOT YET PROVEN`.

### Exact command to generate a compatible development build

```bash
# iOS (requires Apple creds + registered device UDID for internal dist)
npx eas-cli build --profile development --platform ios

# Android (APK/AAB via development profile)
npx eas-cli build --profile development --platform android
```

### Credentials / device requirements

| Platform | Requirements |
|----------|----------------|
| Shared | Expo account logged in (`eas login`); project linked in `app.json` / EAS |
| iOS | Apple Developer Program; distribution cert + provisioning; device UDID registered for ad hoc/internal; Xcode not required on this machine if using EAS cloud build |
| Android | Google Play / keystore via EAS credentials; physical device or emulator with `adb` for install |
| This machine (2026-07-23) | No `ios/`/`android/` dirs; `simctl` unavailable; no `adb` devices; `eas build:list` npx install hit ENOTEMPTY — retry with a clean `npx eas-cli build:list --limit 10` |

### After install

```bash
npx expo start --dev-client --lan
# Cold-start identical journey; fill Dev-build column in diagnostic table
```

Do **not** treat missing native runtime as blocking the shared-code corrections above.

---

## 6. Tests run

```
npm run test:wizard-nav-race
npm run test:onboarding-wizard
npm run typecheck
```
