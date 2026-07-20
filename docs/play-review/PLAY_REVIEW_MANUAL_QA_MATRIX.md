# PLAY REVIEW MANUAL QA MATRIX

**Build:** production-like Android · **Project:** `vyaamikk-diary`  
**Credentials:** private only — never log OTP/phone in tickets.

Mark Pass / Fail / Blocked.

---

## A. Clean install and OTP

| ID | Steps | Pass criteria |
|----|-------|---------------|
| A1 | Fresh install → open app | Auth v2; no crash |
| A2 | Enter review local 10 digits + consent | Continue enabled |
| A3 | Send OTP | OTP screen; **no real SMS** |
| A4 | Enter Firebase fixed code | Signs in |
| A5 | Wrong code once | Honest error; can retry |
| A6 | Resend OTP | Still fictional; fixed code works |
| A7 | Reach main tabs without new onboarding | Prepared account |

---

## B. Repeatability

| ID | Steps | Pass criteria |
|----|-------|---------------|
| B1 | Logout → login again | Same account; demo data present |
| B2 | Force-stop → reopen | Session restore or OTP again OK |
| B3 | Uninstall → reinstall → OTP | Cloud records restore |
| B4 | Background during OTP → resume | Can complete verify |

---

## C. Material features

| ID | Steps | Pass criteria |
|----|-------|---------------|
| C1 | Open demo record / create one | Saves |
| C2 | Generate PDF | Opens / share sheet |
| C3 | Calendar tab | Renders |
| C4 | Change language → return | Tabs work |
| C5 | Settings → Privacy / Terms | Opens HTTPS or in-app |
| C6 | Support / mailto | Opens or soft-fails honestly |
| C7 | Deny location if prompted | App usable |
| C8 | Deny notifications if prompted | App usable; reminders may be limited |
| C9 | Open Delete Account screen | Visible; **do not confirm** |

---

## D. Negative / safety

| ID | Steps | Pass criteria |
|----|-------|---------------|
| D1 | Confirm account is not pending deletion | Full app access |
| D2 | Second device simultaneous login (optional) | No cross-user data leak |
| D3 | Airplane mode brief | Honest offline behaviour |

---

## Sign-off

| Field | Value |
|-------|-------|
| Tester | |
| Build version / track | |
| Date | |
| Blockers | |
| Ready for Play Sign-in details? | Yes / No |
