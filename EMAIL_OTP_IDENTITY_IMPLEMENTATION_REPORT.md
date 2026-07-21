# Email OTP Identity — Implementation Report

**Date:** 2026-07-21  
**Commits:** this change (`fix(auth): align mock email OTP and add resend countdown`); prior `83fa1d3`, `81f8ae6`

## Architecture

- **Primary sign-in:** verified mobile (unchanged).
- **Mandatory secondary identity:** exactly one verified email per account.
- **Authoritative binding:** `one account ↔ one mobile ↔ one verified email`.
- **OTP authority:** Firebase Cloud Functions v2 callables (`asia-south1`) with Admin SDK transactions.
- **Local-mock:** guarded in-process OTP adapter. Deterministic OTP is **`000000`** and is accepted **only** when all of the following are true: `activeBackend === "local-mock"`, effective app mode is `development`, bundled mode is not production, and `EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP=1` is explicitly set. `__DEV__` / Expo Go alone do **not** enable the mock OTP.

## Route state machine

Centralized in `src/auth/identityRouteState.ts`, consumed by `resolveBootDestination` + Auth Wrapper.

States: `unauthenticated`, `phoneAuthenticatedEmailMissing`, `emailPendingVerification`, `emailVerificationLocked`, `emailVerifiedOnboardingIncomplete`, `fullyReady`, `accountDisabled`, `recoveryPending`, `recoveryCoolingOff`.

Dashboard (`/(app)/(tabs)/you`) only for `fullyReady` | `recoveryCoolingOff`. Legacy `businessEmail` without `emailStatus==='verified'` + `emailVerifiedAt` is **not** accepted.

## Challenge lifecycle

1. `startEmailVerification` → HMAC digest of OTP (secret + challengeId + uid + email + version); supersedes prior active challenges; 15 min TTL; 30 s resend.
2. Wrong OTP increments attempts; 3rd locks cycle 1 hour (per email); other email may start fresh (account rate limits still apply).
3. `verifyAndBindEmail` transaction: ownership, latest version, unexpired, unlock, HMAC verify, uniqueness on `emailBindings/{sha256}`, update user, consume challenge, security event.
4. Resend rotates version and invalidates previous OTP digest.

## Email provider

Abstraction in `functions/src/email/provider.ts`:

| Mode | Behaviour |
|------|-----------|
| Emulator / `EMAIL_PROVIDER_FORCE_DEV=1` | Dev log adapter (no real send) |
| `EMAIL_PROVIDER_API_KEY`/`RESEND_API_KEY` + `EMAIL_FROM_ADDRESS` | Resend HTTP API |
| Production missing secrets | Fail closed `EMAIL_PROVIDER_UNAVAILABLE` |

**Not completed externally:** Resend account, verified sending domain/DNS, Firebase secret create/deploy, production smoke send.

## Data model (server)

- `emailBindings/{sha256(normalizedEmail)}` — uid, normalizedEmail, status, boundAt, bindingVersion, updatedAt
- `emailIndex/{hash}` — legacy mirror
- `pendingEmailVerifications/{id}` — challenge (digest, never plaintext OTP)
- `emailOtpRateLimits/*`, `emailChangeSessions/*`, `accountRecoverySessions/*`, `manualRecoveryCases/*`
- `users/{uid}/securityEvents/*` — 90-day `expireAt` field for TTL policy
- User fields: `emailStatus`, `emailVerifiedAt`, `emailBindingVersion`, `identityUpdatedAt`, `emailVerificationLockUntil`, `coolingOffUntil`, `recoveryPending`

## Functions exported

`startEmailVerification`, `resendEmailVerification`, `verifyAndBindEmail`, `changeVerifiedEmail`, `startAccountRecovery`, `completeAccountRecovery`, `openManualRecoveryCase`, `resolveManualRecoveryCase` (+ existing identity/deletion).

## Existing-user migration

- Idempotent: presence of email ≠ verified.
- Next login routes to email collection/verification via state machine.
- Binding-index gaps repaired only on successful server verify.
- Conflicting legacy FNV vs SHA-256 indexes: admin remediation documented (do not auto-pick owner).

## Reviewer / Expo Go local-mock OTP

- Set `EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP=1` (e.g. in shell before `npm run start:expo-go`).
- Deterministic email OTP: **`000000`** (legacy `246810` is rejected).
- UI shows `Development OTP: 000000` only under the same guard.
- Resend countdown uses authoritative `resendAvailableAt` (`Resend OTP in 00:30` …); OTP validity shown separately (`Code valid for MM:SS`).
- Production / Firebase / shared-dev never accept `000000` via `assertDeterministicLocalMockOtpAllowed`.

## UX fix note (follow-up)

Commit `fix(auth): align mock email OTP and add resend countdown` standardizes the mock OTP to `000000`, removes `__DEV__`-only unlock, and replaces vague cooldown messaging with a live authoritative countdown.

## Session revocation (recovery)

1. Record `trustedRecoveryDeviceId` on success.
2. `revokeRefreshTokens(uid)` (account-wide).
3. Return `customToken` for recovery device reauth.
4. Prior sessions remain invalid.

## Deployment status

| Item | Status |
|------|--------|
| Code + rules in repo | Done |
| Functions deploy | **Not performed** |
| Secrets / Resend / DNS | **Required** |
| App Check enforce | **Documented rollout — not enforced in code yet** |
| Firestore TTL on securityEvents | **Configure in Console** |
| Production email delivery | **Not claimed** |

## Tests run

- `npm run typecheck`
- `npm run test:local-mock-email-otp`
- `npm run test:otp-countdown`
- `npm run test:email-otp-crypto`
- `npm run test:identity-route-state`

Manual (operator): Expo Go with `EXPO_PUBLIC_LOCAL_MOCK_EMAIL_OTP=1` — verify `000000`, live `Resend OTP in MM:SS`, auto-enable at zero, successful resend invalidates prior OTP.

## Protected paths

`src/i18n/i18n.ts`, `src/i18n/validateLocales.ts`, `.expo-export-audit/`, `.env` — **not modified/staged**.
