# Google Play Review — Test Account Setup

Vyaamikk Diary uses Firebase phone OTP authentication. There is no username or password.
Google Play reviewers sign in with a Firebase test phone number that bypasses real SMS
and accepts a fixed OTP. This is a Firebase Auth built-in feature.

This document is Play Console copy and developer checklist only.
It does not create reviewer email inboxes, store inbox passwords, or prove that
onboarding has been completed.

## One-time developer setup (not performed by source assembly)

### 1. Firebase test phone number

Firebase Console → Authentication → Sign-in method → Phone → Phone numbers for testing:

- Phone number: +91 9000000000
- Verification code: 654321

This is a project test fixture, not a real subscriber number.

### 2. Pre-configure the test account on a production build

Using a production Android build on a real device (not Expo Go):

1. Open Vyaamikk Diary.
2. Enter phone number: +91 9000000000
3. Tap Send OTP.
4. Enter code: 654321.
5. Complete whatever onboarding the current production app still requires.
6. Confirm the main app tabs are reachable.

Do **not** create a dedicated reviewer email inbox for this Play path.
Do **not** put inbox passwords or email OTPs in Play Console instructions.

A later, owner-authorized live check may run:

```bash
npm run review:verify-account
```

That script reads `users/{uid}` and checks only:

- `name`
- `businessName`
- `phoneE164`
- `ueid`
- `status` equals `active`

Passing the script is **not** proof that email, location, or every onboarding
screen was completed. Source inspection of the script is also not proof that
the live review account exists.

## Google Play Console — Sign-in details

**Is any part of your app restricted?** YES

**Name:** `Test Account for Play Review`

**Username / email address or phone number:**

`+91 9000000000`

**Password:**

Leave blank. This app does not use passwords.

**Any other information required to access your app:**

This app uses phone OTP authentication. No password exists.

SIGN-IN STEPS:

1. Enter phone number: +91 9000000000
2. Tap "Send OTP"
3. When prompted for the verification code, enter: 654321
4. If the test account was pre-configured, the app continues into the main dashboard

No SMS is sent. This is a Firebase test number with a fixed code.

**Checkbox — "Sign-in details provide full access including premium or paid content":**
check only if that statement remains true for the submitted build.

## Security properties

- +91 9000000000 is not a real Indian mobile number assignable by a carrier
- Firebase test numbers are per-project
- Firestore rules isolate data per UID
- Code 654321 is not the local-mock OTP
- Removing the test number from Firebase Console revokes that sign-in path

## Emergency revocation

Firebase Console → Authentication → Users → find the test UID → Disable account
