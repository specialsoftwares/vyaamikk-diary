# Internal candidate manifest and device runbook (REL-13)

This is a runbook, not a claim that the tests ran. No merge, native/EAS build, sideload, or Play upload is authorized here. `app.json` `android.versionCode` is **19** in source. Continuation 3 Play All-app-bundles inventory (`1 - 6 of 6`) listed versionCodes **17, 16, 15, 14, 13, 10** only; searches for **18, 19, 12, 11** returned no results. **19 is unused on that complete listing** and is the proposed next code; do not bump it in this assignment. **18 is also unused.** This is not an upload.

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

Unresolved before any internal binary: combination of #22+#24+#25 is **not created**; independent review of that future combined SHA; explicit later build/track approval; live-Rules compatibility remedy (not deployed here). Billing/quota production **writes** remain prohibited.

## Verified deployed backend (REL-10) versus source

Firebase project `vyaamikk-diary` / Android app package `com.specialsoftwares.vyaamikkdiary` match source. Identity/email/recovery/deletion/security callables are deployed in `asia-south1`. Billing/GST function names exported from `functions/src/index.ts` are **not** deployed. Live `PLAY_BILLING_ENABLED` / `APPSTORE_BILLING_ENABLED` cannot be read from a deployed billing handler; deployed identity envs do not contain those keys. Source remains fail-closed (`=== "true"`).

Live Firestore/Storage Rules hashes do not match the current repo files. Live Rules do **not** include the repo’s `quotaEnforcementOn` / `match /subscription/status` / usage paths. App Check providers are registered and **unenforced** (see `APP_CHECK_DESIGN.md`). Per-user `quotaEnforcementEnabled` documents were not read.

Continuation 3 emulator (`LIVE_RULES_EXPORT`, client `#22` `8adcd7b`, live Firestore sha256 `d8ee0abcd5a8f217f1fbe60af9651e5b4253b07cac72d0746c4e781a48052aa2`): ordinary diary/PO/Customer Credit/Professional Pack first CREATE is **denied** because `tx.get users/{uid}/subscription/status` has no Rules match (missing doc and admin-seeded enforcement-false are both unreadable; not treated as enforcement-off). Save-lock **first acquire** is **denied** (`_saveLocks` missing-doc read is a Null value error at live L300). Letterhead parent + genuine mirror CREATE, metadata UPDATE, and same-ID recovery are **compatible** and do not write `usageCurrent`. Subscription listener `permission-denied` is **controlled degradation** to the free default view, not a boot crash. Storage client paths `letterhead` / `attachments` / `pdfs` match live; repo extra company GST denies are redundant given live catch-all. Canonical candidate-Rules emulator suites remain valid only against repo `firestore.rules`.

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
| Play-installed AAB | Internal testing track after later upload approval | Store attestation, real IAP **if** billing flags on | Ordinary live Firestore CREATE until a reviewed Rules remedy exists |

CSS zoom is not font-scale or TalkBack acceptance.

`eas.json`: `preview` → internal APK; `production` → AAB; `development` / `development-production-otp` → dev-client APK. All four set `EXPO_PUBLIC_APP_MODE=production` in the profile env. None set `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED`. Confirm EAS secrets separately (REL-11). Package: `com.specialsoftwares.vyaamikkdiary`.

## Ordinary quota matrix (expected behaviour, not permission to change flags)

Server quota here means deployed **Rules** `quotaEnforcementOn` (source) plus a server-written `users/{uid}/subscription/status.quotaEnforcementEnabled === true`. Client upsell means `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED === "1"` (`quotaUpsellGate.ts` on #22). Billing means deployed billing handlers with `PLAY_BILLING_ENABLED` / `APPSTORE_BILLING_ENABLED === "true"`.

**Live today:** the monthly quota **Rules gate** (`quotaEnforcementOn`) is still absent. Billing functions are not deployed; eas profiles do not set the upsell env key. That does **not** mean ordinary CREATE succeeds: the reviewed `#22` client reads `subscription/status` first, and live Rules deny that path, so ordinary CREATE is `permission-denied` even with billing/quota off. The table below is the intended matrix only when status is actually readable and the other controls match the row.

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
| QUOTA-off | Intended row “Off / Off / Off” **after** status is readable | Exhaust ordinary monthly cap on diary/PO/CC/pack **create** | No rejection due to this monthly quota gate | Live today: CREATE is `permission-denied` on unread `subscription/status`, not a quota rejection |
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

Requires later build/track approval, billing-flag approval, Play-installed AAB, and VYD-38 manage/cancel access (settings link can meet Play cancellation-access; see `PAID_LAUNCH_SCOPE.md`). Reconciliation consumer remains a paid-launch engineering gate. Then: purchase, restore, dismiss-before-error, A→B, logout, pending, renewal, refund, revocation.

### Accessibility / press / boot (source vs device)

| ID | Notes |
| --- | --- |
| A11Y-1 | TalkBack on OTP after #24 — **not** established by `consentLocale.test.ts`. |
| PRESS-1 | LuxuryPressable RN `pressed` (#25) — source contract only until device cancel/drag. |
| BOOT-1 | Native splash is chevron-only (`app.json` splash). Do not treat as fixed without a matching installed-binary screenshot (REL-05). |

## Reviewer questions still open

- Combine #24/#25 into #22? Prepared below; not created; not authorized.
- Which exact installed debug **binary** is already on owner devices, and which JS commit that binary is loading? Unknown; record both before treating a dev-client session as candidate evidence.
- Deploy a later Rules revision that includes owner-read subscription paths (smallest compatibility) or the full repo quota/billing match set? Not authorized here.
- Dashboard setup remains **6 of 11**; Store Listing / target audience / data safety / category+contact / sign-in details are incomplete. Do not change them from this runbook.

## Continuation 3 Play inspect (read-only)

Inspected 2026-09-19 in Cursor Chromium with the established `aeadmin@specialsoftwares.com` session (no password entered this continuation). Access restoration is separate from preflight completion.

| Fact | Observed |
| --- | --- |
| Developer | SPECIAL Softwares (`5171346189091805855`) |
| App | Vyaamikk Diary (`4972339006118168782`) |
| Package | `com.specialsoftwares.vyaamikkdiary` — matches Firebase Android app |
| Dashboard | Draft / unreviewed; production **Inactive**; setup **6 of 11**; temporary app name unreviewed. Incomplete (not changed): Sign-in details, Target audience, Data safety, category + contact details, Store Listing. Complete: privacy policy, Ads, Content rating, Government apps, Financial features, Health. |
| Developer verification | Previously observed **registered**; not changed |
| Installed audience | Previously displayed **0**; dashboard this pass did not re-quote a numeric install base beyond bundle rows `≤ 100` |
| Internal testing | **Active**; release **Internal Testing RC4 vc17**; 1 version code; released 26 Aug 23:01; **Not reviewed**; available to internal testers. Testers emails not enumerated. |
| Production | **Inactive**; no production release |
| Play Integrity API (Play Console) | Previously: **not integrated**. Keep separate from Firebase App Check Play Integrity **provider registration** (REL-10, UNENFORCED). |

### All app bundles (`1 - 6 of 6`, “6 app versions”)

Recorded 2026-09-19T10:05:33Z and reconfirmed 10:12:27Z. FILTER-BAR / `filter_list` is present; no additional overlay of hidden versions opened. Pagination is the complete set.

| versionCode | Version name | Type | Uploaded | Install base | Status |
| --- | --- | --- | --- | --- | --- |
| 17 | 1.0.0 | App bundle | 26 Aug 2026, 17:28 | ≤ 100 | Active |
| 16 | 1.0.0 | App bundle | 25 Aug 2026, 17:42 | ≤ 100 | Inactive |
| 15 | 1.0.0 | App bundle | 13 Aug 2026, 01:10 | ≤ 100 | Inactive |
| 14 | 1.0.0 | App bundle | 12 Aug 2026, 23:01 | ≤ 100 | Inactive |
| 13 | 1.0.0 | App bundle | 9 Aug 2026, 13:06 | ≤ 100 | Inactive |
| 10 | 1.0.0 | App bundle | 9 Aug 2026, 10:38 | ≤ 100 | Inactive |

The sixth item is **versionCode 10**, not 12/18/19. Searches for 18, 19, 12, 11: **No results**. Highest used = 17. Unused on this inventory include 11, 12, 18, 19.

### Signing fingerprints (public)

Copied sequentially from App signing (`.../keymanagement`) at 2026-09-19T10:01:25.878Z. Hyphenated labels are Play App Signing; unhyphenated SHA1/SHA256 are the upload key. Compared to Firebase Android SHA list (REL-10). No private key export, reset, or registration.

| Role | Control | SHA-1 | SHA-256 | Firebase |
| --- | --- | --- | --- | --- |
| Play App Signing | `Copy SHA-1 certificate fingerprint` / `Copy SHA-256 certificate fingerprint` | `d223f0a5effd8e2e421752d35ad7a00e19f82e59` | `b9c521e3b57eab0c3d3dc7b85de91d67ef9f2abd90cc6950c5700b4f2636ce92` | both present |
| Upload | `Copy SHA1 certificate fingerprint` / `Copy SHA256 certificate fingerprint` | `20f8150e213c9c3f84fdcac51e9e4dcceea242ad` | `e688fa0ba5fa3bd30585114f8c2143e1efdda1acbfdb9daadc42da896178752a` | both present |

Play App Signing SHA-1 was read from the hyphenated copy control (colon-delimited `D2:23:F0:…:2E:59`), not inferred as the leftover Firebase hash.

## Source-combination and internal-AAB proposal (not executed)

Do **not** treat this as an already-built or tested combined tree. Exact combined SHA is unavailable until a later authorized combination exists.

**Proposed source set (inputs only):**

| Input | SHA | Role |
| --- | --- | --- |
| `origin/main` | `79d405d0b626d5067a33541887ac3c70689b8724` | Base |
| PR #22 | `8adcd7b604257d00b43635e70d90e4e97e5bcd57` | App candidate (already includes #20/#21) |
| PR #24 | `9db22faf09f81f79a96ca1d94bbc0c99d17ee05b` | REL-03 OTP EN/HI |
| PR #25 | `5076f7707a4812437f74879c3767bf554b8eeabb` | REL-04 LuxuryPressable |
| PR #23 | control docs only | **Not** an app feature |

Exclude dirty historical local-main email-OTP.

**Read-only `git merge-tree` preview (no combined branch created):**

- #22 vs #24: `changed in both` on `package.json`, `src/i18n/locales/en.json`, `en.ts`, `hi.json`, `hi.ts`. OTP screens / consent tests auto-merged in the preview.
- #22 vs #25 and #24 vs #25: `changed in both` only on `package.json`. `LuxuryPressable.tsx` / `luxuryTokens.ts` auto-merged in the preview.
- A later combination must resolve those overlapping files and re-run CI. Preview is not a combined SHA.

**Intended AAB:** EAS profile `production` (`android.buildType: app-bundle`), `EXPO_PUBLIC_APP_MODE=production`, `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` unset. Package `com.specialsoftwares.vyaamikkdiary`. Target track: existing **internal testing** (currently RC4 vc17). Billing/upsell remain off.

**Proposed versionCode:** **19** — unused on the complete 6-item Play inventory and already the source value. **18** is also unused if a sequential-next code is preferred. Do **not** bump in this assignment.

**Backend/Rules:** identity callables deployed; billing/GST **not** deployed. Live Rules deny ordinary CREATE and first save-lock acquire (see matrix above). Smallest later-reviewed compatibility patch: owner-read / server-write-denied `users/{uid}/subscription/status` and `usageCurrent`, plus `_saveLocks` missing-doc read (`resource == null || resource.data.userId == uid`). Do not implement or deploy it here. Full repo quota Rules are a larger delta.

**Installed-binary tests this AAB would enable:** AUTH-*, LH-*, SESS-1, A11Y/PRESS/BOOT as listed — after upload/install. Ordinary CREATE/SAVE-1 against **live** Firebase remain blocked until a Rules remedy. Letterhead parent/mirror can be exercised against live Rules. Native/store IAP still pending. No device acceptance is granted by this proposal.

Owner actions remaining: confirm legal effective date/address/grievance (REL-07); complete Play dashboard 6/11 items when ready (do not change them here); authorize combination + Rules review + build/track separately. Firebase CLI read access remains; do not repeat `login:ci`. Do not merge, build, deploy, or upload from this runbook.
