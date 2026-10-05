# Play submission readiness (Team 4) — worksheet, not submitted

**Status:** truthful prep only. Do **not** Save, publish, or submit in Play Console from this file.  
**Application SHA:** `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47`  
**Packet SHA (this tree):** Team 4 allowlist + listing corrections integrated on `integration/grin-g1-g5-source` after `86f26b3`. Do not cite `5d5df3d` CI for this tree.  
**Packet E:** billing/public-release gates **not authorized**.  
**Inspection:** 2026-10-06 (IST). Website HTTP 2026-10-05T21:18Z.

Worksheets: `docs/release/packets/PLAY_LISTING_DATA_SAFETY_REVIEWER.md`, `docs/PLAY_REVIEW_SETUP.md`, `docs/release/proposals/team4/DATA_SAFETY_REBUILD.md`.

Legend: **VERIFIED** this session · **SOURCE** in repo · **STALE** older note not re-read · **NOT RUN**.

---

## 1. What binary would be described

| Fact | Status |
|---|---|
| Latest EAS production AAB is **vc22** `72cb7254-…` git `0da2f58`, profile `production` | prior **VERIFIED** (`eas build:list`); **not re-listed** this session (`eas` not on PATH) |
| No EAS AAB of application SHA `5d5df3d` / vc23 / profile `internal-grin` | **SOURCE** this tree; **NOT RUN** EAS inventory this session. **Do not describe a 5d5df3d installed binary — none was built.** |
| Source `versionCode` 23; Play inventory of Active tracks | **NOT RUN** (last Console read 2026-10-01: Internal vc22 Active, Production Inactive, 23 absent — **STALE**) |
| Client purchase-entry / quota-upsell `"0"` on production / preview / `internal-grin` | **SOURCE** `eas.json`. Coordinate with Team 3: freeze `"0"` for the ordinary Internal GRIN binary. A billing-test binary would be a **separate later profile/SHA**. |
| GRIN UI on Play-installed builds | Only if an **`internal-grin` AAB** is uploaded. Ordinary `production` profile does **not** set GRIN flags. Live GRIN Functions were **ABSENT** (2026-10-06). |

**Do not** describe GRIN, paid SKUs, a live 14-day trial, or GST portal verification unless that is the actual submitted AAB **and** those surfaces are reachable on that installed binary.

If the submitted AAB is `internal-grin`, reviewer GRIN admission must be **deliberately arranged** (server admission + deployed GRIN Functions). If GRIN cannot be reached, that AAB **must not advertise GRIN as available**. Tolerating “GRIN may fail; diary still works” on an advertised GRIN release is not acceptable listing copy.

---

## 2. Reviewer onboarding (Play Console sign-in details)

**Do not put founder email, inbox passwords, or email OTPs in Play instructions.** Do not use EAS account mail. Support contact for the listing is `support.vyd@specialsoftwares.com` (in-app default **SOURCE** `src/config/env.ts`).

Canonical copy: `docs/PLAY_REVIEW_SETUP.md` (**SOURCE**). Live Firebase test-phone fixture: **NOT RUN**.

Owner/tester must complete **email verification and profile setup on a production-like build before review**, then confirm You / Calendar / Settings are reachable on a **fresh** sign-in with the test phone. The reviewer must not depend on the founder inbox, email OTP to a private mailbox, or leftover onboarding.

**Restricted?** YES.

**Name:** Test Account for Play Review  

**Username / phone:** `+91 9000000000`  

**Password:** leave **blank** (phone OTP; no password).

**Other information (paste candidate — not submitted):**

```
This app uses Firebase phone OTP. No password exists.

The review account is pre-configured. Email verification and business
profile setup are already complete. You should reach the main app
(You / Calendar / Settings) after sign-in.

1. Enter phone number +91 9000000000
2. Tap Send OTP
3. Enter verification code 654321
4. Continue into the main app. Do not create a new profile. Do not
   use a personal or founder email inbox.

No SMS is sent when the Firebase test-phone fixture is present in project vyaamikk-diary.
Do not confirm account deletion. Do not change the mobile number.
Location and notifications are optional; Deny is acceptable for core diary/PDF review.
```

**If and only if** the submitted AAB is `internal-grin` **and** GRIN is actually reachable for that reviewer (admission arranged; Functions present), append:

> GRIN (goods receipt) is enabled for this internal test account. You may create a synthetic receipt and attach a small test image. You do not need to complete a GST filing.

If GRIN is hidden **or** cannot be reached on that AAB: **omit** that paragraph **and do not advertise GRIN** in the listing.

**Checkbox** “Sign-in details provide full access including premium or paid content”: judge from **actual accessible functionality on the intended installed binary**, not from purchase-entry flags alone.

On the intended Internal GRIN / production-profile binary (purchase-entry `"0"`, live `PLAY_BILLING_ENABLED` key **absent**, no client trial-start callable, 14-day trial **source-only**, GRIN Functions **ABSENT** unless a later Internal-GRIN binary + admission is arranged): **do not check**. Reviewers do not receive paid plans, a live trial grant, or GRIN as a working premium surface.

Conflict: `docs/play-review/PLAY_CONSOLE_SIGN_IN_DETAILS_TEMPLATE.md` still has a “linked review email” placeholder — **do not paste** that into Console. `docs/play-review/PLAY_REVIEW_ACCOUNT_SETUP_RUNBOOK.md` email step is owner-private, not Play reviewer copy.

Owner must still: configure the Firebase test phone live (**NOT RUN**); pre-onboard (phone + **verified email** + completed profile) on a production-like build; run `npm run review:verify-account` as a **partial** profile check only. Device verification of the **intended installed binary** is **NOT RUN** — none built for `5d5df3d`.

---

## 3. Store listing assets

| Asset | Status |
|---|---|
| App name / package | **SOURCE** `app.json`: Vyaamikk Diary / `com.specialsoftwares.vyaamikkdiary` |
| Adaptive / launcher icons | **SOURCE** `app.json` → `assets/icon.png`, `assets/android-icon-*` |
| Play 512 icon / feature graphic | **VERIFIED git-tracked in this candidate** (also present at application SHA `5d5df3d`): `store/play-icon-512.png` sha256 `cc550cb8450c62d5b991da56d0e5989db9ee14fb7d971b679848728caf401f5a`; `store/play-feature-graphic.png` sha256 `b17f8082b5b7f025ce0ecfc23d0dd096c8997a945f5960198e135b27d10dddd1`; `store/play-icon-512-masked-preview.png` sha256 `a0c18f35fde4a2585fb0a6d6131441552c7a784992bebee7ae248b081fd51a30`. Prior worksheet claim that they were not in the worktree was **wrong**. Play Console upload **NOT RUN**. |
| Phone screenshots | `public-site/assets/screenshots/` + `screenshots.manifest.json`. **Do not upload** `dashboard-en`, `dashboard-hi`, `dashboard-ta`, `dashboard-te`, `dashboard-gu` (`safeForPublic: false` — demo profile / company names). Public-safe set includes location-access-en, new-record-*, statutory-info-en. **NOT RUN** whether any are already in Play Console. |
| Short / full description | Draft: `docs/release/play-listing/DRAFTS.md` (**SOURCE**, not submitted). Do **not** claim live GSTN/GSTR-2B/EWB verification, ITC, originals bundled in packs, encrypted PDF backup, GRIN-in-SKU, unbounded evidence storage, or a **live** 14-day trial (`PLAY_LISTING_DATA_SAFETY_REVIEWER.md`, `DATA_SAFETY_REBUILD.md`). |
| Website “Launching on iOS and Android” | **VERIFIED** on live `.com` (JSON-LD). Align listing so it does not imply a public production track if only Internal exists (**Play track NOT RUN**). |

Accurate GRIN addendum **only if GRIN is visible and reachable on the submitted build**:

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

Authoritative rebuild from actual flows: `docs/release/proposals/team4/DATA_SAFETY_REBUILD.md`. Do **not** infer “no financial data” from disabled Play purchases.

Declare when the submitted binary actually does it:

| Type | Collect | Shared | Purpose | Notes |
|---|---|---|---|---|
| Name | Yes | Firebase as infrastructure / service provider — **not** automatically “third-party sharing”; not sold | Account | Required for dashboard |
| Phone | Yes | Firebase Auth / SMS processors | Account | |
| User IDs | Yes (uid, UEID) | Firebase | Account | |
| Email | Yes — **required** to finish onboarding (`isPreDashboardOnboardingIncomplete` / verified email). In-app privacy still calls email “optional” — **do not copy that into Play as current fact**. | Firebase + mail vendor when verification is sent | Account | |
| Photos | If user attaches | Firebase Storage | App functionality | Letterhead / cash-paid / customer; **and GRIN originals if that AAB uploads** |
| Files and docs | Yes (user PDFs / attachments) | Same | App functionality | Tax PDFs are user files, not a separate Play type |
| Location approx/precise | If enabled | Firestore on saved records | App functionality | Foreground only (`app.json` permissions; no background) |
| App info / crash diagnostics | Possible | Firebase Crashlytics **only if user consents** | Diagnostics | `app.json` plugin `@react-native-firebase/crashlytics`; `firebase.json` `crashlytics_auto_collection_enabled: false`; `TelemetryConsentHost` after onboarding. Console collection **NOT RUN**. |
| Financial (user-entered diary) | **Yes** — amounts, credit ledgers, payment requests, bank/IFSC/UPI the user types, GSTIN, PO/freight amounts, evidence fields | Firebase infrastructure; user-initiated share sheet is separate | App functionality | Independent of Play Billing |
| Financial (Play purchases / purchase history) | **Not on this binary** while purchase-entry `"0"` and `PLAY_BILLING_ENABLED` absent | — | — | Do not declare in-app subscriptions as collected until Packet E is live |
| Sold | No | — | — | |

Encrypted in transit: HTTPS intended — **EXTERNAL**. Encrypted at rest: Google default — **EXTERNAL**. Independent security review / accredited audit: **no**. Encrypted backup: **not claimed**.

**GRIN delta:** no new Play data-type **category**, but owner-selected PDFs/images upload under the uid. Until Packet D retention is implemented, **do not** claim GRIN Storage originals are deleted with the account.

Website analytics is **not an app Data safety row**. Live `/privacy` loads `/~flock.js` with `data-proxy-url="/~api/analytics"`. Browser POSTs to first-party `/~api/analytics` (**VERIFIED** POST **202** Accepted; GET **404**). The library is Tinybird; default third-party `api.tinybird.co` is unused while the proxy attribute is present. Server-side forward from `/~api/analytics` is **UNKNOWN**. The **app does not load flock.js**. See DATA_SAFETY_REBUILD.md.

---

## 6. Privacy policy

| Surface | Finding | Status |
|---|---|---|
| Default URL | `https://vyaamikk.specialsoftwares.com/privacy` | **SOURCE** `src/config/env.ts` |
| Live HTTP | **200**, `<title>Privacy Policy \| Vyaamikk Diary</title>` | **VERIFIED** |
| Live effective date | **15 July 2026** | **VERIFIED** on page |
| In-app `LEGAL_EFFECTIVE_DATE` | **2026-07-27** | **SOURCE** `src/config/legal.ts` — **mismatch with live site**. Preserve the in-app 2026-07-27 baseline; **do not backdate** new policy terms. |
| `docs/legal/PRIVACY_POLICY.md` | Effective 2026-07-01 placeholder; `.in` support URLs | **STALE** vs `.com` defaults |
| Operator | Ananya Engineered Industrial Components & Pay Systems LLP / SPECIAL SOFTWARES | **SOURCE** `src/config/brand.ts`; **VERIFIED** on live privacy |
| Grievance | In-app `grievance@specialsoftwares.in` + named partner (`legal.ts`); live privacy grievance mailto is **support.vyd@…** | **inconsistent** — counsel |
| `/auth` | Must never be Play/privacy login | **SOURCE** `publicLinks.ts` |

Play Console privacy URL should be the live `.com` page. Owner/counsel must reconcile dates and grievance mailbox before treating this as submission-ready.

---

## 7. Account-deletion disclosures

| Item | Finding | Status |
|---|---|---|
| In-app | Settings → Delete Account & Data; **15-day** grace (`DELETION_GRACE_MS`) | **SOURCE** |
| Web URL | `https://vyaamikk.specialsoftwares.com/delete-account` | **SOURCE**; **VERIFIED** HTTP 200 |
| Web mechanism | In-app path **plus mailto** `support.vyd@specialsoftwares.com?subject=Vyaamikk%20Diary%3A%20Account%20deletion%20request`. Play allows a customer-service email. Identifies the app in the subject and the operator (Ananya Engineered Industrial Components & Pay Systems LLP) on the page. **Do not treat mailto as automatically defective. Do not invent a form.** Inbox monitoring / SLA: **NOT RUN**. | **VERIFIED** page HTML |
| What web page says is deleted | Identity, profile, records, generated documents, letterhead, uploaded logo assets after 15 days | **VERIFIED** copy. Source: profile logos are **device-local** — possible over-claim |
| Storage prefixes in deletion job | `letterhead`, `attachments`, `pdfs` only | **SOURCE** |
| GRIN `users/{uid}/grinEvidence/**` | **Not** in deletion prefixes | **SOURCE** |
| Firestore GRIN / billing subcollections | **Not** in `USER_SUBCOLLECTIONS` purge list | **SOURCE** |
| Live deletion job behaviour | **NOT RUN** | do not execute deletion |
| Owner 180-day hold request | **Not** implemented; **not** Play/legal approved. See `docs/release/proposals/team4/DELETION_WINDOW_180_PLAY.md`. | **SOURCE** proposal only |

Play Data safety / account deletion answers: in-app **yes**; web URL **yes**; additional retention **yes** (anti-abuse indexes, device residual, shared PDFs, **GRIN originals until Packet D**).

---

## 8. Gated-feature access arrangement

| Feature | Gate | What reviewers can do | Status |
|---|---|---|---|
| Core diary / PDF / calendar | Signed-in active account with **verified email + completed profile** (owner pre-onboards) | Must work with the test phone on the intended binary | **SOURCE**; **intended 5d5df3d binary not built**; device **NOT RUN** |
| Paid plans / IAP | Client `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED === "1"`; server `PLAY_BILLING_ENABLED === "true"` plus fail-closed `PLAY_BILLING_TESTER_UIDS` | **Closed** on intended Internal binary. Settings shows purchase-entry closed. Restore may still call validate and fail closed on server. | **SOURCE**; live enablement key **absent** (2026-10-06) |
| 14-day Professional trial | Server `grantProfessionalTrial`; `CLIENT_MANUAL_TRIAL_START_SUPPORTED === false`; no client callable; not wired from identity create | **Source-only.** Do not tell reviewers or the listing that a live trial is granted. | **SOURCE** |
| Quota upsell sheet | independent `"1"` flag | Off on these EAS profiles | **SOURCE** |
| GRIN | Client flags + **server** admission + Functions `GRIN_GOODS_EVIDENCE_FUNCTIONS` | Live GRIN callables **ABSENT**. Visible UI only on `internal-grin` AAB (**not built** for `5d5df3d`). Do not advertise GRIN unless it is reachable. | **VERIFIED** Functions list 2026-10-06; **SOURCE** Packet B |
| Billing details / GSTIN | `UPDATE_BILLING_DETAILS_ENABLED` | Flag absent live; GSTIN format-only, never client-verified GSTN/2B/EWB | **SOURCE** + live env 2026-10-06 |

Do not check Play “full access including premium” unless the reviewer can actually use paid/premium content on the submitted installed binary.

---

## 9. Pricing / renewal terms

| Item | Finding | Status |
|---|---|---|
| Packet D commercial choice | **not recorded** | **SOURCE** `D_OWNER_POLICY_OPTIONS.md` |
| In-app copy | “Prices shown are from Google Play”; manage/cancel in Google Play; 14-day trial is **policy/source**, not a live store SKU and not a client-startable grant | **SOURCE** `src/i18n/locales/en.ts`, `upgradePresentation.ts` |
| Catalog paise | Functions `expectedPriceInPaise` — **not** display authority | **SOURCE** `functions/src/billing/products.ts` |
| Live Play prices / base plans / catalog | **NOT RUN** this session. Exact blocker: no Play Console session; `gcloud` absent; no Android Publisher client; **Firebase tokens must not be used as Play Android Publisher**. | **NOT RUN** |
| Public listing paid claims | Forbidden until Packet D + Packet E real-store acceptance | **SOURCE** Packet E |
| Merchant KYC | Owner/Play payments profile | **NOT RUN** this session |

---

## 10. Readiness verdict (not a submit authorization)

Play **Internal Testing** worksheet can be drafted from `PLAY_REVIEW_SETUP.md` + this file **if** the owner freezes the AAB class (production vs `internal-grin`), **pre-completes reviewer email+profile**, and GRIN copy matches **reachable** behaviour. It is **not** submission-ready as a paid public listing.

Blockers to treat as open (non-exhaustive):

1. No binary of SHA `5d5df3d` / vc23 / `internal-grin` on EAS — **cannot verify the intended installed binary**.
2. Purchase-entry stays `"0"`; Packet E real-store matrix **NOT RUN**; Play catalog **NOT RUN** (no Publisher/Console route).
3. Privacy **date mismatch** (site 15 Jul 2026 vs app 27 Jul 2026). Do not backdate the in-app 2026-07-27 baseline.
4. GRIN files (and GRIN/billing Firestore collections) not in the deletion job; listing/Data safety must not claim they vanish with the account.
5. Website first-party `/~api/analytics` ingest is live (POST 202); privacy copy says no third-party analytics. Server-side Tinybird forward **UNKNOWN**. Not an app SDK.
6. Play Console inventory, Data safety form, and listing Save: **NOT RUN** / not submitted.
7. Reviewer fixture live in Firebase + pre-onboarded email/profile: **NOT RUN**.
8. In-app privacy still calls email optional; onboarding **requires** verified email.

Human sign-off (owner, counsel, Play Console operator) is still required. This document is not that sign-off.
