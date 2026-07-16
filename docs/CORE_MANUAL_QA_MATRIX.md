# Core Manual QA Matrix — Vyaamikk Diary

**Purpose:** Executable device steps with pass criteria for core runtime stability.  
**Companion:** `docs/CORE_RUNTIME_STABILIZATION_AUDIT.md`  
**Public origin:** `https://vyaamikk.specialsoftwares.com`  
**Support:** `support.vyd@specialsoftwares.com`  
**Stores:** App Store / Play URLs empty — taps must explain, not open junk URLs.

Mark each row: **Pass / Fail / Blocked** + build profile (Expo Go / Dev Client / Preview / Production).

---

## A. Install and boot

| ID | Steps | Pass criteria |
|----|-------|---------------|
| A1 Fresh install | Delete app → install → cold launch | Splash ends; lands on auth or landing per product; no infinite loading |
| A2 Upgrade + retained data | Install over build with SQLite + session | Opens without wipe; records still listed; no forced re-onboarding if complete |
| A3 Cold launch signed-out | Kill process → launch | Deterministic auth/landing; no crash |
| A4 Cold launch signed-in | Kill → launch with valid session | Restores identity; reaches You/Calendar or onboarding gate once |
| A5 Warm launch | Background → resume | No provider crash; sync/banner sane |
| A6 Incomplete onboarding | Account missing required profile steps | Cannot enter main tabs until gates complete |
| A7 Completed onboarding | Full profile | Boot to You (or draft prompt, not auto-open) |
| A8 Malformed deep link | Open unsupported URL scheme/path | Honest fallback; no redirect loop |
| A9 Process restore | OS kills app mid-boot | Next launch settles; no stuck splash > safety timeout |

---

## B. Navigation and tabs

| ID | Steps | Pass criteria |
|----|-------|---------------|
| B1 Tab stress | Calendar → You → Settings ×20 | No freeze; tab bar always tappable |
| B2 After language change | Switch language → immediately press tabs | No invisible overlay; navigation works |
| B3 During sync | Trigger sync → press tabs | UI remains responsive |
| B4 Nested Settings | Open nested settings → back | Returns correctly; no double stack |
| B5 Modal open + back | Open CurtainSheet/modal → gesture/hardware back | Dismisses; touch restored |
| B6 Background with modal | Open sheet → background → resume | Sheet state sane; no full-screen touch trap |

---

## C. Language and theme

| ID | Steps | Pass criteria |
|----|-------|---------------|
| C1 Language switch | Change lang on You/Settings | Overlay settles; Auth/DB/Sync not remounted (session/records intact) |
| C2 Rapid language | Switch 5× quickly | No deadlock; final language matches selection |
| C3 Theme Light/Dark/System | Cycle modes; change OS theme | Surfaces update; no lost draft |
| C4 Business data | Switch lang with open record | User-entered fields not translated |

---

## D. Overlays and consent

| ID | Steps | Pass criteria |
|----|-------|---------------|
| D1 CurtainSheet open/close | Open → swipe dismiss → reopen | Closing root does not capture tabs; idle after close |
| D2 Second sheet while closing | Open A → close → open B immediately | No stuck backdrop |
| D3 Location consent | Show consent → Not Now | Dismisses; app usable without location |
| D4 Permission deny | Deny location/notifications | No undismissable modal; no false success |
| D5 Language overlay | During settle, tap tabs | Touches pass when overlay inactive |

---

## E. External links and mailto

| ID | Steps | Pass criteria |
|----|-------|---------------|
| E1 Privacy / Terms | From Settings, About, landing, consent footer | Opens `vyaamikk.specialsoftwares.com/...` HTTPS |
| E2 Support / Contact | Tap support | Mailto to `support.vyd@specialsoftwares.com` or honest fail |
| E3 Download stores | Tap store buttons | Empty URLs → non-blocking explain; no crash |
| E4 Forbidden `/auth` | If any UI tried to open site `/auth` | Must not open as end-user destination |
| E5 Return from browser | Open Privacy → return to app | App interactive; no freeze |
| E6 Rapid taps | Double-tap Privacy | No crash; serialized/joined open |

---

## F. Auth honesty

| ID | Steps | Pass criteria |
|----|-------|---------------|
| F1 Expo Go OTP | Attempt production OTP in Expo Go | Mock/isolation path only; no silent prod identity |
| F2 Dev/Prod client OTP | Real OTP on EAS client | Success only after verify; busy clears in finally |
| F3 Duplicate taps | Double-submit OTP | No duplicate accounts; idempotent |
| F4 Background mid-OTP | Background during verify | Settles honestly on resume |
| F5 Network loss | Airplane during confirm | Error shown; not signed-in falsely |
| F6 Expired session | Force expired credentials | Session lock banner; after logout+login sync works |

---

## G. Records, offline, sync

| ID | Steps | Pass criteria |
|----|-------|---------------|
| G1 Offline create | Airplane → create record → Save | Local success; pending indicator |
| G2 Reconnect sync | Online → flush | Uploads; pending clears; no duplicate |
| G3 Rapid Save | Tap Save 10× | One stable id; no duplicates |
| G4 Navigate mid-Save | Save → leave screen | No corrupt half-UI success |
| G5 Session lock then re-login | Lock → logout → login → pull | Sync runs (post-F1 fix) |
| G6 Logout during sync | Flush → logout | Listeners disposed; no cross-user leak |

---

## H. Deletion and reactivation

Paths: **Settings → Delete Account & Data** and **Settings → About → Delete account**.

| ID | Steps | Pass criteria |
|----|-------|---------------|
| H1 Confirm deletion | Complete confirm UX | Pending-deletion state; writes blocked per contract |
| H2 Re-login pending | Sign out → sign in | Pending screen; not full app |
| H3 Reactivate | In-app email **verification code** | Active again; email reply alone insufficient |
| H4 Network after confirm | Confirm → lose network | Honest error or recoverable pending; no silent wipe |
| H5 Mid-deletion kill | Kill app mid-flow | Relaunch consistent with server status |
| H6 Duplicate delete request | Confirm twice | Idempotent / safe message |

---

## I. PDF, permissions, notifications (smoke)

| ID | Steps | Pass criteria |
|----|-------|---------------|
| I1 PDF generate | Each major template used by account | Opens/shares; required fields present |
| I2 Letterhead | Generate letterhead PDF | No platform branding per product rule |
| I3 Camera/photos deny | Deny then attach | Soft fail; app usable |
| I4 Notifications deny | Deny reminders | No undismissable UI |
| I5 Reminder edit/delete | Change date / delete record | Stale reminder cleared or rescheduled |

---

## J. Sign-off

| Build | Tester | Date | Blockers |
|-------|--------|------|----------|
| | | | |

Do not mark PRODUCTION_READINESS subsystems complete from this checklist until the relevant rows are **Pass** on the target build profile.
