# Vyaamikk Diary — Re-initialization Architecture Map

**Date:** 2026-07-14
**Source of truth:** current repository code (verified by direct file inspection, not prior summaries).
**Stack:** Expo SDK 54 · React Native 0.81 · expo-router 6 · TypeScript strict · Firebase (dual SDK, see §4).

---

## 1. Application entry and boot

Provider tree (`app/_layout.tsx`):

```
RootLayout
└─ AppProviders
   ├─ public routes (/landing, /legal) → SharedShellProviders only
   └─ all other routes:
      SharedShellProviders (GestureHandlerRootView → SafeAreaProvider →
        ThemeProvider → I18nextProvider → I18nProvider → LocaleFontProvider)
      → LocalDbProvider → AuthProvider → SyncProvider → AppFeedbackProvider
```

Module-level side effects at import: `assertProductionConfig()` and
`SplashScreen.preventAutoHideAsync()` (`app/_layout.tsx`).

Boot order (`app/index.tsx` — `BootScreen`):

1. Wait for SQLite (`initializeLocalDatabase()`, `src/localDb/init.ts` — idempotent,
   migrations v1→v6, self-repairing).
2. Hide splash, enter `routing` phase.
3. When auth state resolves, run `resolveBootDestination()`
   (`src/boot/resolveBootRoute.ts` — local-only, no network):
   signed-out → auth entry (`/(auth)/v2`); email completion pending → `/(auth)/v2`;
   onboarding/profile gates → onboarding href; active composer draft →
   draft-continuation sheet; else `/(app)/(tabs)/you`.
4. Boot animation (`consumeBootAnimationSlot`, `BootAnimationGate`) runs in parallel;
   12-second safety timeout force-releases to the app.

Session restore: `AuthProvider` (`src/state/auth.tsx`) loads the SecureStore session
(`vyd_session_v2`, full `UserProfile`), then revalidates against the backend with a
6-second timeout. Production revalidation reads `users/{uid}` by uid over the bridged
JS-SDK session (see §4); transient failures keep the cached session, a confirmed
missing/login-blocked profile force-clears it.

Firebase JS app init is **lazy** (`src/config/firebase.ts` getters) — nothing
initializes eagerly at boot. The native `@react-native-firebase` app auto-initializes
from `google-services.json` / `GoogleService-Info.plist`.

## 2. Navigation

Root `Stack` (fade). 74 screens.

- **Unauthenticated** `app/(auth)/`: `v2` (the shipped sign-in wrapper; `AUTH_ENTRY_HREF`),
  `otp`, `login`, `ueid`, `complete-profile`, `onboarding-intro`, `location-onboarding`,
  `change-mobile`, `account-pending-deletion`.
- **Public** `app/(public)/landing`, `app/legal/[doc]` — render without app providers.
- **Tabs** `app/(app)/(tabs)/_layout.tsx` — **`NativeTabs` from
  `expo-router/unstable-native-tabs`** (system tab bar; Liquid Glass on iOS 26+,
  Material 3 on Android). Active tint `#4338CA`. Four tabs, in order:
  1. `calendar` — label `calendarMaps.tabLabel` ("Calendar")
  2. `you` — label `you.title`
  3. `saved-records` — label `savedRecords.tabLabel`
  4. `settings` — label `settings.tabLabel` ("Settings & Info")
- **App routes** `app/(app)/`: composer (`composer/[type]`, `composer/movement`),
  diary (`index/new/[id]/edit/work-team/material-movement`), customer-credit
  (Dukaan: `index/[id]/form/payment/close`), purchase-order, professional-pack,
  letterhead (`index/create/setup/history`), statutory, at-a-glance, map, search,
  profile, drafts, settings sub-screens (about, disclaimer, terms, legal, pdf-privacy,
  identity, location-footprints, delete, dev-reset, business-insights + views).

## 3. Authentication and identity (production)

```
Phone number
→ startNativePhoneOtp()            @react-native-firebase/auth signInWithPhoneNumber
→ confirmNativePhoneOtp()          confirmation.confirm(code) → native Firebase user
→ callResolveOrCreateUserByPhone() callable over @react-native-firebase/functions
                                   (carries the native ID token)
→ ensureJsAuthSession()            mintClientAuthToken callable → signInWithCustomToken
                                   on the firebase JS SDK (bridge for Firestore/Storage)
→ session persisted (SecureStore)  → email collection/verification → profile completion
→ dashboard
```

Verified in code (not comments), `src/services/auth/firebase.ts`:

- `startOtp` → `startNativePhoneOtp(phoneE164)` ✅
- `confirmOtp` → `confirmNativePhoneOtp` → `callResolveOrCreateUserByPhone` →
  `ensureJsAuthSession()` ✅
- `signOut` → JS `getFirebaseAuth().signOut()` **and** `signOutNativePhoneAuth()` ✅

Backend selector (`src/config/env.ts` `getActiveBackend()`): in production mode the
only reachable outcomes are `firebase-production` or `not-configured`. The mock-OTP
backends (`firebase-shared-dev` with `123456`, `local-mock`) are **structurally
unreachable in production**; `assertProductionNativeOtp()` additionally hard-blocks
web and unlinked-native.

- **Session persistence:** `src/services/session.ts` — SecureStore (native) /
  AsyncStorage (web), key `vyd_session_v2`, full profile so boot routing needs no network.
- **Email verification:** server-driven — `startEmailVerification` /
  `verifyAndBindEmail` callables; production skips all client email-index writes.
- **Account deletion:** `requestAccountDeletion` (grace, `pending_deletion`) →
  `completeAccountDeletion` callable / `scheduledDeletionCleanup`. Client cannot
  cancel deletion directly in production (`cancelDeletion.ts` blocks it).
- **Reactivation:** `resolveOrCreateUserByPhone` returns `deletion_pending` payload →
  `account-pending-deletion` screen → `startAccountReactivation` (fresh-phone-OTP TTL
  10 min, exact phone-index ownership check, registered email only) →
  `verifyAndBindEmail` → `completeAccountReactivation` (backend restores `status:
  "active"`, preserves UID/UEID). Firestore rules block clients from touching
  `status`, deletion/reactivation fields, `ueid`, `phoneE164`, `emailHash`
  (`protectedIdentityFieldsUnchanged()` in `firestore.rules`).

## 4. Firebase client architecture (dual SDK — load-bearing)

| Concern | SDK |
|---|---|
| Phone OTP / auth session | `@react-native-firebase/auth` (native) |
| Callables | `@react-native-firebase/functions` when native linked; JS fallback for web/dev |
| Firestore | firebase JS SDK (`firebase/firestore`) |
| Storage | firebase JS SDK (`firebase/storage`) |
| App Check / Crashlytics | not installed |

Installed native packages: `@react-native-firebase/{app,auth,functions}` only.

**The JS-SDK auth bridge (added 2026-07-14).** The native and JS SDKs hold separate
auth states. Before the bridge, the JS SDK was never signed in, so every direct
client Firestore write and Storage upload ran with `request.auth == null` and was
denied by production rules. Now:

- `functions/src/identity/mintClientAuthToken.ts` — callable (asia-south1) that mints
  a custom token for the caller's (native) uid.
- `src/services/auth/jsAuthBridge.ts` — `ensureJsAuthSession()` signs the JS SDK in
  with that token; verifies uid equality; single-flight; never throws.
- `src/config/firebase.ts` — JS auth initialized with AsyncStorage persistence on
  native, so the bridged session survives restarts and auto-refreshes.
- Wired at: OTP confirm, boot session revalidation, `updateProfile`,
  `finishReactivation`. Sign-out clears both SDK sessions.

**IAM prerequisite:** the functions runtime service account needs
*Service Account Token Creator* on itself for `createCustomToken`.

## 5. Firestore data map (no schema changes made)

User-owned (rules: `request.auth.uid == uid`):

```
users/{uid}                          profile (protected identity fields server-only)
users/{uid}/entries/{entryId}        diary/business entries
users/{uid}/professionalPacks/{id}
users/{uid}/letterheadDocs/{id}
users/{uid}/config/{id}              letterhead template config
users/{uid}/customerCreditRecords/{id}
users/{uid}/purchaseOrders/{id}
users/{uid}/counters/{id}            serial counters (delete: never)
users/{uid}/_saveLocks/{id}          save coordination metadata (delete: never)
users/{uid}/trustedDevices/{id}
```

Server-owned (`allow read, write: if false`; written by Admin SDK in functions):

```
phoneIndex/{phoneE164}    ueidIndex/{ueid}    emailIndex/{emailHash}
retiredPhones/{phone}     pendingEmailVerifications/{verificationId}
```

Account-status fields on `users/{uid}`: `status` (`active | pending_deletion |
deleted`), `deletionRequestedAt/ScheduledFor/CompletedAt`,
`reactivationRequestedAt/PhoneVerifiedAt/EmailVerifiedAt`, `retiredUeid`.

## 6. Save lifecycle

```
form state → validation → stable clientRecordId (once per form session)
→ beginCoordinatedSave()  [process mutex + AsyncStorage idempotency registry
                           + persistent Firestore _saveLocks (30-min TTL)]
→ decision: proceed | resume | return_done (replay)
→ base save → secondary steps via runRecordStepIfNeeded()
   (pdf_generated, pdf_uri_saved, search_indexed, insights_indexed, …)
→ completeCoordinatedSave() → success state
```

- `idempotencyKey` = `userId:recordKind:clientRecordId:draft:scope`.
- Completed steps never re-run on retry; PDF steps re-run only when no `pdfUri` exists.
- PDF failure flags `pdfFailed` without failing the base record.
- Live in-flight lock ⇒ `SaveStillInProgressError` (no duplicate).
- Per-type `saveWithPdf` services: customerCredit, letterhead, purchaseOrder,
  professionalPack; diary via `saveComposerEntry.ts`. Diary is local-first (SQLite,
  then cloud sync); other record types write Firestore directly.

## 7. PDF architecture

- `pdfService.ts` — single wrapper over expo-print/sharing (A4 595×842pt,
  `expo-file-system/legacy` deliberately). Screens never touch expo-print directly.
- `pdfDocumentShell.ts` — shared shell + fixed legal footer (`pdfLegalFooter.ts`,
  brand + legal-operator attribution).
- Per-document generators: cashPaid, purchaseOrder, customerCredit, letterhead,
  professionalPack, businessEntry, diaryEntry.
- **Filenames:** `pdfFileNames.ts` `buildPdfFileName()` — every current caller passes
  a structured `fileName` (party, serial, date; sanitized; length-capped; always
  `.pdf`). `fileNameHint` remains only as a legacy fallback.
- Letterhead mode: user image as full-page background, English-only enforced
  (`assertEnglishOnlyPdf`), no standard branding/footer.
- Gujarati: structural labels only via `GUJARATI_STRUCTURAL_LABELS`; user data,
  numbers, dates always en-IN Western Arabic numerals (`DATA_FORMAT_LOCALE`).
- Amount in words: `formatINRInWords(amount, "en-IN")` (rupees, paise, lakh, crore).

## 8. Storage architecture

- `src/services/storage/userStorage.ts` — firebase JS SDK, **base64
  `uploadString()`** (deliberately avoids the RN `fetch(file://).blob()` zero-byte
  pitfall). Requires the JS auth bridge (§4).
- Paths: `users/{uid}/letterhead/{file}`, `users/{uid}/attachments/{recordId}/{file}`,
  `users/{uid}/pdfs/{recordId}/{file}`. `storagePath` is canonical; `downloadUrl` is a
  refreshable cache.
- Letterhead migration (`letterheadStorageMigration.ts`): legacy `imageDataUri` →
  upload → write `letterheadImageStoragePath` → `deleteField()` base64. Idempotent,
  non-blocking, failure leaves base64 intact.
- Cash Paid photo (`cashPaidPhotoStorage.ts`): stable filename
  `cash-paid-{recordId}-{capturedAt}.jpg`; local-only fallback when storage
  unavailable; upload failure rethrows to the save coordinator (retryable, base
  record preserved).
- Storage rules: owner-only, image ≤10 MB / PDF ≤15 MB type+size guards, global
  deny-all wildcard.

## 9. i18n architecture

- Languages: `en, hi, ta, te, gu`. Runtime loads **`src/i18n/locales/*.json`**;
  `en.ts`/`hi.ts` are the authored sources (exported via `i18n:export-json`);
  ta/te/gu exist as JSON only (machine-translated + review tooling).
- i18next: `fallbackLng: "en"`, double fallback in `useT` (active → en → key),
  language persisted under `vyd_language_v1`, switch reloads via
  `LanguageSwitchScreen`.
- PDF labels: structural-only translation (`pdfLabels.ts`); PO and Letterhead PDFs
  forced English (`englishPdfT`).
- Data formatting is **always en-IN** regardless of UI language
  (`src/utils/formatters/constants.ts` `DATA_FORMAT_LOCALE`): amounts, dates, times,
  mobile numbers, GSTIN, serials.

## Stale-documentation discrepancies found

- Older handover text described `firebase.ts` OTP methods as stubbed seams — the
  header comment in `src/services/auth/firebase.ts` still says "integration seams",
  but the methods are fully wired (verified on disk).
- Prior reports treated the dual-SDK split as production-ready; the missing JS auth
  bridge (§4) was never previously identified. Fixed 2026-07-14.
- `README.md`/`HANDOVER.md` mention custom-token bridging as a TODO — now implemented.
