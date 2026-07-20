# PLAY REVIEW ACCOUNT SETUP RUNBOOK (OWNER ONLY)

**Do not paste real phone numbers, OTPs, or emails into Git, Cursor, or shared docs.**  
Work in a private password manager / offline note until pasting into Firebase and Play Consoles.

**App:** Vyaamikk Diary · **Android ID:** `com.specialsoftwares.vyaamikkdiary`  
**Firebase project:** `vyaamikk-diary`  
**Build required:** Production-like Android (EAS internal / closed testing / release) — **not Expo Go**.

---

## A. Firebase Console — fictional phone (mandatory)

Navigate:

**Firebase Console → project `vyaamikk-diary` → Authentication → Sign-in method → Phone → Phone numbers for testing → Add phone number**

1. Choose a **fictional Indian** number in E.164 that the app UI can accept:  
   - Country `+91`  
   - Exactly 10 digits  
   - First digit **6, 7, 8, or 9**  
   - Example shape only: `+91##########` (do not reuse examples from public docs if weak)  
   - **Do not** use Firebase’s US sample numbers (`+1 650-555-…`) — the app rejects them in UI.  
2. Set a **fixed 6-digit** verification code (avoid `000000`, `123456`, repeated digits if possible).  
3. Confirm the number is **not** already an active real user / retired phone index.  
4. Save. Firebase will **not** send SMS for this number; the fixed code is accepted by the Auth SDK.  
5. Store privately:  
   - `[REVIEW PHONE E.164 — DO NOT COMMIT]`  
   - `[REVIEW OTP CODE — DO NOT COMMIT]`

---

## B. Prepare the account on a production-like build

1. Install the **production-connected** Android build (same Firebase project as Play).  
2. Open app → Auth v2 → accept Terms + Privacy.  
3. Enter the 10 local digits of the review phone (UI shows +91).  
4. Send OTP → enter `[REVIEW OTP CODE — DO NOT COMMIT]`.  
5. **Email step:** enter `[REVIEW ACCOUNT EMAIL — DO NOT COMMIT]` and complete verification if prompted (production path uses server email verification).  
6. Complete profile: display name (required), optional business fields.  
7. Pass UEID screen, onboarding intro, location onboarding (you may decline OS location).  
8. Confirm you reach the main **You / dashboard** tabs.  
9. Log out and log in again with the same OTP to confirm repeatability.  
10. Confirm Settings → Delete Account is reachable but **do not** type DELETE / confirm.

---

## C. Harmless demonstration dataset (create in-app; fictional only)

Use invented values — no real customers, GSTINs, bank accounts, or private addresses.

| Field | Suggested fictional pattern |
|-------|-----------------------------|
| Display name | `Play Reviewer` |
| Business name | `Demo Kirana Sample` |
| Customer | `Sample Customer One` |
| Record | One cash / work update with amount `₹1,250.00` |
| Reference | `DEMO-PO-001` |
| PIN text | Public PIN e.g. `110001` (no private GPS required) |
| Reminder | Optional future reminder titled `Demo follow-up` |
| Letterhead / photo | Optional non-sensitive sample image |

Generate one PDF and open the share sheet once (cancel share if desired).

---

## D. Safety checks before Play submission

- [ ] Account status **active** (not `pending_deletion`)  
- [ ] Phone not in `retiredPhones`  
- [ ] Email gate cleared (`businessEmail` set; wrapper email pending cleared)  
- [ ] `profileCompletedAt`, `ueidReleasedAt`, `onboardingIntroSeenAt` set  
- [ ] Location consent screen already shown  
- [ ] Demo records visible after logout/login  
- [ ] Credentials exist **only** in Firebase + private store (not Git)

---

## E. What reviewers must not do (include in Play instructions)

- Do not confirm account deletion  
- Do not change the registered mobile number  
- Do not change the linked business email  
- Do not expect a physical SMS  

---

## F. After review (see rotation checklist)

Rotate or remove the Firebase test number/code; update or clear Play Sign-in details.
