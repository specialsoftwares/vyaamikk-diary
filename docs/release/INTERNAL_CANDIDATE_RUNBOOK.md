# Internal candidate manifest and device runbook (REL-13)

This is a runbook, not a claim that the tests ran. No merge, native/EAS build, sideload, or Play upload is authorized here. `app.json` `android.versionCode` is **19** in source; that number is **not** authority that 19 is unused on Play (REL-09 unread).

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

Unresolved before any internal binary: independent review of #22/#24/#25; REL-09 Play inspect; REL-10 Firebase inspect; billing/quota production flags remain **off**.

## Three runtimes (do not mix evidence)

| Runtime | What it is | What it can prove | What it cannot |
| --- | --- | --- | --- |
| Existing debug / Expo dev client | Already-installed `development` or `development-production-otp` if one exists on a device | JS/source behaviour on that exact binary SHA only | Store, Play Integrity silent path, TalkBack on a different APK |
| Future authorized sideload | Preview APK after a later EAS approval | Sideload Phone Auth (often reCAPTCHA), records, letterhead PDF | Play Integrity App Check / silent Phone Auth; Play versionCode identity |
| Play-installed AAB | Internal testing track after REL-11 + upload approval | Store attestation, real IAP **if** billing flags on | Nothing until REL-09 shows the track and unused versionCode |

CSS zoom is not font-scale or TalkBack acceptance.

`eas.json`: `preview` → internal APK; `production` → AAB; both set `EXPO_PUBLIC_APP_MODE=production`. Neither profile sets `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED`. Confirm EAS secrets separately (REL-11). Package: `com.specialsoftwares.vyaamikkdiary`.

Live backend, signing identities, account eligibility, and next versionCode: **unknown until inspected**.

## Core tests (when an authorized binary exists)

Reuse `AUTH_MANUAL_ACCEPTANCE_CHECKLIST.md` and `docs/PRELAUNCH_DEVICE_QA.md`. Record: environment, build SHA, profile, installed versionCode, device, result, artifact (screenshot/log id — no secrets).

### Auth / onboarding

| ID | Prerequisite | Steps | Expected | Evidence |
| --- | --- | --- | --- | --- |
| AUTH-1 | Native Firebase build, not Expo Go | New Indian mobile → OTP → dashboard or first gap | Real SMS; no mock hint; no raw i18n keys on OTP (EN/HI after #24) | Screenshot of OTP + resulting route; SHA |
| AUTH-2 | Same | Wrong OTP / lock / expiry / resend | Calm errors; countdown; resend not English-only on EN/HI | Screenshot |
| AUTH-3 | Same | Email OTP send failure → Retry sending | Localized retry/send/expiry on EN/HI (#24) | Screenshot |
| AUTH-4 | Online | Kill app during valid mobile OTP, reopen | Challenge still completable or explicit resend | Note |
| AUTH-5 | JS auth bridge | Immediately after first sign-in, save Customer Credit | Save succeeds (A9). `permission-denied` = bridge/deploy gap | Record id (not customer PII) |

Backend identity callables / Phone Auth SHA: REL-10. Source wiring: `startOtp` → `startNativePhoneOtp` (REL-06). Source wiring is not deployed-auth acceptance.

### Offline / revoked sessions

| ID | Prerequisite | Steps | Expected | Evidence |
| --- | --- | --- | --- | --- |
| SESS-1 | Signed-in | Airplane 24h / offline | Read-only / recoverable; no forced logout on transient boot failure | Note |
| SESS-2 | Deployed revocation | Revoke device | Unsynced quarantine / sign-in blocked as designed | Console unread until REL-10 |

### Ordinary quota (billing **off**)

| ID | Prerequisite | Steps | Expected | Evidence |
| --- | --- | --- | --- | --- |
| QUOTA-1 | Upsell flag **unset** | Exhaust ordinary monthly cap on diary/PO/CC/pack **create** | Server/quota error **without** UpgradeSheet | Screenshot |
| QUOTA-2 | Only if a later build sets `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED=1` | Same create path | Sheet opens; letterhead/background still must **not** open it | Screenshot. Default internal candidate should keep flag off. |

Do not enable production billing flags for this internal candidate.

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

Requires REL-09/10/11, billing-flag approval, Play-installed AAB, and VYD-38 manage/cancel (see `PAID_LAUNCH_SCOPE.md`). Then: purchase, restore, dismiss-before-error, A→B, logout, pending, renewal, refund, revocation.

### Accessibility / press / boot (source vs device)

| ID | Notes |
| --- | --- |
| A11Y-1 | TalkBack on OTP after #24 — **not** established by `consentLocale.test.ts`. |
| PRESS-1 | LuxuryPressable RN `pressed` (#25) — source contract only until device cancel/drag. |
| BOOT-1 | Native splash is chevron-only (`app.json` splash). Do not treat as fixed without a matching installed-binary screenshot (REL-05). |

## Reviewer questions still open

- Combine #24/#25 into #22? Not unless separately authorized.
- Which exact installed debug binary SHA is already on owner devices? Unknown.
- Play internal track and unused versionCode? Unknown (do not assume 19).
- Are Functions/Rules deployed to match this SHA? Unknown (REL-10).

Owner actions: REL-09 Play sign-in; REL-10 `firebase login --reauth` locally (agent shell cannot). No `login:ci` bypass.
