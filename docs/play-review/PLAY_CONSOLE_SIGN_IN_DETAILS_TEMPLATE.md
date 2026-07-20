# PLAY CONSOLE SIGN-IN DETAILS — TEMPLATE (NO REAL CREDENTIALS)

**Paste into:**  
Google Play Console → Vyaamikk Diary → Policy and programmes → App content → **App access** / **Sign-in details** → Add details  

Replace every `[PLACEHOLDER]` with private values. **Never commit filled values to Git.**

---

## Suggested Sign-in details text

```
Sign-in method: Mobile number (Firebase Phone Authentication)

Review phone number (E.164):
[REVIEW PHONE E.164 — DO NOT COMMIT]

Reusable verification code (no SMS is sent for this fictional Firebase test number):
[REVIEW OTP CODE — DO NOT COMMIT]

App PIN:
Not required — this build does not use a separate app PIN / passcode.

Linked review email (already configured on the account; reviewers should not change it):
[REVIEW ACCOUNT EMAIL — DO NOT COMMIT]

How to sign in:
1. Install Vyaamikk Diary from this Play track.
2. On the sign-in screen, leave country code +91 and enter the 10-digit local part of the review phone number.
3. Accept Terms of Use and Privacy Policy.
4. Tap continue / send code.
5. Enter the reusable verification code above on the OTP screen. No physical SMS will arrive.
6. The account is already onboarded. You should reach the main app (You / Calendar / Settings) without creating a new profile.

Optional permissions:
- Location and notifications are optional. You may tap Not Now / Deny. Core record-keeping and PDF features remain available.

Available for review:
- Dashboard and profile identity
- Create / save business records and history
- PDF generation and system share sheet
- Calendar
- Language settings
- Settings → Privacy Policy, Terms, Support
- Settings → Delete Account & Data screen (for inspection only)

Important:
- Do not confirm account deletion.
- Do not change the mobile number or linked email.
- Do not use this account for real business data.

Support contact:
support.vyd@specialsoftwares.com
```

---

## Owner checklist (Play Console)

1. [ ] Firebase test phone configured and privately recorded  
2. [ ] Account fully onboarded on production-like build  
3. [ ] Demo data seeded  
4. [ ] Manual QA matrix passed on clean install  
5. [ ] Paste Sign-in details above with real placeholders filled **only in Play Console**  
6. [ ] Confirm “All functionality available” / equivalent declaration matches reality  
