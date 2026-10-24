# Google Play Review — Test Account Setup

## Overview

Vyaamikk Diary uses Firebase phone OTP authentication. There is no username or password.
Google Play reviewers access the app using a Firebase test phone number which bypasses
real SMS and accepts a fixed OTP code. This is a Firebase Auth built-in feature.

## One-Time Setup (Developer — do before submitting for review)

### Step 1 — Configure Firebase test phone number

Go to: Firebase Console → Vyaamikk Diary → Authentication →
Sign-in method → Phone → scroll to "Phone numbers for testing"

Add:
- Phone number: +91 9000000000
- Verification code: 654321

Save. This is a permanent configuration — do it once, never repeat.

### Step 2 — Create the reviewer email

In Google Workspace (admin.google.com), create user: reviewer@specialsoftwares.com
This email is used for the email verification step during test account onboarding.

### Step 3 — Pre-configure the test account

Using the EAS PRODUCTION build on a real device (not Expo Go):
1. Open Vyaamikk Diary
2. Enter phone number: +91 9000000000
3. Tap Send OTP
4. Enter code: 654321
5. At the email step, enter: reviewer@specialsoftwares.com
6. Check the reviewer@specialsoftwares.com inbox for the email OTP and enter it
7. Complete business profile with test data:
   - Name: Play Reviewer
   - Business: Test Business India
   - Designation: Owner
8. Complete location step
9. Confirm you reach the main app tabs (You, Calendar, Saved Records, Settings)
10. Run: npm run review:verify-account
    Confirm all fields show ✅

The account is now pre-configured. All future sign-ins with +91 9000000000 / 654321
go directly to the main app tabs — no onboarding required.

### Step 4 — Fill Google Play Console sign-in details

See the exact form values below.

## Google Play Console — Sign-in Details Form

### Question: Is any part of your app restricted?
Select: YES

### Add sign-in details form:

**Name:** `Test Account for Play Review`

**Username / email address or phone number:**
`+91 9000000000`
(include country code +91 as shown)

**Password:**
Leave blank. This app does not use passwords.

**Any other information required to access your app:**

This app uses phone OTP authentication. No password exists.
SIGN-IN STEPS:
	1.	Enter phone number: +91 9000000000
	2.	Tap "Send OTP"
	3.	When prompted for verification code, enter: 654321
	4.	App proceeds directly to main dashboard (account is pre-configured)
No SMS is sent. This is a Firebase test number with a fixed code.
Account has full access to all features. No purchase required for review.

**Checkbox — "Sign-in details provide full access including premium or paid content":**
CHECK THIS BOX. The test account has access to all app features.

Click ADD then SAVE.

## Security Properties of This Setup

- +91 9000000000 is not a real Indian mobile number assignable by any carrier
- Firebase test numbers are registered per-project and only work with your Firebase project
- The test account has its own isolated Firestore UID — no access to any real user's data
- Firestore security rules ensure per-UID data isolation — reviewer cannot read other accounts
- Code 654321 is not the same as the dev mock OTP (123456) — they are separate systems
- No real SMS is sent — Firebase intercepts the request server-side
- Removing +91 9000000000 from Firebase Console immediately revokes access

## After Review Approval

Optionally remove +91 9000000000 from Firebase test numbers after approval.
For subsequent review submissions (app updates), re-add the test number and
re-configure the account if needed.

## Emergency Revocation

If you need to immediately revoke reviewer access:
Firebase Console → Authentication → Users → find UID → Disable account
This takes effect immediately for all active sessions.
