# MASTER AUTH ONBOARDING EXECUTION TRACKER

**Repo:** `/Users/shivamsaurav/Vyaamikk Diary`  
**Updated:** 2026-07-24 (stabilization pass — see `STABILIZATION_AND_RELEASE_READINESS.md`)  
**Protected (never touch/stage):** `src/i18n/i18n.ts`, `src/i18n/validateLocales.ts`, `.expo-export-audit/`, `.env`

Channel / release readiness for this repo is tracked in **`STABILIZATION_AND_RELEASE_READINESS.md`**. This file remains the auth/onboarding execution tracker.

## Commits in this master pass

| Hash | Message |
|------|---------|
| `9296abf` | fix(auth): harden mobile entry and OTP challenge flow |
| `e936126` | feat(auth): add offline, quarantine, and device integrity policy modules |
| `8c1879f` | docs(auth): add master pre-dashboard hardening tracker and reports |
| `941e756` | feat(onboarding): complete individual and business identity profiles |
| `63787ee` | fix(auth): complete navigate-first email otp delivery flow |
| `15edc78` | feat(auth): enforce offline capability restrictions centrally |
| `88c4067` | feat(auth): enforce mobile quarantine and rebind transactions |
| `a7455cf` | feat(auth): complete new-device security event handling |
| `49d6cf7` | docs(auth): update Pass 2 tracker and test scripts |
| `a4234c1` | docs(auth): record Pass 2 commit hashes in tracker |
| `c297eb1` | fix(auth): sync in-memory wizard navigation owner |
| `7c8df61` | docs(auth): record navigation stabilization ownership model |

Prior related: `f812352`, `d58dc52`, `81f8ae6`, `83fa1d3`, `4db7c86`

## §1 Git safety — IMPLEMENTED

Protected paths remain unstaged.

## Navigation stabilization (shared JS) — IMPLEMENTED

| Item | Status | Evidence |
|------|--------|----------|
| Sync review intent in memory | DONE | `wizardNavigationController.ts` |
| AsyncStorage secondary / non-blocking | DONE | `persistSecondary` fire-and-forget |
| Decision priority order | DONE | See `AUTH_ONBOARDING_VISUAL_FLOW_STABILIZATION.md` |
| Constrain AuthFlowGate / complete-profile / app-layout | DONE | Sync `shouldSuppressForward*` |
| No Step N of M | DONE | Account / Identity / Review stages |
| Race tests | DONE | `npm run test:wizard-nav-race` |
| Expo Go (FR off) | PENDING device confirmation | Metro `start:expo-go` available |
| Dev-build paired comparison | **NOT YET PROVEN** | Explicitly pending — does not block shared-code fix |

## Pass 2 requirement roll-up

| Item | Status | Files / runtime / tests |
|------|--------|-------------------------|
| §2.1–2.3 Identity Individual\|Business | TESTED | `profileIdentityModel.ts`, `BusinessIdentityScreen.tsx`; `test:onboarding-pass2` |
| §2.4 PIN lookup + confirm + stale | TESTED | `pinConfirmation.ts` + screen; stale requestId in `test:onboarding-pass2` |
| §2.5 Mandatory image/logo | IMPLEMENTED | `identityMedia.ts`, `identityMediaValidation.ts`, screen camera/gallery/crop/persist; HEIC rejected; durable store via `persistProfileLogoFromPicker` |
| §2.6 GSTIN optional + states | TESTED | `gstinVerificationState.ts`; formatInvalid blocks submit; verificationUnavailable honest label |
| §2.7 Autosaved draft v2 | IMPLEMENTED | `onboardingProfileDraftV2.ts` keyed uid+env+kind+schema; migrates v1 |
| §2.8 Final review + Edit | IMPLEMENTED | `ProfileReviewScreen.tsx`, `app/(auth)/profile-review.tsx`, wizard step `profileReview` |
| §2.9 Atomic Complete Profile | TESTED | `completeOnboardingProfile.ts` + Logic; single-flight; snapshot before `profileCompletedAt`; `test:complete-onboarding-profile` |
| §3 Email navigate-first | TESTED | `emailOtpSendMachine.ts` + `AuthFlowGate.tsx`; `test:email-otp-send-machine` |
| §4 Central offline guard | TESTED | `offlineCapabilityGuard.ts` wired save/pdf/share/sync; `test:onboarding-pass2` |
| §5 Server 21-day quarantine | IMPLEMENTED | `functions/.../mobileQuarantine.ts` + binding hooks; scheduled TTL deploy EXTERNALLY BLOCKED; `test:mobile-quarantine-unit` |
| §5 Rebind during quarantine | IMPLEMENTED | rebind callable + unit tests; production deploy EXTERNALLY BLOCKED |
| §6 New-device security source | IMPLEMENTED | `functions/.../newDeviceSecurity.ts` + client mock; provider deploy EXTERNALLY BLOCKED; `test:new-device-security-unit` |
| §7 Root/jailbreak SDK | EXTERNALLY BLOCKED | fail-closed `deviceIntegrity.ts` + `deviceIntegrity.testAdapter.ts`; no SDK in package.json |
| §8 Remediation routing | IMPLEMENTED | `profileRemediation.ts` + `resolveAuthOnboardingRoute.ts` + complete-profile stay |
| §9 Issuer PDF snapshot | IMPLEMENTED | `issuerIdentitySnapshot.ts` + per-PDF disclosure helper; wired at completion |
| §10 Automated tests | TESTED | see Commands |
| §11 Validation | TESTED | typecheck + focused suites; functions:build ok; Expo export / physical device not run |
| Manual device / SMS / Resend / App Check | EXTERNALLY BLOCKED | unchanged |

## Commands run (Pass 2)

```
npm run typecheck
npm run functions:build
npm run test:onboarding-pass2
npm run test:email-otp-send-machine
npm run test:complete-onboarding-profile
npm run test:mobile-quarantine-unit
npm run test:new-device-security-unit
npm run test:onboarding-wizard
npm run test:identity-route-state
npm run test:auth-policy-matrix
npm run test:client-profile-patch
npm run test:local-mock-email-otp
npm run test:phone-validation
```

## External blockers (honest)

- Production SMS / Resend secrets & DNS / security-email acceptance in prod
- App Check package + enforcement
- Functions/rules production deploy + Firestore TTL for quarantine release
- Public hosting for “This wasn’t me” HTTP link (handler source exists)
- Integrity SDK wiring + physical verification
- Physical iOS/Android acceptance matrix
- Expo export not re-run this pass

## Runtime paths (Pass 2)

1. Email Send OTP → dismiss keyboard → `/email_verify` immediately → background send (`sending`\|`challengeCreated`\|`failed`)
2. Profile → Complete Profile form → Review → atomic complete → UEID (not dashboard)
3. Mutations → `assertLiveMutationAllowed` in saveCoordinator / pdfService / share / syncEngine
4. Phone bind CF → `assertMobileNotQuarantined` before claim
