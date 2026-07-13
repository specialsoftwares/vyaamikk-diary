# Pre-Launch Device QA Plan — Vyaamikk Diary

**Date:** 2026-07-14
**Builds:** EAS `development-production-otp` (dev client, `EXPO_PUBLIC_APP_MODE=production`) first; repeat critical paths on `preview`/`production`.
**Devices:** one physical iPhone (iOS 17+) and one physical Android (API 30+). Expo Go cannot run these tests (native Firebase modules).

Mark each item ☐ → ✅/❌ per platform. Any ❌ in Authentication or Storage is release-blocking.

---

## 1. Authentication (iPhone AND Android)

| # | Test | Expected |
|---|---|---|
| A1 | Enter valid mobile, request OTP | Real SMS arrives; no mock hint shown anywhere |
| A2 | Correct OTP | Sign-in completes; profile resolves; dashboard or profile-completion appears |
| A3 | Wrong OTP | Calm error ("Incorrect or expired verification code"); no raw Firebase error; loading clears |
| A4 | Expired OTP (wait >10 min) | "Verification session expired" prompt to resend |
| A5 | Airplane mode during OTP send | Recoverable error; retry works after reconnect |
| A6 | Kill network between OTP confirm and resolve callable | Error surfaced; retry does not create a duplicate identity (same UEID on success) |
| A7 | Brand-new number | New account, fresh Vyaamikk ID shown once |
| A8 | Returning user | Same UEID/profile; no duplicate |
| A9 | **JS auth bridge**: immediately after first sign-in, save a Customer Credit record | Save succeeds (proves `mintClientAuthToken` + `signInWithCustomToken` worked); watch for `permission-denied` |
| A10 | Deletion-pending account signs in | Blocked from dashboard; routed to reactivation screen with masked email |
| A11 | Reactivation: elect reactivate → email code → complete | Account restored, same UEID; skipping email verification is impossible |
| A12 | Reactivation attempt with stale OTP (>10 min) | Backend rejects ("Phone verification expired") |
| A13 | Sign out | Both sessions cleared; relaunch lands on sign-in; records require fresh OTP |
| A14 | Cold relaunch while signed in | Session restored without OTP; records still save (bridged JS session persisted); offline relaunch does NOT sign the user out |

## 2. Storage (iPhone AND Android)

| # | Test | Expected |
|---|---|---|
| S1 | Upload new letterhead image (camera and library) | Upload succeeds; letterhead renders; `users/{uid}/letterhead/...` path in console |
| S2 | Legacy letterhead (base64 in `config/letterhead`) account | Background migration runs once; letterhead keeps rendering during migration; base64 removed only after Storage write confirmed |
| S3 | App restart mid-migration | No crash; migration resumes/skips idempotently |
| S4 | Cash Paid photo attach + save | Immediate local preview; upload to `users/{uid}/attachments/{recordId}/...` |
| S5 | Cash Paid photo on slow network (throttle/2G) | No infinite spinner; base record saved even if photo upload fails; retryable message |
| S6 | Interrupt upload (kill app) then retry save | No duplicate Cash Paid record (same clientRecordId); photo retries |
| S7 | PDF regeneration after fresh install (logo from Storage) | Logo downloads and renders; PDF generates without logo if download fails |
| S8 | Cross-user isolation | Signed-in user cannot fetch another uid's storage path (permission denied) |

## 3. Records (each type: Payment Request, Cash Paid, Dukaan record, Dukaan payment, Purchase Order, Material Movement dispatch/receipt, Professional Brief, Letterhead doc)

| # | Test | Expected |
|---|---|---|
| R1 | Create → appears in Saved Records | Yes, once |
| R2 | Rapid double-tap Save | Exactly one record (save lock + synchronous guard) |
| R3 | Edit | Same record updated, no duplicate |
| R4 | Delete | Removed; no orphan in Saved Records |
| R5 | Offline save (diary/composer) | Saved locally; syncs after reconnect; no duplicate after sync |
| R6 | Force PDF failure (e.g. low storage) | Base record saved; retryable PDF message; no permanent spinner; form content preserved on failure |
| R7 | Retry after failed save | Idempotent — no second record, serials not double-allocated (CPV/PO) |

## 4. PDFs

| # | Test | Expected |
|---|---|---|
| P1 | Share each PDF type | Share-sheet filename is human-readable (e.g. `Vyaamikk-Cash-Payment-Voucher-<name>-CPV-2026-27-XXXX-<date>.pdf`), never random-only |
| P2 | Cash Paid Field Voucher + Full Legal Record | Both generate; Full Legal has witness content, **no denomination table** |
| P3 | Old Cash Paid record containing legacy `denominationBreakdown` | Opens, PDF regenerates, field silently ignored, no crash |
| P4 | Receiver mobile on Cash Paid | Mandatory for new records; displayed `+91 XX XXXX XXXX`; old records without it don't crash |
| P5 | Letterhead PDF with logo unavailable | Generates without logo; no failure |
| P6 | Gujarati UI → business entry PDF | Structural labels Gujarati; amounts/dates/mobiles remain en-IN Western Arabic numerals |
| P7 | Large amount (₹ 12,34,56,789.50) | Amount-in-words correct with lakh/crore and paise |
| P8 | Multi-page content (long Dukaan/PO) | Footer on each page; no clipped content |
| P9 | Zero/blank optional identity fields | No `undefined`/`null`/duplicate ₹ in any PDF |

## 5. UI / system

| # | Test | Expected |
|---|---|---|
| U1 | Light and dark mode across tabs | No unreadable text, no white flash on boot |
| U2 | All five languages (en/hi/ta/te/gu) | No blank screens; known English fallback on consent screen and a few labels is expected (see hardening report) — no raw key names |
| U3 | Keyboard over forms | Fields scroll into view; save button reachable |
| U4 | Safe area on notch devices | No clipped headers/tab bar |
| U5 | Tab switching under load | All four tabs (Calendar, You, Saved Records, Settings & Info) respond; labels not truncated |
| U6 | Cold boot | Splash → boot animation → correct first route; never stuck (12 s safety) |
| U7 | Low-memory relaunch (background many apps, return) | Session and draft state intact |
| U8 | Deny location / camera / photos / notifications | Feature-level recoverable message; app never blocks; no permission prompt at first boot |

## 6. Platform-specific

**iPhone only:** APNs silent push for phone auth (real device required); Liquid Glass tab bar renders on iOS 26+, BlurView fallback below; share sheet filename correct in AirDrop/Mail.

**Android only:** Play Integrity path for phone auth on a Play-services device; back gesture doesn't dismiss OTP mid-entry; APK dev build installs and runs; share-sheet filename correct in WhatsApp/Drive.
