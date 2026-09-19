# Internal candidate manifest and device runbook (REL-13)

This is a runbook, not a claim that the tests ran. No merge, native/EAS build, sideload, or Play upload is authorized here. `app.json` `android.versionCode` is **19** in source; that number is **not** authority that 19 is unused on Play (REL-09 unread).

Keep **source defaults / intended settings** separate from **verified deployed state**.

## Source containment

`#22` already contains `#20` and `#21`. Do not reapply those three as independent patches.

| Ref | SHA | Role | Draft/HOLD |
| --- | --- | --- | --- |
| `origin/main` | `79d405d0b626d5067a33541887ac3c70689b8724` | Common reviewed base (VYD-35 IAP on main) | n/a |
| PR #20 | `531a4cdb8e0fa9b099bbd712635a8840ecea0e39` | VYD-36 optional-title. **Already in #22.** Do not round-sync. | draft HOLD |
| PR #21 | `355f60aee10d46203baf35e60a8228338f72e34b` | VYD-37 presentation. **Already in #22.** | draft HOLD |
| PR #22 | `8adcd7b604257d00b43635e70d90e4e97e5bcd57` | Isolated integration + REL-01/02. Candidate app SHA if a later combination is authorized. | draft HOLD |
| PR #23 | control branch `release/bounded-autonomy-register` | Documentation / register only. **Not an app feature.** | draft HOLD |
| PR #24 | `9db22faf09f81f79a96ca1d94bbc0c99d17ee05b` | REL-03 OTP EN/HI i18n. Separate until a reviewed combination is authorized. | draft HOLD |
| PR #25 | `5076f7707a4812437f74879c3767bf554b8eeabb` | REL-04 LuxuryPressable RN pressed. Separate until combination is authorized. | draft HOLD |

Do **not** include dirty historical `/Users/shivamsaurav/Vyaamikk Diary` local-main email-OTP (inventoried read-only around `ce2fc75`, behind origin/main). Do not copy it into a candidate.

Unresolved before any internal binary: independent review of #22/#24/#25; REL-09 Play inspect; explicit later build/track approval. Billing/quota production **writes** remain prohibited.

## Verified deployed backend (REL-10) versus source

Firebase project `vyaamikk-diary` / Android app package `com.specialsoftwares.vyaamikkdiary` match source. Identity/email/recovery/deletion/security callables are deployed in `asia-south1`. Billing/GST function names exported from `functions/src/index.ts` are **not** deployed. Live `PLAY_BILLING_ENABLED` / `APPSTORE_BILLING_ENABLED` cannot be read from a deployed billing handler; deployed identity envs do not contain those keys. Source remains fail-closed (`=== "true"`).

Live Firestore/Storage Rules hashes do not match the current repo files. Live Rules do **not** include the repo’s `quotaEnforcementOn` / subscription usage paths. App Check providers are registered and **unenforced** (see `APP_CHECK_DESIGN.md`). Per-user `quotaEnforcementEnabled` documents were not read.

## Three gates (do not collapse)

| Gate | What it is | What it is not |
| --- | --- | --- |
| Billing-off internal core-flow testing | Auth, records, letterhead/PDF, process-death, accessibility on an authorized binary while store billing stays off | Not a waiver of store policy for a later paid release; not proof of Play Integrity / real IAP |
| Specifically authorized internal store testing | License-tester purchase/restore and authoritative entitlement validation after explicit flag/track approval | Not public paid launch; not permission to turn production flags on from this runbook |
| Paid public launch | Store policy, manage/cancel access, reconciliation consumer, live billing functions, legal/pricing | Missing public-launch features stay visible in `PAID_LAUNCH_SCOPE.md`; they are not silent prerequisites for every billing-off internal test |

Google Play requires in-app access to subscription management/cancellation. A suitable Settings link to the Play subscriptions URL can meet that **cancellation-access** requirement without every planned reporting screen. Reconciliation correctness remains a **paid-launch engineering gate**, not polish.

## Three runtimes (do not mix evidence)

| Runtime | What it is | What it can prove | What it cannot |
| --- | --- | --- | --- |
| Existing debug / Expo dev client | Already-installed `development` or `development-production-otp` if one exists on a device | JS/source behaviour only when the **native binary identity** and the **separately served JS commit/environment** are both recorded. The installed binary’s source SHA does not prove which JS a development server supplied. | Store, Play Integrity silent path, TalkBack on a different APK |
| Future authorized sideload | Preview APK after a later EAS approval | Sideload Phone Auth (often reCAPTCHA), records, letterhead PDF | Play versionCode identity; App Check token fetch is configuration-dependent (see REL-08) |
| Play-installed AAB | Internal testing track after REL-11 + upload approval | Store attestation, real IAP **if** billing flags on | Nothing until REL-09 shows the track and unused versionCode |

CSS zoom is not font-scale or TalkBack acceptance.

`eas.json`: `preview` → internal APK; `production` → AAB; `development` / `development-production-otp` → dev-client APK. All four set `EXPO_PUBLIC_APP_MODE=production` in the profile env. None set `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED`. Confirm EAS secrets separately (REL-11). Package: `com.specialsoftwares.vyaamikkdiary`.

## Ordinary quota matrix (expected behaviour, not permission to change flags)

Server quota here means deployed **Rules** `quotaEnforcementOn` (source) plus a server-written `users/{uid}/subscription/status.quotaEnforcementEnabled === true`. Client upsell means `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED === "1"` (`quotaUpsellGate.ts` on #22). Billing means deployed billing handlers with `PLAY_BILLING_ENABLED` / `APPSTORE_BILLING_ENABLED === "true"`.

**Live today:** Rules quota gate is absent from the deployed ruleset; billing functions are not deployed; eas profiles do not set the upsell env key. Per-user status docs unread. So live ordinary CREATE is **not** rejected by this monthly quota Rules gate. The table below is still the intended matrix when those controls actually match the row.

| Server quota enforcement | Client upsell | Billing | Expected ordinary CREATE behavior at cap |
| --- | --- | --- | --- |
| Off | Off | Off | No rejection due to this monthly quota gate; other validation/auth still applies |
| On | Off | Off | Quota rejection/local retention where supported; no UpgradeSheet |
| On | On | Off | Eligible user-save can show UpgradeSheet; no verified paid entitlement can be granted through the disabled backend |
| Explicitly approved store-test configuration | Explicitly approved | Explicitly approved | Separate license-tester purchase/restore and authoritative entitlement validation |

Letterhead and validated mirrors remain zero ordinary quota in every row. Background retries do not open the sheet. Any quota-on/UI-on execution requires an already authorized test environment or later explicit activation; production writes remain prohibited.

### Runbook IDs (when an authorized binary exists)

Reuse `AUTH_MANUAL_ACCEPTANCE_CHECKLIST.md` and `docs/PRELAUNCH_DEVICE_QA.md`. Record: environment, **native binary identity**, **JS commit/environment** if a dev client, profile, installed versionCode, device, result, artifact (screenshot/log id — no secrets).

### Auth / onboarding

| ID | Prerequisite | Steps | Expected | Evidence |
| --- | --- | --- | --- | --- |
| AUTH-1 | Native Firebase build, not Expo Go | New Indian mobile → OTP → dashboard or first gap | Real SMS; no mock hint; no raw i18n keys on OTP (EN/HI after #24) | Screenshot of OTP + resulting route; binary id + JS commit |
| AUTH-2 | Same | Wrong OTP / lock / expiry / resend | Calm errors; countdown; resend not English-only on EN/HI | Screenshot |
| AUTH-3 | Same | Email OTP send failure → Retry sending | Localized retry/send/expiry on EN/HI (#24) | Screenshot |
| AUTH-4 | Online | Kill app during valid mobile OTP, reopen | Challenge still completable or explicit resend | Note |
| AUTH-5 | JS auth bridge | Immediately after first sign-in, save Customer Credit | Save succeeds (A9). `permission-denied` = bridge/deploy gap | Record id (not customer PII) |

Backend identity callables and Phone Auth SHA-1/SHA-256 are registered (REL-10). Source wiring: `startOtp` → `startNativePhoneOtp` (REL-06). Source wiring is not installed-device acceptance. SMS region allowlist is India (`IN`) only.

### Offline / revoked sessions

| ID | Prerequisite | Steps | Expected | Evidence |
| --- | --- | --- | --- | --- |
| SESS-1 | Signed-in | Airplane 24h / offline | Read-only / recoverable; no forced logout on transient boot failure | Note |
| SESS-2 | Deployed revocation | Revoke device | Unsynced quarantine / sign-in blocked as designed | Console unread for a specific device event |

### Ordinary quota (billing **off**)

Use the matrix above. Do not enable production billing flags for this internal candidate.

| ID | Prerequisite | Steps | Expected | Evidence |
| --- | --- | --- | --- | --- |
| QUOTA-off | Matches row “Off / Off / Off” (including **current live Rules**) | Exhaust ordinary monthly cap on diary/PO/CC/pack **create** | No rejection due to this monthly quota gate | Screenshot + note that live Rules lack `quotaEnforcementOn` |
| QUOTA-on-no-sheet | Only if a later authorized env actually has server quota on and upsell unset | Same create path | Server/quota error **without** UpgradeSheet | Screenshot |
| QUOTA-on-sheet | Only if a later build sets `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED=1` **and** server quota is on | Same create path | Sheet opens; letterhead/background still must **not** open it | Screenshot. Default internal candidate should keep flag off. |

### Free letterhead / PDF / share

| ID | Prerequisite | Steps | Expected | Evidence |
| --- | --- | --- | --- | --- |
| LH-1 | Any entitled or free account | Create letterhead PDF | Allowed; does not consume ordinary quota | PDF filename + SHA |
| LH-2 | Same | Share PDF | Human-readable filename; share sheet | Screenshot |
| LH-3 | Genuine diary mirror | Save mirror | Zero ordinary quota increment | Quota before/after |

Policy: `letterheadAccessPolicy.ts` (12 UTC months from signup, then included pending successor).

### Process-death / same-ID recovery

| ID | Prerequisite | Steps | Expected | Evidence |
| --- | --- | --- | --- | --- |
| SAVE-1 | Mid-save | Force-stop during save; retry same form | Same `clientRecordId`; no extra serial/quota (`saveLock` / save lifecycle) | Record id + quota |
| SAVE-2 | Photo attach | Kill during upload; retry | No duplicate Cash Paid; photo retries (PRELAUNCH S6) | Note |

### Billing-off limitations (this candidate)

- UpgradeSheet / store purchase / restore **not** in scope unless a separately authorized upsell build exists.
- No real Play/App Store purchase, pending, refund, or cancel.
- REL-01/02 IAP tests are injected-store source evidence, not this runbook.

### Later real-store testing (not this runbook’s execution)

Requires REL-09/11, billing-flag approval, Play-installed AAB, and VYD-38 manage/cancel access (settings link can meet Play cancellation-access; see `PAID_LAUNCH_SCOPE.md`). Reconciliation consumer remains a paid-launch engineering gate. Then: purchase, restore, dismiss-before-error, A→B, logout, pending, renewal, refund, revocation.

### Accessibility / press / boot (source vs device)

| ID | Notes |
| --- | --- |
| A11Y-1 | TalkBack on OTP after #24 — **not** established by `consentLocale.test.ts`. |
| PRESS-1 | LuxuryPressable RN `pressed` (#25) — source contract only until device cancel/drag. |
| BOOT-1 | Native splash is chevron-only (`app.json` splash). Do not treat as fixed without a matching installed-binary screenshot (REL-05). |

## Reviewer questions still open

- Combine #24/#25 into #22? Not unless separately authorized.
- Which exact installed debug **binary** is already on owner devices, and which JS commit that binary is loading? Unknown; record both before treating a dev-client session as candidate evidence.
- Play internal track and unused versionCode? Unknown (do not assume 19).
- Deploy a later Rules revision that includes quota/billing paths? Not authorized here; live ≠ repo is recorded only.

Owner action remaining for binaries: REL-09 Play sign-in **in the agent’s browser** (Safari session is not shared). Firebase CLI read access is restored; do not repeat `login:ci`.
