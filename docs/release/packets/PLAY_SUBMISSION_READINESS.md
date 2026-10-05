# Play submission readiness (Team 4) — worksheet, not submitted

**Status:** truthful prep only. Do **not** Save, publish, or submit in Play Console from this file.  
**Application SHA:** `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47`  
**Packet E:** billing/public-release gates **not authorized**.  
**Inspection:** 2026-10-05T20:45Z–20:49Z. Git tree not edited.

Worksheets: `docs/release/packets/PLAY_LISTING_DATA_SAFETY_REVIEWER.md`, `docs/PLAY_REVIEW_SETUP.md`, `docs/privacy-legal-audit/PLAY_DATA_SAFETY_PROVISIONAL_ANSWERS.md`.

Legend: **VERIFIED** this session · **SOURCE** in repo · **STALE** older note not re-read · **NOT RUN**.

---

## 1. What binary would be described

| Fact | Status |
|---|---|
| Latest EAS production AAB is **vc22** `72cb7254-…` git `0da2f58`, profile `production` | **VERIFIED** (`eas build:list`) |
| No EAS `internal-grin` AAB; no vc23 artifact | **VERIFIED** |
| Source `versionCode` 23; Play inventory of Active tracks | **NOT RUN** (last Console read 2026-10-01: Internal vc22 Active, Production Inactive, 23 absent — **STALE**) |
| Client purchase-entry / quota-upsell `"0"` on production / preview / `internal-grin` | **SOURCE** `eas.json` at SHA; **VERIFIED** `eas config` profile env |
| GRIN UI on Play-installed builds | Only if an **`internal-grin` AAB** is uploaded. Ordinary `production` profile does **not** set GRIN flags. Promoting `internal-grin` to production would show GRIN **UI**; server admission + absent GRIN Functions still fail closed (`PACKET_C`) |

**Do not** describe GRIN, paid SKUs, or GST portal verification unless that is the actual submitted AAB.

---

## 2. Reviewer onboarding (Play Console sign-in details)

**Do not put founder email, inbox passwords, or email OTPs in Play instructions.** Do not use EAS account mail. Support contact for the listing is `support.vyd@specialsoftwares.com` (EAS remote plain-text **VERIFIED**; in-app default **SOURCE** `src/config/env.ts`).

Canonical copy: `docs/PLAY_REVIEW_SETUP.md` (**SOURCE**). Live Firebase test-phone fixture: **NOT RUN**.

**Restricted?** YES.

**Name:** Test Account for Play Review  

**Username / phone:** `+91 9000000000`  

**Password:** leave **blank** (phone OTP; no password).

**Other information (paste candidate — not submitted):**

```
This app uses Firebase phone OTP. No password exists.

1. Enter phone number +91 9000000000
2. Tap Send OTP
3. Enter verification code 654321
4. Complete any remaining onboarding until You / Calendar / Settings are reachable

No SMS is sent when the Firebase test-phone fixture is present in project vyaamikk-diary.
Do not confirm account deletion. Do not change the mobile number.
Location and notifications are optional; Deny is acceptable for core diary/PDF review.
```

**If and only if** the submitted AAB is `internal-grin` (GRIN hub visible), append Packet listing text:

> GRIN (goods receipt) may appear after onboarding. You may create a synthetic receipt and attach a small test image. You do not need to complete a GST filing. If register fails, the account may not be admitted for this test feature; diary Save/PDF still demonstrate core app function.

If GRIN is hidden: **omit** that paragraph.

**Checkbox** “Sign-in details provide full access including premium or paid content”: **do not check** while purchase-entry is `"0"` and billing Functions are fail-closed (no paid content on this binary).

Conflict: `docs/play-review/PLAY_CONSOLE_SIGN_IN_DETAILS_TEMPLATE.md` still has a “linked review email” placeholder — **do not paste** that into Console. `docs/play-review/PLAY_REVIEW_ACCOUNT_SETUP_RUNBOOK.md` email step is owner-private, not Play reviewer copy.

Owner must still: configure the Firebase test phone live (**NOT RUN**); pre-onboard on a production-like build; run `npm run review:verify-account` as a **partial** profile check only.

---

## 3. Store listing assets

| Asset | Status |
|---|---|
| App name / package | **SOURCE** `app.json`: Vyaamikk Diary / `com.specialsoftwares.vyaamikkdiary` |
| Adaptive / launcher icons | **SOURCE** `app.json` → `assets/icon.png`, `assets/android-icon-*` |
| Play 512 icon / feature graphic | **Not in this worktree.** Untracked files exist only in a different workspace `store/play-icon-512.png`, `store/play-feature-graphic.png` — **not** SHA evidence. Treat as **NOT in candidate tree**. |
| Phone screenshots | `public-site/assets/screenshots/` + `screenshots.manifest.json`. Several dashboard shots `safeForPublic: false` (demo names). **NOT RUN** whether they are already in Play Console. |
| Short / full description | Draft: `docs/release/play-listing/DRAFTS.md` (**SOURCE**, not submitted). Do **not** claim live GSTN/GSTR-2B/EWB verification, ITC, originals bundled in packs, encrypted PDF backup, GRIN-in-SKU, or unbounded evidence storage (`PLAY_LISTING_DATA_SAFETY_REVIEWER.md`). |
| Website “Launching on iOS and Android” | **VERIFIED** on live `.com` meta/JSON-LD. Align listing so it does not imply a public production track if only Internal exists (**Play track NOT RUN**). |

Accurate GRIN addendum **only if GRIN is visible on the submitted build** (from Packet listing notes):

> Goods receipts (GRIN) are an optional internal-testing workflow for recording goods received and attaching original PDF/image evidence. Evidence packs are summaries; original files stay in app storage. The app does not verify GST returns, e-way bills, or ITC eligibility.

---

## 4. Audience

| Question | Answer | Status |
|---|---|---|
| Target | Indian business owners / MSMEs; diary, cash, credit, packs, letterhead | **SOURCE** drafts + live privacy “Who we are” |
| Age | 18+; not directed at children | **SOURCE** `src/content/legal/documents.ts` Children; **VERIFIED** live `/privacy` §15 |
| Category | Business | **SOURCE** `DRAFTS.md` |
| Ads / kids | No advertising SDK claimed in-app | **SOURCE** privacy + crash reporter; Play form **NOT RUN** |

---

## 5. Data safety (provisional; not submitted)

Base worksheet: `docs/privacy-legal-audit/PLAY_DATA_SAFETY_PROVISIONAL_ANSWERS.md` (tip `f1019b6`) — **STALE vs current Crashlytics wiring**.

Declare when the submitted binary actually does it:

| Type | Collect | Shared | Purpose | Notes |
|---|---|---|---|---|
| Name | Yes | Firebase infra, not sold | Account | Required for dashboard |
| Phone | Yes | Firebase Auth / SMS | Account | |
| User IDs | Yes (uid, UEID) | Firebase | Account | |
| Email | If provided | Firebase + mail vendor | Account / recovery | |
| Photos | If user attaches | Firebase Storage | App functionality | Letterhead / cash-paid / customer; **and GRIN originals if that AAB uploads** |
| Files and docs | Yes (user PDFs / attachments) | Same | App functionality | Tax PDFs are user files, not a separate Play type |
| Location approx/precise | If enabled | Firestore on saved records | App functionality | Foreground only (`app.json` permissions; no background) |
| App info / crash diagnostics | Possible | Firebase Crashlytics **if user consents** | Diagnostics | `app.json` plugin `@react-native-firebase/crashlytics`; `firebase.json` `crashlytics_auto_collection_enabled: false`; `src/services/telemetry/crashReporter.ts`. Mapping doc “no Crashlytics” is **STALE**. Console collection **NOT RUN**. |
| Financial (Play purchases) | **Not on this binary** while purchase-entry `"0"` | — | — | Do not declare in-app subscriptions as collected until Packet E is live |
| Sold | No | — | — | |

Encrypted in transit: HTTPS intended — **EXTERNAL** still. Encrypted at rest: Google default — **EXTERNAL**. Independent security review: no.

**GRIN delta:** no new Play data-type **category**, but owner-selected PDFs/images upload under the uid. Until Packet D retention is implemented, **do not** claim GRIN Storage originals are deleted with the account. Safer Internal text: goods-evidence files used in internal testing may be retained until testers are wiped or a deletion policy ships.

Website Data safety extra: live `/privacy` HTML includes `<script defer src="/~flock.js" data-proxy-url="/~api/analytics">` while the same page claims the marketing site does not load third-party analytics. Treat website analytics as **EXTERNAL / contradictory** until owner/Lovable audit (`docs/privacy-legal-audit/WEBSITE_TRACKING_AUDIT_GAPS.md`).

---

## 6. Privacy policy

| Surface | Finding | Status |
|---|---|---|
| Default URL | `https://vyaamikk.specialsoftwares.com/privacy` | **SOURCE** `src/config/env.ts`; EAS Sensitive name present (value unread) |
| Live HTTP | **200**, `<title>Privacy Policy \| Vyaamikk Diary</title>` | **VERIFIED** |
| Live effective date | **15 July 2026** | **VERIFIED** on page |
| In-app `LEGAL_EFFECTIVE_DATE` | **2026-07-27** | **SOURCE** `src/config/legal.ts` — **mismatch with live site** |
| `docs/legal/PRIVACY_POLICY.md` | Effective 2026-07-01 placeholder; `.in` support URLs | **STALE** vs `.com` defaults |
| Operator | Ananya Engineered Industrial Components & Pay Systems LLP / SPECIAL SOFTWARES | **SOURCE** `src/config/brand.ts`; **VERIFIED** on live privacy JSON-LD |
| Grievance | In-app `grievance@specialsoftwares.in` + named partner (`legal.ts`); live privacy grievance mailto is **support.vyd@…** | **inconsistent** — counsel |
| `/auth` | Must never be Play/privacy login | **SOURCE** `publicLinks.ts` |

Play Console privacy URL should be the live `.com` page. Owner/counsel must reconcile dates and grievance mailbox before treating this as submission-ready.

---

## 7. Account-deletion disclosures

| Item | Finding | Status |
|---|---|---|
| In-app | Settings → Delete Account & Data; 15-day grace | **SOURCE** deletion Functions + copy |
| Web URL | `https://vyaamikk.specialsoftwares.com/delete-account` | **SOURCE**; **VERIFIED** HTTP 200, title “Delete your Vyaamikk Diary account” |
| Web mechanism | In-app instructions **plus mailto** `support.vyd@specialsoftwares.com` (not a ticket form) | **VERIFIED** page HTML |
| What web page says is deleted | Identity, profile, records, generated documents, letterhead, uploaded logo assets after 15 days | **VERIFIED** copy. Source: profile logos are **device-local** (`functions/src/deletion/userOwnedStoragePaths.ts`) — possible over-claim |
| Storage prefixes in deletion job | `letterhead`, `attachments`, `pdfs` only | **SOURCE** |
| GRIN `users/{uid}/grinEvidence/**` | **Not** in deletion prefixes | **SOURCE** (Packet D / listing notes) |
| Live deletion job behaviour | **NOT RUN** | do not execute deletion |

Play Data safety / account deletion answers: in-app **yes**; web URL **yes**; additional retention **yes** (anti-abuse indexes, device residual, shared PDFs, **GRIN originals until Packet D**).

---

## 8. Gated-feature access arrangement

| Feature | Gate | What reviewers can do | Status |
|---|---|---|---|
| Core diary / PDF / calendar | Signed-in active account | Must work with the test phone | **SOURCE**; device **NOT RUN** |
| Paid plans / IAP | `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED === "1"`; server `PLAY_BILLING_ENABLED === "true"` | **Closed** on intended Internal binary. Settings shows `billing.management.purchaseEntryClosed`. Restore may still call validate and fail closed on server. | **SOURCE** + live Functions env keys **absent** |
| Quota upsell sheet | independent `"1"` flag | Off on these EAS profiles | **SOURCE** |
| GRIN | Client flags + **server** `goodsEvidenceAdmission/runtime` + Functions `GRIN_GOODS_EVIDENCE_FUNCTIONS` | Live GRIN callables **ABSENT**. Visible UI only on `internal-grin` AAB (not built). Non-admitted → honest unavailable, not a GST number | **VERIFIED** Functions list; **SOURCE** Packet B |
| Billing details / GSTIN | `UPDATE_BILLING_DETAILS_ENABLED` | Flag absent live; GSTIN format-only, never client-verified | **SOURCE** + live env |

Do not check Play “full access including premium” while purchases are closed. Do not promise GRIN as a general feature on a production-profile AAB.

---

## 9. Pricing / renewal terms

| Item | Finding | Status |
|---|---|---|
| Packet D commercial choice | **not recorded** (include in diary plan vs separate GRIN SKU vs invite-only) | **SOURCE** `docs/release/packets/D_OWNER_POLICY_OPTIONS.md` |
| In-app copy | “Prices shown are from Google Play”; manage/cancel in Google Play; 14-day trial is **policy**, not a store SKU | **SOURCE** `src/i18n/locales/en.ts` |
| Catalog paise | Functions `expectedPriceInPaise` (e.g. starter monthly 9900) — **not** display authority | **SOURCE** `functions/src/billing/products.ts` |
| Live Play prices / base plans | **NOT RUN** | |
| Public listing paid claims | Forbidden until Packet D + Packet E real-store acceptance | **SOURCE** Packet E |
| Merchant KYC | Owner/Play payments profile; pending owner confirmation | **STALE** owner note 2026-09-20; **NOT RUN** this session |

Subscription management URL helper is ready (`playSubscriptionsUrl.ts`) but must not be described as a live paid SKU.

---

## 10. Readiness verdict (not a submit authorization)

Play **Internal Testing** worksheet can be drafted from `PLAY_REVIEW_SETUP.md` + this file **if** the owner freezes the AAB class (production vs `internal-grin`) and GRIN copy matches that AAB. It is **not** submission-ready as a paid public listing.

Blockers to treat as open (non-exhaustive):

1. No binary of SHA `5d5df3d` / vc23 / `internal-grin` on EAS (**VERIFIED**).
2. Purchase-entry stays `"0"`; Packet E real-store matrix **NOT RUN**.
3. Privacy **date mismatch** (site 15 Jul 2026 vs app 27 Jul 2026).
4. GRIN files not in deletion job; listing/Data safety must not claim they vanish with the account.
5. Website `flock.js` analytics vs privacy “no third-party analytics” wording.
6. Play Console inventory, Data safety form, and listing Save: **NOT RUN** / not submitted.
7. Reviewer fixture live in Firebase: **NOT RUN**.

Human sign-off (owner, counsel, Play Console operator) is still required. This document is not that sign-off.
