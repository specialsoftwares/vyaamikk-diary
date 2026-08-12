# Android Standalone Preview Beta — Physical Device Acceptance Sheet

**Build profile:** `preview` (standalone, internal distribution, no Metro / no Dev Client)  
**Package:** `com.specialsoftwares.vyaamikkdiary`  
**Firebase project:** `vyaamikk-diary` · **Functions region:** `asia-south1`  
**Mock OTP:** must never work (`000000` / `123456` rejected by app isolation)

Fill every row. Do not mark a section Passed without evidence.

## Build under test

| Field | Value |
|---|---|
| EAS Build ID | |
| Install URL / APK name | |
| App version / versionCode | |
| Device model | |
| Android version | |
| Tester name | |
| Tester phone (E.164) | |
| Tester email | |
| Test start (IST) | |
| Test end (IST) | |

## A. Install & launch

| # | Action | Expected | Result (Pass/Fail) | Evidence |
|---|---|---|---|---|
| A1 | Install APK; open launcher icon | Opens Vyaamikk Diary directly — **not** Expo Development Servers | | Screenshot |
| A2 | Confirm no Metro / no LAN bundler required | App usable offline from network perspective for shell UI | | Note |
| A3 | Confirm no mock/dev OTP banner | No deterministic OTP hint | | Screenshot |

## B. Phone OTP (real SMS)

| # | Action | Expected | Result | Evidence |
|---|---|---|---|---|
| B1 | Enter new ordinary Indian mobile | Request succeeds / SMS arrives | | Time SMS received |
| B2 | Enter `000000` | Rejected | | Screenshot/error text |
| B3 | Enter `123456` | Rejected (unless SMS literally contained it) | | |
| B4 | Enter real SMS code | Native RNFirebase verify succeeds | | |
| B5 | Wrong code / expired / resend | Truthful errors; resend cooldown works | | |
| B6 | Background app during OTP; return | Session still usable or clear recovery | | |

## C. Email OTP + onboarding

| # | Action | Expected | Result | Evidence |
|---|---|---|---|---|
| C1 | Request email OTP to real inbox | Email arrives via Resend/deployed Functions | | Inbox timestamp |
| C2 | Verify OTP | Email binds; continue | | |
| C3 | Complete Profile → Review → UEID → Intro → Location → You | No loops / race / flash of You early | | Screen sequence notes |
| C4 | Kill app; reopen | Session restored to correct user | | |

## D. Persistence & modules

| # | Action | Expected | Result | Evidence |
|---|---|---|---|---|
| D1 | Create ordinary business entry; reopen | Persists; appears in Recent/Saved | | Record id |
| D2 | Letterhead Matter + PDF + regenerate | One doc; diary link `${clientRecordId}_matter`; PDF **no** Vyaamikk branding/operator footer | | PDF share |
| D3 | Purchase Order rapid double-tap save | One PO, one serial | | PO number |
| D4 | Customer Credit + payment + repeat payment + closure + repeat closure | Ledger deduped; balance consistent | | |
| D5 | Reminder create/edit/complete | One notification; cancel works | | |
| D6 | Location deny then continue | Record still savable | | |
| D7 | Airplane mode save then reconnect | No duplicate after retry | | |
| D8 | Second device same account | Sync visible | | Device B model |
| D9 | Logout → other user login | No stale profile/records/PDFs | | |

## E. Failures to capture

Attach: device model, Android version, build ID, steps, expected vs actual, timestamp, screenshot/recording. Redact OTPs, full phone, email, UEID in shared chats if needed.

## Sign-off

| Role | Name | Date | Verdict |
|---|---|---|---|
| Tester | | | Ready for wider beta / Not ready |
| Owner | | | |
