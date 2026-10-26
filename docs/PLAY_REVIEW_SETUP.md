# Google Play Review — Test Account Setup

Vyaamikk Diary uses Firebase phone OTP authentication. There is no username or password.
Google Play reviewers sign in with a configured Firebase fictional/test-phone fixture
that bypasses real SMS and accepts a fixed OTP. Whether that fixture is present in the
live project is an owner-verification step, not something this source tree proves.

This document is Play Console copy and developer checklist only.
It does not create reviewer email inboxes, store inbox passwords, or prove that
onboarding has been completed.

**The full-feature internal candidate is the `internal-grin` profile.** It is an
Android App Bundle in production app mode for `com.specialsoftwares.vyaamikkdiary`
and Firebase project `vyaamikk-diary`. GRIN admission and subscription purchase
entry are enabled. Quota upsell stays off. A new GRIN image or PDF is sealed
when verification succeeds. An existing unsealed object stays readable and is
not rewritten. `internal-auth-validation` is a
diagnostic build only: GRIN and purchase entry are off. Do not give that build
to Play as the full app.

Purchase entry does not grant a subscription. New Play grants stay limited to
the server tester allowlist while `PLAY_BILLING_ENABLED` is on. A reviewer who
is not that allowlisted account can open the purchase screen and must not
receive an entitlement. Do not check Play “full access including premium”.
Ordinary customers need a separate approval that removes the allowlist
restriction. That approval is not part of this internal candidate.

## One-time developer setup (not performed by source assembly)

### 1. Firebase test phone fixture

Firebase Console → Authentication → Sign-in method → Phone → Phone numbers for testing:

- Phone number: [PLAY_REVIEW_PHONE]
- Verification code: [PLAY_REVIEW_CODE]

This is the configured Firebase fictional/test-phone fixture for review. It is not a
confidential production credential and is not, by itself, proof of secure isolation.
Owner verification of the live Firebase project is still required.

### 2. Pre-configure the test account on a production build

Using a production Android build on a real device (not Expo Go):

1. Open Vyaamikk Diary.
2. Enter phone number: [PLAY_REVIEW_PHONE]
3. Tap Send OTP.
4. Enter code: [PLAY_REVIEW_CODE].
5. Complete email verification and business profile setup as the owner/tester (not as Play reviewer copy).
6. Confirm You / Calendar / Settings are reachable with a **fresh** sign-in using only the test phone and OTP.
7. Do not leave email or profile steps for the Play reviewer. Do not use a founder inbox.

Do **not** create a dedicated reviewer email inbox for this Play path.
Do **not** put inbox passwords or email OTPs in Play Console instructions.

A later, owner-authorized live check may run:

```bash
npm run review:verify-account
```

That read-only script binds to `EXPO_PUBLIC_FIREBASE_PROJECT_ID` and checks only:

- Auth user for the configured test phone is present and not disabled
- Optional `--uid` refers to that same Auth user and phone
- `users/{uid}` has name, businessName, phoneE164, ueid, and status=active

Passing the script is a **partial profile check**. It is **not** proof that a
reviewer can reach the dashboard, and it does not currently assert verified
email. Owner must still confirm email verification + profile completion on
device before Play review. A fresh reviewer sign-in is still required.

Do not run the live script during source assembly. Do not execute emergency
revocation from this document.

## Google Play Console — Sign-in details

**Is any part of your app restricted?** YES

**Name:** `Test Account for Play Review`

**Username / email address or phone number:**

`[PLAY_REVIEW_PHONE]`

**Password:**

Leave blank. This app does not use passwords.

**Any other information required to access your app:**

This app uses phone OTP authentication. No password exists.

SIGN-IN STEPS:

1. Enter phone number: [PLAY_REVIEW_PHONE]
2. Tap "Send OTP"
3. When prompted for the verification code, enter: [PLAY_REVIEW_CODE]
4. The review account is pre-configured (email verified, profile complete). Continue into the main app (You / Calendar / Settings). Do not create a new profile or use a founder email inbox.

No SMS is sent when the Firebase test-phone fixture is configured.

**Checkbox — "Sign-in details provide full access including premium or paid content":**
leave unchecked. The `internal-grin` candidate shows purchase entry, and GRIN is available, but a subscription is delivered only to the server allowlist. The purchase button is not premium access.

## Security properties

- [PLAY_REVIEW_PHONE] is the configured Firebase fictional/test-phone fixture; owner must verify it in the live project
- Firebase test numbers are per-project configuration, not a substitute for Firestore UID isolation
- Firestore rules isolate data per UID independently of this fixture
- Code [PLAY_REVIEW_CODE] is not the local-mock OTP
- Removing the test-phone configuration stops **new** sign-in with that fixture. It does not terminate already-issued sessions.

## Session disable (owner action, not performed here)

Firebase Console → Authentication → Users → find the test account → Disable account
is an owner operation. This source assignment does not execute it.
