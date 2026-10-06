# Data safety rebuild — actual flows (Team 4)

**Status:** worksheet for Play Data safety. **Not submitted.** Not a privacy-policy
rewrite. In-app legal baseline remains `LEGAL_EFFECTIVE_DATE` **2026-07-27**
(`src/config/legal.ts`). Do not backdate new terms onto that constant.

**Application SHA described:** `520f9f9` (no installed binary of that SHA).
Prior `5d5df3d` pin is STALE for this freeze. Combined READ-ONLY `aea65c1`.
CI `37425360211` on `0d7aa17`.
**Live website fetch:** 2026-10-05T21:18Z.

Legend: **COLLECTED** by the app/backend · **SHARED** only when Play’s sharing
definition is met · **PROCESSOR** Firebase/Google acting on instructions ·
**NOT APP** website-only.

Do **not** claim encrypted backup, accredited/independent audit, or “no
financial data because purchases are disabled.”

---

## 1. Collected vs shared (app)

Play “share” is not the same as “a processor stored a byte.” Firebase Auth,
Firestore, Storage, Functions, and (if consented) Crashlytics are **Google
operating as infrastructure / service providers** for this app. This rebuild
does **not** automatically tick Play “shared with third parties” solely because
Firebase processes data. Counsel must map Play’s current service-provider
exception. **Sold: no.** User-initiated OS share sheet / WhatsApp / email of a
PDF is user-initiated, not developer sharing.

| Play type | Collected? | Required? | Shared (Play sense) | Purpose | Evidence |
|---|---|---|---|---|---|
| Name | Yes (`displayName`, business name) | Yes for completed profile | Processor (Firestore), not sold | Account | Onboarding + dashboard |
| Phone | Yes (E.164) | Yes (Auth) | Processor (Firebase Auth / SMS) | Account | Phone OTP |
| User IDs | Yes (Auth uid, UEID) | Yes | Processor | Account | Identity Functions |
| Email | Yes, **verified business email** | **Required to reach dashboard** (`isPreDashboardOnboardingIncomplete` / `hasAuthoritativeVerifiedEmail`). In-app privacy still says email is optional — that copy is **stale vs onboarding**. Live `/privacy` says “where applicable a verified business email.” | Processor (Firebase + mail vendor when a verification email is sent) | Account / recovery | Wizard `emailEntry` / `emailOtp` |
| Photos | If user attaches | Optional | Processor (Storage) when uploaded | App functionality | Letterhead, cash-paid, customer; GRIN originals **if** that AAB uploads |
| Files and docs | User PDFs / attachments | Optional | Processor when uploaded | App functionality | `users/{uid}/pdfs`, `attachments`; GRIN `grinEvidence` if enabled |
| Approx/precise location | If user enables footprint | Optional (Deny allowed) | Processor on saved records | App functionality | Foreground only; no background permission |
| App interactions / diagnostics | Crash diagnostics **if consented** | Optional (decline keeps collection off) | Processor (Crashlytics) **only after consent** | Diagnostics | See §4 |
| Financial — Play purchases | **No on intended binary** | — | — | — | purchase-entry `"0"`; `PLAY_BILLING_ENABLED` key absent live |
| Financial — other | **Yes** | Feature-dependent; diary use implies user-entered amounts | Processor (Firestore); not a card network | App functionality | See §2 |
| User payment info (bank) | **Yes if the user enters it** on a payment request | Optional per record | Processor if synced; also appears on user-generated PDFs they share | App functionality | `PaymentBankDetails` (account holder, bank, account number, IFSC, UPI) |
| Device IDs for ads | No advertising SDK | — | — | — | Privacy + crash reporter |

Encrypted in transit: HTTPS intended (**EXTERNAL** confirmation of Google defaults). Encrypted at rest: Google default (**EXTERNAL**). Independent review: **no**.

---

## 2. Financial and evidence fields (independent of IAP)

Disabled Play Billing does **not** mean the app collects no financial data.

**SOURCE** (always user-entered business records, not a payment gateway):

- Diary / payment requests: `pendingAmount`, optional `PaymentBankDetails`.
- Cash given / related diary amounts (`BusinessCashGivenPayload` and siblings).
- Customer credit / Dukaan: sale amounts, down payment, instalments, received
  `payments[]`, interest/fee configuration, `paymentMode` / `paymentReference`.
  `paymentProofUri` is **device-local and never synced**.
- Purchase orders: line `amount`, GST split from party GSTINs (format, not
  GSTN verification), `paymentTerms`.
- Professional packs: `amountInvolved`, `totalAmount`, `amountDue`.
- Freight: `freightAmount`.
- Profile / reminders: GSTIN (user-typed; `verifyGstinManual` is
  production-disabled / format-only). E-way bill numbers on freight are
  user-typed, **not** GST-verified.
- GRIN evidence (if that AAB): owner-selected PDF/image originals — files, not
  a GST return.

**Do not declare live GST/2B/EWB portal verification.** Statutory-info screen
is informational due-date copy.

**14-day trial:** `TRIAL_DURATION_DAYS = 14` and `grantProfessionalTrial` exist
in Functions source. `CLIENT_MANUAL_TRIAL_START_SUPPORTED === false`; there is
**no** client callable; identity create does **not** grant trial. Do **not**
declare a live trial or paid entitlement.

Quota: free cap 25 only while `quotaEnforcementEnabled === true` on
server-written `subscription/status` (Rules default off). Not proof of a live
paid plan.

---

## 3. Firebase as service-provider exception

Evaluate, do not auto-tick “shared”:

| Surface | Role | Notes |
|---|---|---|
| Firebase Auth | Processor | Phone OTP; SMS via Google/carrier |
| Firestore | Processor | Profile, records, indexes |
| Firebase Storage | Processor | Letterhead / attachments / pdfs; GRIN originals if used |
| Cloud Functions | Processor | Identity, email, deletion, (fail-closed) billing/GST/GRIN |
| Crashlytics | Processor **if consented** | Off until consent; truncated uid only |
| EAS | Build/OTA processor | Not runtime diary storage |
| Google Play | Platform | Distribution; IAP **not live** on this binary |
| Email vendor | Processor when verification/recovery mail is sent | |

Website Cloudflare `__cf_bm` and first-party `/~api/analytics` are **NOT APP**.
Do not copy them into the mobile Data safety form unless the **installed app**
loads them (it does not load `flock.js`).

---

## 4. Crashlytics consent

- `firebase.json` → `crashlytics_auto_collection_enabled: false`.
- Plugin: `app.json` `@react-native-firebase/crashlytics`.
- Runtime: `setCrashReportingEnabled` no-ops until true;
  `TelemetryConsentHost` only on the main tab shell after
  `profileCompletedAt`; decline writes consent false and keeps collection off.
- Settings: `CrashReportsPreferenceRow`.
- Mapping docs that say “no Crashlytics” are **STALE**.
- Live Console collection state: **NOT RUN**.

---

## 5. Email optional vs required

| Surface | Claim | Actual |
|---|---|---|
| In-app privacy (`documents.ts`) | Email is an optional feature | **Stale vs wizard** |
| Wizard / `AuthFlowGate` | Verified email required before dashboard | **SOURCE** |
| `resolveAuthOnboardingHref` | Allows `emailRemediationRequired` through if profile already completed | Narrower; production gate is `isPreDashboardOnboardingIncomplete` |
| Live `/privacy` | “where applicable a verified business email” | Softened vs app |
| Play Data safety | Required for account | Declare **required** for this binary’s onboarding |

Reviewer accounts must have email **already verified** before Play review so
the reviewer never uses a founder inbox.

---

## 6. Website analytics (separate from the app)

Live `/privacy` (HTTP 200) includes:

```html
<script defer src="/~flock.js" data-proxy-url="/~api/analytics"></script>
```

| Check | Result |
|---|---|
| `GET /~flock.js` | **200**, 21296 bytes, `text/javascript`. Tinybird tracker (web-vitals + `page_hit`). Filename is **not** proof of third-party analytics. |
| Browser destination with `data-proxy-url` | First-party `POST /~api/analytics` (not `api.tinybird.co`) |
| `GET /~api/analytics` | **404** |
| `POST /~api/analytics` (empty Tinybird-shaped JSON) | **202** `Accepted` — ingest is live |
| Default Tinybird URL in the script | Present as fallback if proxy attributes are missing |
| Server-side forward to Tinybird / others | **UNKNOWN** (202 does not reveal upstream; **do not claim flock.js forwards solely from 202**) |
| App load of flock.js | **None** (`src/` has no flock/tinybird) |
| Live privacy copy | “This marketing website itself does not load third-party analytics…” — **browser** destination is first-party; **processor** behind the proxy is unknown |
| Cloudflare `__cf_bm` | CDN bot-management cookie on HTML responses — hosting, not an app SDK |

Do not publish website changes from this file.

---

## 7. Account deletion (implemented)

See `DELETION_15_VS_180_OWNER_SHEET.md` (three facts, do not collapse:
implemented **15 days**; owner requested **180 days**, not legally/Play
approved; public-approved policy **UNRESOLVED**). Do not record 15 as the
owner’s choice. Changing `DELETION_GRACE_MS` is not a safe 180-day policy.
Mailto / support-email web path is documented and identifies the
developer/app; Play allows it. Do not treat mailto as inherently defective.
Do not build a form. GRIN Storage and several Firestore collections are
**not** in the purge lists — do not claim full erasure of those objects.
**P8 remains open.** Do not flip `INCLUDE_GRIN_IN_ACCOUNT_PURGE`.
Storage GiB (separate owner write): `STORAGE_OWNER_CHOICE.md`.
