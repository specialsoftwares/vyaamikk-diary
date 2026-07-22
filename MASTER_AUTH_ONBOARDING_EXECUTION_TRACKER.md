# MASTER AUTH ONBOARDING EXECUTION TRACKER

**Repo:** `/Users/shivamsaurav/Vyaamikk Diary`  
**Updated:** 2026-07-23  
**Protected (never touch/stage):** `src/i18n/i18n.ts`, `src/i18n/validateLocales.ts`, `.expo-export-audit/`, `.env`

## Commits in this master pass

| Hash | Message |
|------|---------|
| `9296abf` | fix(auth): harden mobile entry and OTP challenge flow |
| `e936126` | feat(auth): add offline, quarantine, and device integrity policy modules |
| `ceb0016` | docs(auth): add master pre-dashboard hardening tracker and reports |

Prior related: `f812352`, `d58dc52`, `81f8ae6`, `83fa1d3`, `4db7c86`

## §1 Git safety — IMPLEMENTED

Protected paths remain unstaged.

## Requirement roll-up

| Section | Status | Evidence |
|---------|--------|----------|
| §2 State machine / wizard intent | IMPLEMENTED / TESTED | `onboardingWizard*`, prior `f812352` |
| §3–5 Mobile entry/confirm/send | IMPLEMENTED / TESTED | `phoneValidation*`, PhoneEntry/Confirm |
| §6–13 Mobile OTP | IMPLEMENTED (local-mock) / PARTIAL (Firebase SMS) | `localMockMobileOtp*`, OtpVerificationScreen |
| §14 Dev OTP guards | TESTED | mobile+email `000000` + flags |
| §15 App Check / integrity SDK | EXTERNALLY BLOCKED | abstraction only |
| §16 SMS template | EXTERNALLY BLOCKED | provider |
| §17–19 Routing / readiness | IMPLEMENTED / PARTIAL | boot + freeze fix; login card polish PARTIAL |
| §20–24 Device/offline | PARTIAL / EXTERNALLY BLOCKED | policies + trustedDevices; email gate missing |
| §25–29 SIM/root/quarantine | PARTIAL | policy modules; server quarantine incomplete |
| §30–35 Email OTP | IMPLEMENTED / PARTIAL | HMAC path exists; navigate-then-send UX PARTIAL; UI hint removed |
| §36–40 Recovery/cooling-off | IMPLEMENTED | `81f8ae6` + tests |
| §41–43 Reversible wizard/drafts | IMPLEMENTED / TESTED | `f812352` + drafts |
| §44–52 Profile review/PIN/image/GSTIN | PARTIAL / NOT STARTED | Individual/Business toggle exists; review/PIN/image missing |
| §53 Rules trust boundary | IMPLEMENTED | rules present; deploy EXTERNALLY BLOCKED |
| §54 Error taxonomy | PARTIAL | AppError expanded earlier; full MOBILE_* codes TBD |
| §55–60 Automated matrix | PARTIAL / TESTED | new unit tests; emulator suite not run |
| §61–62 Manual/perf | EXTERNALLY BLOCKED | device not run this session |
| §63 Docs | IMPLEMENTED | AUTH_* reports + this tracker |
| §64 Validation | TESTED | typecheck + focused tests |
| §65 Commits | IN PROGRESS | focused commits |

## Commands run

```
npm run typecheck
npm run test:phone-validation
npm run test:local-mock-mobile-otp
npm run test:local-mock-email-otp
npm run test:auth-policy-matrix
npm run test:onboarding-wizard
npm run test:cooling-off
npm run test:otp-countdown
npm run test:identity-route-state
```

## External blockers (do not claim done)

- Production SMS / Resend secrets & DNS
- App Check package + enforcement
- Functions/rules production deploy
- Firestore TTL console
- New-device security email + This wasn’t me
- Integrity SDK wiring
- Physical iOS/Android acceptance matrix
- Profile review + mandatory image/PIN completion pipeline
