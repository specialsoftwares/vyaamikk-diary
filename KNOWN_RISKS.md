# Known Risks — Vyaamikk Diary

Confirmed from codebase inspection (2026-06-04). Not theoretical.

## Firestore letterhead base64 size limit

**Status: resolved (Storage migration).**

Letterhead template images now upload to Firebase Storage (`users/{uid}/letterhead/…`) with `letterheadImageStoragePath` as the canonical Firestore field. Legacy inline `imageDataUri` is migrated idempotently via `runLetterheadStorageMigrationForUser()`. See `docs/STORAGE_SECURITY.md`.

## PO serial allocation

**Status: transaction-protected (safe).**

`firebasePurchaseOrderRepository.allocateSerial` in `src/services/purchaseOrder/firebase.ts` uses Firestore `runTransaction` on `users/{uid}/counters/purchaseOrder`. Retry with the same idempotency key does not allocate a new serial (covered by `saveLock.test.ts`).

**Risk if bypassed:** duplicate PO serial numbers under concurrent creates with different idempotency keys.

## Cash Paid voucher (CPV) serial allocation

**Status: transaction-protected (safe).**

`allocateCashPaidVoucherSerial` uses Firestore `runTransaction` on `users/{uid}/counters/cashPaidVouchers` with financial-year rollover (`CPV/YYYY-YY/XXXX`). An existing serial on the record is reused on PDF re-export. See `src/services/cashPaid/cashPaidVoucherSerial.firebase.ts`.

## Firebase Storage PDF backup path

**Status: rules only — not enabled in V1 app.**

`storage.rules` allows `users/{uid}/pdfs/{recordId}/…` for future cloud PDF backup. The mobile app does not upload PDFs to Storage in V1.

## Auth session vs Firebase token expiry

**Status: documented risk — no new auth stack added.**

App boot restores session from SecureStore (`vyd_session_v2`) without `onAuthStateChanged`. Firestore writes use the active Firebase client; if the ID token expires mid-session and refresh fails, saves may fail with permission errors until re-login.

**Mitigation today:** existing `userFacingMessage` on save paths; no silent swallow.

## JS-SDK auth bridge (production Firestore/Storage access)

**Status: fixed in repo (2026-07-14) — deployment + device QA pending.**

Production phone auth lives in `@react-native-firebase/auth`; Firestore/Storage use the firebase JS SDK. Before 2026-07-14 the JS SDK was never signed in, so all direct record writes and Storage uploads in production were `request.auth == null` → denied by rules, and boot revalidation read the client-forbidden `phoneIndex` (would sign users out on relaunch). Fixed via `mintClientAuthToken` callable + `signInWithCustomToken` (`src/services/auth/jsAuthBridge.ts`), AsyncStorage persistence for the JS session, and uid-based boot revalidation.

**Residual risk:** the bridge depends on the callable being deployed and the functions service account holding *Service Account Token Creator*. If the bridge fails at runtime, records surface retryable errors and diary stays local-first (no data loss). Device QA items A9/A14 must pass before release.

## `npm run lint` is not ESLint

**Status: honest limitation.**

`lint` aliases `typecheck` (`tsc --noEmit`). There is no ESLint pass in this repo.

## `_saveLocks` non-atomic acquisition across devices

**Status: intentional architecture — not changed this pass.**

Save locks live in `users/{uid}/_saveLocks/{clientRecordId}` with client-side idempotency in `saveIdempotency.ts`. Two devices with different `clientRecordId` values could theoretically race; product assumes single active device per user for create flows.

## Boot prepare phase

**Status: mitigated.**

Previously `app/index.tsx` returned `null` during DB prepare (white flash risk). Now renders a themed full-screen placeholder with `BRAND_SURFACE` / theme background until routing phase.

## Language switch listener lifecycle

**Status: OK as implemented.**

`I18nProvider` registers `i18n.on("languageChanged")` once with cleanup on unmount. `mountKey` remounts children after switch; listener stays on singleton `i18n` instance — not orphaned.

## AsyncStorage JSON.parse

**Status: hardened paths reviewed.**

Critical paths (`sessionStore`, `saveIdempotency`, `readStoredLang`, location prefs, recent searches, FY recap) already use try/catch with safe defaults. Corrupted keys may leave stale data until explicit clear — acceptable for non-critical caches.

## Cash Paid denomination fields (legacy records)

**Status: removed from UX/PDF (2026-06-08).**

Composer no longer collects note counts. Full Legal Record PDF no longer renders a denomination table. Older dev records may still contain `denominationBreakdown` in Firestore — ignored on read/export; no migration required.

## Deletion-mode account reactivation

**Status: backend-enforced (2026-06-08).**

Pending-deletion login returns `deletion_pending` from `resolveOrCreateUserByPhone`. Production reactivation requires fresh phone OTP (native auth session) plus email verification via `startAccountReactivation` → `verifyAndBindEmail` → `completeAccountReactivation`. Client cannot set `status: active` directly — Firestore rules block lifecycle field writes.

**Remaining QA:** Emulator/device E2E for reactivation after Functions deploy.

## Firebase Storage JS SDK (letterhead / CPV photos)

**Status: active — real-device upload QA still required.**

Letterhead images and Cash Paid receipt photos upload via `firebase/storage` JS SDK (not `@react-native-firebase/storage`). Upload mechanism is base64 `uploadString()` — deliberately avoids the unreliable `fetch(file://).blob()` pattern on React Native. Requires the JS auth bridge (above). Validate upload/share on iOS/Android dev builds (QA S1–S8).

## Legal config placeholders

**Status: blocking store submission — owner input required.**

`src/config/legal.ts` still contains `[GRIEVANCE OFFICER NAME…]` and `[REGISTERED ADDRESS…]` placeholders plus a provisional effective date. `assertProductionConfig()` blocks only URL/support-email placeholders, not these. Real values must be supplied before store release.

## i18n coverage gaps (English fallback)

**Status: P2 — no crash, no raw keys.**

Versus `en` (2,401 leaf keys): `hi` missing 67 (whole `consent`, `materialMovement`, `workTeam` sections); `ta`/`te`/`gu` each missing 22 (incl. `consent` prefixes on the mandatory pre-OTP consent screen). Missing keys render in English via i18next fallback.

## App Check and crash reporting absent

**Status: P2 — post-candidate.**

No `@react-native-firebase/app-check`, Crashlytics, or Sentry installed. Rollout checklist in `docs/PRELAUNCH_HARDENING_REPORT.md`. Do not enable App Check enforcement before verified tokens reach Firebase.
