# Stabilization & Release Readiness Report

**Date:** 2026-07-24 · **Pass:** repository stabilization (Phases 0–7)  
**Branch:** `main` · **Authority:** present code + executable tests > config > forensic audit > docs

This document is the **single consolidated readiness report** for this pass.  
`PRODUCTION_READINESS.md` is historical for the earlier auth track and must not override this file for channel readiness.

---

## Baseline (Phase 0)

- Working tree already dirty before this pass (OTP DX, env, i18n, `.expo-export-audit/`).
- **Not absorbed / not staged by this pass:** `src/i18n/i18n.ts`, `src/i18n/validateLocales.ts`, `.expo-export-audit/`, real `.env`, signing material.
- Pre-existing dirty paths that this pass may have carefully merged: `.env.example`, related auth/config files — see git diff before commit.
- Managed EAS workflow; no checked-in `ios/` / `android/`.

---

## Defects fixed in this pass

| Area | Change |
|---|---|
| EAS `development` profile | `EXPO_PUBLIC_APP_MODE` set to **`production`** (aligned with `development-production-otp`) so development-client builds are not rejected by isolation |
| Runtime errors | Precise `RuntimeConfigurationError` text naming runtime, mode, and corrective commands (`start:prod-dev-client`, preview/production rebuild) |
| Device integrity | Explicitly **dormant**; `isLoginAllowedByIntegrity` allows login while dormant/unavailable (no fake fail-closed) |
| Local business dates | `dayKey` / `localBusinessDateKey` / `todayLocalBusinessDateKey`; search + statutory day keys no longer use UTC `toISOString().slice(0,10)` |
| Mock OTP isolation test | Store/standalone rejects `000000` for mobile and email |
| Purchase Order local-mock | Per-user create mutex so concurrent retries cannot allocate multiple serials |
| Save hardening tests | Ten concurrent PO creates → one doc, one serial |
| Letterhead PDF tests | Escape + no corporate footer assertions |
| `audit:records` | Extra dry-run detectors: duplicate serials, duplicate `clientPaymentId`, missing `clientRecordId`, letterhead matter-link anomalies — still never auto-repairs |
| Dependencies | `expo@~54.0.36`, `expo-build-properties@~1.0.10` — Expo Doctor **18/18** |
| Lint | Real ESLint gate via `eslint-config-expo` + scoped `lint:eslint` (no mass format rewrite) |
| Docs | README rewritten; this report created |

---

## Behaviours preserved

- Product identity, Auth v2 journey, wizard synchronous ownership.
- Production phone OTP via `nativePhoneAuth.ts` / RNFirebase Auth.
- Email OTP via Cloud Functions + Resend (server-side secrets).
- Server-owned identity indexes; client profile patch allowlists.
- Save idempotency / `stableRecordId` / `_saveLocks` / Letterhead `${clientRecordId}_matter`.
- Letterhead Matter PDF free of Vyaamikk branding/operator footer.
- Preview = internal standalone APK path; production = AAB; no mock OTP in preview.
- Background location disabled.
- `audit:records` dry-run / non-production refusal.

---

## Test matrix (this pass)

Full safe suite (excluding live SMS / EAS / production mutations):

| Command / group | Result | Notes |
|---|---|---|
| `npx expo-doctor` | **PASS 18/18** | After `expo@~54.0.36` + `expo-build-properties@~1.0.10` |
| `npm run typecheck` | **PASS** | |
| `npm run lint:eslint` | **PASS** | Scoped correctness gate; ESLint 9 + `eslint-config-expo` |
| `npm run functions:build` | **PASS** | |
| All `test:*` except firestore-rules (76 scripts) | **PASS** | Includes env, OTP isolation, wizard race, save hardening (10× PO), letterhead PDF, credit, native phone auth unit, etc. |
| `npm run test:firestore-rules` | **PASS** | Emulator; Java 17 present |
| Live SMS / Resend DNS / EAS build / Play / App Store | **Not run** | External / credential-gated |

Earlier mid-pass failures (`typecheck` missing `dormant`, ESLint 10 incompat) were fixed before completion.

---

## Runtime / EAS / Auth matrices

### Runtime backend

| Runtime | Bundled mode | Backend | Mock OTP |
|---|---|---|---|
| Expo Go + `__DEV__` | ignored → development | `local-mock` | `000000` allowed |
| development-client | must be `production` | `firebase-production` or `not-configured` | blocked |
| store-or-standalone (preview/prod) | must be `production` | `firebase-production` or fail-closed | blocked |
| web-dev | development + shared-dev optional | local-mock or firebase-shared-dev | shared-dev may use legacy `123456` only there |

### EAS profiles

| Profile | Client | Artifact | APP_MODE |
|---|---|---|---|
| `development` | developmentClient | internal APK | **production** |
| `development-production-otp` | developmentClient | internal APK | production |
| `preview` | standalone | internal APK | production |
| `production` | store | AAB | production |

No `preview-staging` profile invented.

### Channel readiness

| Channel | Ready for QA? | Notes |
|---|---|---|
| Expo Go local-mock | **Yes (local)** | UI / wizard / mock OTP / local saves |
| Development-client + `start:prod-dev-client` | **Code ready; SMS externally unproven** | Needs Firebase Phone Auth + SHA fingerprints + device |
| Preview standalone APK | **Buildable; auth externally unproven** | Needs live SMS + Functions + rules deploy |
| Play internal AAB | **Not store-ready** | Same external blockers + Play compliance |
| Store release | **Blocked** | Auth stack live proof, rules/Functions deploy, App Check or accepted posture, physical QA, store assets |

---

## Security status

| Control | Status |
|---|---|
| Runtime isolation / fail-closed production config | Implemented + tested |
| Mock OTP structural block outside Expo Go | Implemented + tested |
| Identity indexes server-owned | Preserved in source; deploy is external |
| Device integrity | Dormant — **not** login-enforced |
| App Check | Not scaffolded half-wired; console enforcement external |
| Logger redaction | Present (`src/utils/logger.ts`) |
| Firestore / Storage rules | In repo; live enforcement = deploy status external |

---

## Authenticated phone-claim binding (server)

`resolveOrCreateUserByPhone` / `claimMobile` assert  
`canonicalize(request.auth.token.phone_number) === canonicalize(client phoneE164)`  
and derive the identity phone from the Firebase Auth claim (client input is consistency-only).  
Mismatch / missing claim reject **before** the identity transaction.

## NEXT FUNCTIONAL MICRO-PHASE — EMAIL/ONBOARDING FIRESTORE PERMISSION FAILURE

Development-client acceptance exposed Email step banner: **“Missing or insufficient permissions.”**  
Do not mix into phone-claim security work. Investigate Firestore rules / session bridge for email/onboarding next.

---

## External blockers (owner / ops)

1. Firebase Phone Auth enabled; Android SHA-1/SHA-256 registered; iOS APNs if needed.
2. Deploy Cloud Functions + secrets (Resend API key, sender domain verified).
3. Deploy `firestore.rules` / `storage.rules` / indexes to the production project.
4. ~~Confirm preview/production EAS env has complete `EXPO_PUBLIC_FIREBASE_*`~~ → **Configured on EAS** (2026-07-24; names verified; values not logged).
5. Optional: App Check providers + gradual enforcement (do not enable before providers exist).
6. Play / App Store listings, Data Safety, physical-device preview OTP E2E.
7. Staging Firebase project only if owner approves a named non-mock profile later.
8. **Firebase CLI reauth** required in this environment (`firebase login --reauth` as `support.vyd@specialsoftwares.com`) before any deploy/list.

---

## Beta activation progress (2026-07-24)

**Target path:** EAS `preview` → package `com.specialsoftwares.vyaamikkdiary` → Firebase `vyaamikk-diary` → Functions `asia-south1`.  
**No** staging project, **no** `.beta` package, **no** new EAS profile.

| Item | Classification | Evidence |
|---|---|---|
| EAS account / project link | **Verified locally** | `eas whoami` → `vydspecial2026`; project `00bb47ff-b22f-4a64-ace8-a0e7275fd2a1` (`@vydspecial2026/vyaamikk-diary`) |
| `preview` profile shape | **Verified locally** | `distribution: internal`, no `developmentClient`, `EXPO_PUBLIC_APP_MODE=production`, `environment: preview` |
| EAS preview/production public Firebase + legal env | **Configured but externally unproven** (build not yet baked) | 13 `EXPO_PUBLIC_*` vars + `GOOGLE_SERVICES_JSON` file secret; `APP_MODE=production`, `PROJECT_ID=vyaamikk-diary`, region `asia-south1`; mock OTP vars absent |
| `app.config.js` + `.easignore` google-services handling | **Verified locally** | File secret path; local fallback `./google-services.json`; file ignored from tarball upload |
| Native↔JS Firebase consistency script | **Verified locally** | `npm run check:firebase-client` → ok; warning: `oauth_client_count=0` (SHA likely missing) |
| Icons | **Verified locally** | Present; provisional assets OK for functional beta (not final Play artwork) |
| Typecheck / lint / isolation tests / functions build / expo-doctor | **Verified locally** | Green in this activation pass (`expo-doctor` 18/18 after `app.config.js` fix) |
| Firebase CLI deploy / Phone Auth / Functions / rules live state | **Blocked** | Credentials expired — need `firebase login --reauth` |
| EAS Android SHA-1/SHA-256 registered in Firebase | **Owner action required** | Local `google-services.json` has **0** `oauth_client` entries; credentials CLI interactive; prior build was `development` profile only |
| Resend secrets + DNS | **Owner action required** | Cannot set Functions secrets without Firebase CLI |
| `eas build --profile preview` | **Blocked** (preflight incomplete) | Quota-consuming build deferred until Firebase Phone Auth + Functions/rules + SHA are ready |
| Physical APK acceptance | **Owner action required** | Sheet: `docs/BETA_PREVIEW_ANDROID_ACCEPTANCE_SHEET.md` |
| App Check / device integrity | **Accepted beta limitation** | Integrity dormant; App Check not enforced |

### Beta data handling (production Firebase)

Testers write **real** Auth users, UEIDs, indexes, diaries, PDFs, and Storage objects into `vyaamikk-diary`. Keep the first cohort small. Prefer phones/emails the owner is willing to retain. Do **not** run casual production deletes; use dry-run `audit:records` later and an owner-approved cleanup. Cooling-off / retired-phone / quarantine may delay phone reuse after deletion.

### Preflight command (after Firebase reauth + SHA + deploy)

```bash
npm run check:firebase-client
npm run typecheck && npm run lint
npx eas-cli@latest build --profile preview --platform android --non-interactive
```

Then execute `docs/BETA_PREVIEW_ANDROID_ACCEPTANCE_SHEET.md` on a physical device with **no Metro**.

---

## Owner decisions still required

- Whether to accept dormant integrity until App Check / Play Integrity is registered.
- Staging project yes/no (do not invent credentials) — **deferred; using production Firebase for this beta**.
- Legal copy effective dates / grievance officer only if owner supplies values.
- Explicit go-ahead for the **quota-consuming** `preview` EAS build **after** Firebase reauth, SHA registration, Functions/Resend secrets, and rules deploy.
- Tester allowlist + acceptance that beta data lands in production Firebase.

---

## Facts future prompts must not get wrong

1. **`preview` is already an internal standalone APK path** (`distribution: "internal"`). Explicit `android.buildType: "apk"` is not a mandatory functional fix.
2. **`production` is the Play-oriented AAB path.**
3. **Standalone / preview / store runtimes cannot use local-mock or shared-development.**
4. **Development clients require production app mode** (`EXPO_PUBLIC_APP_MODE=production`); use `npm run start:prod-dev-client`.
5. **Production phone OTP uses native RNFirebase Auth** (`nativePhoneAuth.ts`), not Firebase JS web phone auth.
6. **Production email OTP uses Cloud Functions + Resend** (server-side).
7. **Identity indexes remain server-owned**; never loosen rules for client writes.
8. **Letterhead Matter PDFs contain no Vyaamikk branding or operator metadata.**
9. **Letterhead diary linkage remains** ``${clientRecordId}_matter``.
10. **Purchase-order serial allocation occurs only after the idempotent existence check.**
11. **Customer-credit payments deduplicate on `clientPaymentId`.**
12. **Wizard navigation remains synchronously owned by `wizardNavigationController`.**
13. **Mock OTPs (`000000`) remain structurally blocked in preview and production.**
14. **Background location remains disabled.**
15. **Rules, Functions, SMS, Resend, App Check console enforcement, integrity registration, and store credentials are external operations tasks.**
16. **`audit:records` remains dry-run and non-production.**
17. **Managed EAS remains the build model without committed native folders.**
18. **Device integrity is dormant and does not currently block login.**
19. **Source existing ≠ deployed / live-proven.**
20. **Vyaamikk Diary must not be coupled to Vyaamikk Samadhaan backends.**

---

## Safest next operational action

1. **Owner:** Ship a new **preview** APK (next `versionCode`, currently still **4** on disk until bumped for build) containing the Phone Auth session + autofill fixes below. The installed versionCode **4** binary cannot receive these JS changes without a rebuild or OTA.
2. Before that build: confirm Firebase Console Android app has **EAS upload-key SHA-1/SHA-256** (and later **Play App Signing** SHA-256). Local `google-services.json` currently has `oauth_client: []` — `check:firebase-client` warns; mismatches force reCAPTCHA / identifier failures.
3. Accept that **side-loaded** preview APKs commonly open browser reCAPTCHA; silent Play Integrity acceptance requires a **Play Internal Testing** install on a genuine device with Play services.
4. After install: one real +91 OTP confirm through OTP entry (or auto-verify), then onboarding continuation.

---

## Incident: Phone OTP `auth/operation-not-allowed` (2026-07-30)

**Controlling device diagnostic (redacted):**
- `appErrorCode=auth_not_configured`
- `firebaseAuthCode=auth/operation-not-allowed`
- `knownPhoneAuthCode=auth/operation-not-allowed`
- `phase=send`
- `phoneE164Sent=+91XXXXXXXXXX` (E.164 valid; formatting ruled out)
- `androidActivity=unknown` (not causal for this code)

**Target project proof (APK / native / JS aligned):**

| Signal | Value |
|---|---|
| Native `google-services.json` project_id | `vyaamikk-diary` |
| Project number | `982505811909` |
| Android package | `com.specialsoftwares.vyaamikkdiary` |
| Android app ID | `1:982505811909:android:784cb8df7f5523beea25ac` |
| Live Firebase sdkconfig | Identical project/package/app id |
| EAS preview `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `vyaamikk-diary` |
| EAS preview `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `982505811909` |
| EAS `GOOGLE_SERVICES_JSON` | Present (file secret; content not readable outside builders) |
| Installed preview build | `4bcbde8e-…` · versionCode **4** · profile `preview` |
| CLI account | `support.vyd@specialsoftwares.com` · project `vyaamikk-diary` |

**Code-path audit (no app defect for this code):**
- Repo matches for `useEmulator` / `setTenantId` / `tenantId` / `setAppVerificationDisabledForTesting` / `forceRecaptchaFlowForTesting` / `appVerificationDisabledForTesting` on Phone Auth path: **none**
- Production send path: default RNFirebase `signInWithPhoneNumber(e164)` only; no tenant; no Auth emulator; no app-verification bypass
- Functions emulator connect is `__DEV__`-gated and unrelated to native SMS initiation
- Sticky diagnostics retained (working; identified this failure)

**Server-side Auth config (Identity Toolkit Admin API, project `vyaamikk-diary`):**

| Check | Before fix | After fix |
|---|---|---|
| Phone provider `signIn.phoneNumber.enabled` | `true` (already enabled when inspected) | `true` |
| SMS region policy | `allowlistOnly: {}` — **zero regions** (blocks all SMS, including India; Firebase default for new projects; surfaces as `auth/operation-not-allowed` with provider-disabled wording) | `allowlistOnly.allowedRegions = ["IN"]` |
| Multi-tenancy | No tenants / empty `multiTenant` | unchanged |
| Billing | Blaze (`billingEnabled=true`) | unchanged |
| EAS SHA-1 / SHA-256 on Android app | Registered and matching keystore | unchanged (readiness only; not causal for this code) |

**Console action taken:** Patched `smsRegionConfig` via Identity Toolkit Admin API `projects.vyaamikk-diary/config` (`updateMask=smsRegionConfig`) to allowlist **IN**. No Functions/rules/Storage deploy. No APK rebuild. No source change for this fix.

**Propagation / retry:** Owner must force-stop + reopen existing APK and retry **one** OTP send. Provider/SMS-region changes are server-side.

**Rebuild required?** **No** — unless a later diagnostic proves wrong project packaging (contradicts current proof).

**Decisive status:** `Provider enabled but SMS delivery blocked — billing/policy/quota correction required` → **corrected** (SMS region allowlist now includes `IN`). Pending owner device retry to confirm SMS arrives.

**Owner next action:** Retry OTP once on the current preview APK. If success → incident closed. If new Firebase code → report that code only.

---

## Mac migration integrity (2026-08-06)

**Machine:** Apple Silicon M5 · macOS 26.5.1 · `arm64` · not Rosetta · user `shivamsaurav`  
**Repo path:** `/Users/shivamsaurav/Vyaamikk Diary` (same physical project; not iCloud duplicate; single `.git`)

| Area | Result |
|---|---|
| Git history / remote | Intact · `origin` → `specialsoftwares/vyaamikk-diary` · `main` @ `b7a7089` · **ahead 44** |
| Uncommitted / untracked work | **Preserved** (dirty tree unchanged by repairs; no reset/clean/stash/commit) |
| Node / npm | NVM `v20.19.4` arm64 · npm `10.8.2` · PATH prefers NVM over Homebrew Node |
| Homebrew | `/opt/homebrew` only (no Intel `/usr/local` Homebrew) |
| Java | Temurin 17 arm64 · `JAVA_HOME` via `/usr/libexec/java_home -v 17` |
| `node_modules` | Migrated copy kept · arm64 native bindings present · no broken symlinks · **npm ci not required** (validation green; lockfile dirty — avoided reinstall drift) |
| Firebase local file | `google-services.json` present · `vyaamikk-diary` / `982505811909` / package match |
| Firebase CLI | Logged in `support.vyd@specialsoftwares.com` · project `vyaamikk-diary` |
| EAS | `vydspecial2026` · project `00bb47ff-b22f-4a64-ace8-a0e7275fd2a1` · profiles intact |
| Android Studio | Universal binary present · Hypervisor.Framework OK |
| Emulator gap found | Migrated AVD incomplete (no `config.ini` / no `system-images`) |
| Emulator repair | Installed `android-commandlinetools` · ARM64 Play image API 35 · AVD `Vyaamikk_Pixel_API35` · `.zshrc` PATH/`ANDROID_SDK_ROOT` fixed |
| Repo source edits for migration | **None** |
| EAS rebuild / deploy / keystore | **Not performed** (not required for laptop migration) |

**Validation run (selected):** `typecheck` · `lint:eslint` · `check:firebase-client` · `expo-doctor` **18/18** · startup/env/auth/Phone Auth/mock-isolation/wizard/save/Customer Credit/Letterhead/storage/deletion/Firestorestore rules emulator · `functions` `tsc` · release-mode `expo export` android (temp dir cleaned).

**Separate from migration:** Phone Auth SMS region / OTP delivery remains an external Firebase configuration concern (see prior incident). Local `.env` was missing some `EXPO_PUBLIC_*` legal/region keys present on EAS preview — filled from EAS pull into gitignored `.env` only (values not logged).

**Safest next owner action:** Open a new terminal (pick up `.zshrc`), run `npm run start:prod-dev-client`, start AVD `Vyaamikk_Pixel_API35` (or physical device with existing `development-production-otp` client). Rebuild the development client **only if** the installed client is missing or native plugins changed — laptop migration alone does not require a new EAS build.

---

## Incident: Phone Auth autofill + reCAPTCHA + “OTP not found” (2026-08-07)

Coordinated physical-device acceptance failure after SMS region allowlist fix (SMS arrives). Three defects treated as one Phone Auth incident.

### Forensic root causes

| Defect | Proven cause | Evidence |
|---|---|---|
| Gboard suggested number ignored | `acceptLocalMobileInput` rejected non-digit-only strings; `maxLength={10}` could truncate `+91…` autofill before normalisation | `src/auth-v2/phoneValidation.ts` (pre-fix), `PhoneEntryScreen.tsx` |
| Browser / Custom Tab every send | No `forceRecaptchaFlowForTesting` / bypass in source. Side-loaded preview APK is a **supported Firebase fallback** path when Play Integrity cannot attest Play-distributed install. Separately, `google-services.json` has **zero `oauth_client` certificate hashes** (`check:firebase-client` warning) — SHA registration must be verified in Firebase Console before blaming only side-load | Repo search empty for bypass APIs; package `com.specialsoftwares.vyaamikkdiary`; project `vyaamikk-diary`; RNFirebase Auth **24.1.0** → Android Firebase BOM **34.14.0** (Play Integrity capable); install source = side-loaded preview |
| Correct OTP → failure | In-memory `Map` keyed by opaque `rnfb_*` held `ConfirmationResult` only. AuthFlowGate persisted challenge id to AsyncStorage and remounted OTP after Custom Tab **without** the Map → confirm threw `otp_expired` / “Verification session expired…”. Literal `"OTP not found"` is **not** in the phone path; nearest alternate is email mock “Verification expired or not found.” User-facing symptom matches **lost verification session** after browser return | `git show HEAD:src/services/auth/nativePhoneAuth.ts` Map + opaque id; hydrate in `AuthFlowGate.tsx` |

### Sequence (post-fix)

phone input → `ingestIndianMobileFieldInput` → confirm UI → clear stale native auth (fresh challenge) → `signInWithPhoneNumber` → Play Integrity or reCAPTCHA → store Firebase `verificationId` in memory **and** SecureStore (TTL) → navigate OTP → manual `confirm(code)` **or** challenge-scoped post-send auto-verify (matching phone + auth after challenge start) → common post-auth continuation → `resolveOrCreateUserByPhone` → claim/UEID/profile routing. Empty OTP is never accepted merely because `currentUser` exists.

### Code changes (this incident)

- `src/auth-v2/phoneValidation.ts` — single India ingest/normalise pipeline
- `src/auth-v2/screens/PhoneEntryScreen.tsx` — `maxLength={18}`, `importantForAutofill`, ingest on change
- `src/services/auth/nativePhoneAuthSession.ts` — SecureStore-backed resumable session
- `src/services/auth/nativePhoneAuth.ts` — Firebase verificationId as challenge id; restore; credential path; send/confirm in-flight; auto-sign-in
- `src/auth-v2/AuthFlowGate.tsx` — auto-verify subscription; verify in-flight; otp error display
- `src/domain/errors.ts` — preserve specific `otp_expired` / `invalid_otp` messages
- Tests: phone validation, native phone auth, session store

### App-verification matrix (expected)

| Install | Expected mechanism |
|---|---|
| Dev client outside Play | Often reCAPTCHA fallback |
| Side-loaded preview APK | Often reCAPTCHA fallback (not a defect by itself) |
| Play Internal Testing | Silent Play Integrity when SHA + Play services OK |
| Play production | Silent Play Integrity under normal conditions |
| No Google Play services | reCAPTCHA or failure |
| Firebase fictional test numbers | Test config only; never production real SMS |

### Gates run

`typecheck` · `lint:eslint` · `expo-doctor` 18/18 · `test:native-phone-auth` · `test:phone-validation` · `test:production-mock-otp-isolation` · `test:startup` · `test:auth-policy-matrix` · `test:onboarding-wizard` · `check:firebase-client` (ok with SHA/`oauth_client` warning)

### Physical device

No ADB device attached at closure time (`adb devices` empty). Physical E2E OTP confirm **not** re-run after the fix.

### Rebuild

**Required for the installed preview APK** (JS session + autofill changes). Native deps / plugins / `google-services.json` / signing config **unchanged** in this pass — rebuild is for shipping the JS bundle into a standalone binary, not for a native plugin change. Prefer `eas build --profile preview` with next unused `versionCode`. Dev-client + Metro can validate JS without a new native binary if an existing development client is already installed.

**Acceptance build finished (2026-08-07):**
- EAS history max `versionCode` was **4** → next unused **5** (`app.json` bumped)
- Build ID: `f49d5926-8a8e-4f3c-85bd-c83f713d3d8b` · **FINISHED**
- APK: https://expo.dev/artifacts/eas/m58F36Mw8GbrmZCkBuDnef6lF8RQyRCVIzs2JyaSUi8.apk
- Install page: https://expo.dev/accounts/vydspecial2026/projects/vyaamikk-diary/builds/f49d5926-8a8e-4f3c-85bd-c83f713d3d8b
- Profile: `preview` · package `com.specialsoftwares.vyaamikkdiary` · project `vyaamikk-diary`
- Preview signing (EAS default keystore `Build Credentials 0KyVXiWXf1`, matches APK `4bcbde8e` apksigner):
  - SHA-1: `20:F8:15:0E:21:3C:9C:3F:84:FD:CA:C5:1E:9E:4D:CC:EE:A2:42:AD`
  - SHA-256: `E6:88:FA:0B:A5:FA:3B:D3:05:85:11:4F:8C:21:43:E1:EF:DD:A1:AC:BF:DB:9D:AA:DC:42:DA:89:61:78:75:2A`
- Live Firebase Console SHA membership: **not re-listed here** (Firebase CLI token expired; Console requires interactive Google sign-in). `oauth_client: []` is **not** treated as proof fingerprints are missing. Owner: confirm the two fingerprints above under Project settings → Android app. Do **not** rotate keystore or add a second Android app.
- `GOOGLE_SERVICES_JSON` EAS file secret: **not replaced** (local + prior/current preview APK bake both target `vyaamikk-diary` / `com.specialsoftwares.vyaamikkdiary` / `1:982505811909:android:784cb8df7f5523beea25ac`)

### Owner external actions still required

1. In Firebase Console, confirm preview signing SHA-1/SHA-256 above are registered on Android app `com.specialsoftwares.vyaamikkdiary` (add only if missing — do not create a new app or rotate keys). Later add Play App Signing certs for Internal Testing Integrity proof.
2. Install versionCode **5** preview APK and run the physical Phone Auth acceptance checklist.
3. Play Internal Testing is a **separate** follow-up for silent Play Integrity (Play App Signing SHA may differ).

### Remaining risks

- Side-loaded APK may still open browser reCAPTCHA even when SHA is correct (expected).
- Process death under extreme memory pressure may still clear SecureStore TTL edge cases after 10 minutes.
- Auto-verify + manual confirm race is guarded but device OEMs vary.

### Final status

`Client flow resolved; Play-installed verification pending` — preview APK built; physical OTP acceptance on device still required before declaring Phone Auth complete.

---

## Incident: Verify → `OTP send failed` / `NOT_FOUND` (2026-08-07, vc5 physical)

### Proven source of visible `NOT_FOUND`

1. **UI title** hard-coded in `PhoneAuthErrorPanel` as `"OTP send failed"` for every sticky auth error — including post-OTP failures.
2. **Error body** `NOT_FOUND` is the Firebase Callable / gRPC message for `functions/not-found`, mapped in `identityCallable.ts` (`code === "functions/not-found"` → `AppError("not_found", message)`).
3. **Failure phase:** `RESOLVE_OR_CREATE_USER_START` (post Firebase phone sign-in). **CASE A.**

### Exact technical cause

`callFunction` used native `@react-native-firebase/functions` via `functions().httpsCallable(name)` with **no region**. RNFirebase defaults `_customUrlOrRegion` to **`us-central1`**. All identity callables (`resolveOrCreateUserByPhone`, etc.) are defined with `{ region: "asia-south1" }`. Calling the wrong region yields `functions/not-found` / visible `NOT_FOUND` even when the correct OTP already established `auth().currentUser`.

JS SDK path already passed `asia-south1`; native production path did not.

### Corrections

- `identityCallable.ts` — `functions(region)` with `canonicalFunctionsRegion(env…)` → `asia-south1`
- Phase-aware error titles (`Couldn't send` / `Couldn't verify` / `Couldn't finish account setup`) + on-screen `Diagnostic:` codes through acceptance testing
- Removed visible “Code valid for …” countdown from phone OTP screen; resend countdown only; internal SecureStore TTL retained
- `confirmOtp` marks `firebaseSignInSucceeded` on post-auth failures so retries do not imply OTP failure

### Functions deploy

`firebase functions:list` blocked (`firebase login --reauth` required as `support.vyd@specialsoftwares.com`). After region fix, if diagnostic still shows `FN_NOT_FOUND:asia-south1:resolveOrCreateUserByPhone`, deploy minimum identity callables only.

### Rebuild

versionCode **6** preview **FINISHED** after gates green (client contract fix cannot ship via server-only change).
- Build ID: `064039dd-e45c-479a-b3e6-a4c31207428e`
- APK: https://expo.dev/artifacts/eas/3tBIv5N65UpmN2kB3SaKCGsWRekxuhBdi80Su8vbSnk.apk
- Install: https://expo.dev/accounts/vydspecial2026/projects/vyaamikk-diary/builds/064039dd-e45c-479a-b3e6-a4c31207428e
- Keystore unchanged (`Build Credentials 0KyVXiWXf1`)

### Final status (this incident)

`Root cause repaired; new preview physical test pending`

---

## Incident: `functions/unauthenticated` after OTP (2026-08-07, vc6 physical)

### Proven boundary

vc6 reached `resolveOrCreateUserByPhone` in **asia-south1** (no longer `not-found`). Server rejected with `functions/unauthenticated` → `request.auth` absent.

### Classification (single cause)

**C. Auth token / currentUser readiness race** (hardened with explicit same-app Functions binding).

Phone OTP confirms on `@react-native-firebase/auth`, then the client immediately called native `httpsCallable` without forcing `currentUser.getIdToken(true)` / bounded auth hydration. Native Functions attaches tokens from the same `FirebaseApp` only when Auth has a usable ID token; racing the callable yields a correctly routed but unauthenticated invoke.

Not: wrong region · OTP session loss · server weakening · signOut between confirm and callable (`clearNativePhoneAuthSession` only clears SecureStore).

### Stack ownership

| Concern | Stack |
|---|---|
| Phone Auth / currentUser / ID token | `@react-native-firebase/auth` |
| Identity callables | `@react-native-firebase/functions` on same `[DEFAULT]` app, region `asia-south1` |
| Firestore / Storage | Firebase **JS** SDK (bridged later via `mintClientAuthToken`) |

### Corrections (no Functions deploy; no vc7 yet)

- `nativeCallableAuthGate.ts` — wait for `currentUser` + `getIdToken(true)` before callables
- `identityCallable.ts` — `getFunctions(getApp(), region)` same-app assert; Functions-domain errors; no “Sign in again” for post-auth unauthenticated
- AuthFlowGate — **Try again (no new SMS)** retries identity only while Firebase session remains
- Diagnostics — `failureDomain=functions`, no `firebaseAuthCode=auth/unknown` for known Functions errors
- Validity timer remains removed

### Build policy

Per instruction: **no versionCode 7** until this repair is accepted for build. Physical acceptance requires a new preview APK (JS-only) after owner approval.

### Final status

`Auth token propagation repaired; physical retest pending`


