# DEBUG: Onboarding escape & Back navigation

**Date:** 2026-07-21  
**Commit:** `fix(auth): make pre-dashboard onboarding fully reversible` (see `git log -1`)

## Previous route-loop cause

1. User on **Build your business identity** (`/(auth)/complete-profile`) pressed Back.
2. `BusinessIdentityScreen` used `router.replace("/(auth)/v2?step=email&from=profile")`.
3. `AuthFlowGate` hydration saw `hasAuthoritativeVerifiedEmail(user)` and immediately called `handoffToApp()` → `router.replace("/")`.
4. Boot `resolveBootDestination` sent the user back to `/(auth)/complete-profile`.
5. Result: Back appeared ineffective; guard forced the same screen. Continuous `replace` effects competed with intentional review.

Secondary issues: screen `useEffect` guards (`ueid`, `onboarding-intro`, `location-onboarding`, `complete-profile`) always forced *forward* when flags were set, with no distinction between boot resume and deliberate earlier-step review.

## New wizard state model

| Concept | Role |
|--------|------|
| Server identity completion | `maxAuthorizedWizardStep(user)` — highest step user may enter |
| `OnboardingNavigationState` | AsyncStorage: `currentStep` + `intent` (`bootResolution` \| `continueForward` \| `reviewPreviousStep`) |
| Resume | Cold launch uses `resumeWizardStep` / `resolveAuthOnboardingHref` → earliest incomplete step |
| Review | `intent: reviewPreviousStep` suppresses forward-only redirects |

Steps (repo-adapted):  
`mobileEntry → phoneConfirm → phoneOtp → emailEntry → emailOtp → businessIdentity → ueidRelease → onboardingIntro → locationFootprint → dashboard`

## Valid backward transitions

| From | Back to |
|------|---------|
| phoneConfirm | mobileEntry |
| phoneOtp | phoneConfirm (or mobileEntry via change number) |
| emailOtp | emailEntry |
| emailEntry | mobileEntry (session kept if phone unchanged) |
| businessIdentity | emailEntry (review intent) |
| ueidRelease | businessIdentity (review) |
| locationFootprint | onboardingIntro (review) |
| mobileEntry | none (no Back control) |

Hardware Back and UI Back share the same logical step policy.

## Dependency invalidation

| Change | Effect |
|--------|--------|
| Same mobile while reviewing | Keep session; skip OTP; continue to email |
| Different mobile | Confirm → sign out incomplete session → clear wizard nav + profile draft + auth wrapper progress → OTP new number → email entry |
| Unverified email edit | New challenge on Continue; clear entered OTP; new resend timer |
| Verified email → different address | Clear `emailVerifiedAt` / set `verification_pending`; require OTP; downstream incomplete until re-verified |
| Individual ↔ Business | Shared `displayName` kept; business fields cleared for Individual (confirm if meaningful data) |

## Data preservation

- Profile draft: `vyd_onboarding_profile_draft_v1_{uid}` while moving Back/forward on the same account.
- Cleared on phone-account switch, sign-out-and-restart, and successful profile submit.

## Account isolation

Phone change does **not** mutate the old verified binding silently. It terminates the incomplete registration session on-device and starts OTP for the new number. Email, OTP challenges, UEID/profile draft for the previous uid are cleared/quarantined on device.

## After first dashboard entry

`clearOnboardingNavigationState()` on location finish / fully ready handoff. App shell remains gated; later identity edits use settings (not the registration wizard). **Sign out and start again** is available during the wizard only as an abandon path—not a substitute for Back.

## Files changed (primary)

- `src/auth/onboardingWizard.ts` (+ test)
- `src/auth/onboardingNavigationStore.ts`
- `src/auth/onboardingProfileDraft.ts`
- `src/auth/onboardingGuardPolicy.ts`
- `src/auth-v2/AuthFlowGate.tsx`
- `src/auth-v2/screens/BusinessIdentityScreen.tsx`
- `src/auth-v2/screens/UeidReleaseOnboardingScreen.tsx`
- `src/auth-v2/components/OnboardingV2Shell.tsx`
- `src/auth-v2/components/WizardProgress.tsx`
- `app/(auth)/complete-profile.tsx`, `ueid.tsx`, `onboarding-intro.tsx`, `location-onboarding.tsx`
- `src/boot/resolveBootRoute.ts`
- `package.json` (test script)

Protected / untouched: `src/i18n/i18n.ts`, `src/i18n/validateLocales.ts`, `.expo-export-audit/`, `.env`

## Automated tests

- `npm run typecheck`
- `npm run test:onboarding-wizard`
- `npm run test:identity-route-state`

## Manual test results

Operator checklist (Expo Go local-mock + production-like Firebase):

- [ ] Phone → OTP → email → email OTP → business identity
- [ ] Back one step at a time to mobile entry
- [ ] Same mobile continue preserves verification; email/profile drafts intact
- [ ] Changed mobile confirms reset; email/profile of prior session cleared
- [ ] No dashboard before all mandatory steps
- [ ] Final dashboard: Back does not return to OTP/registration
- [ ] Android hardware Back / iOS swipe where applicable

*(Automated suite green; device checklist for operator.)*
