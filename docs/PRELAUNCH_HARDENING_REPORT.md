# Pre-Launch Hardening Report — Vyaamikk Diary

**Date:** 2026-07-14
**Scope:** full re-initialization audit (Phases A–M of the pre-launch directive).
**Authority order applied:** code > config > tests > git > deployment state > docs.

---

## Findings table

| Finding | Severity | Evidence | File/Service | Action Taken | Remaining Manual Step |
|---|---|---|---|---|---|
| JS-SDK auth never signed in: all direct Firestore writes (customer credit, PO, letterhead, pro pack, diary sync) and Storage uploads run with `request.auth == null` in production → denied by rules | **P0** | No `signInWithCustomToken`/bridge anywhere in repo; rules require `request.auth.uid == uid`; native OTP session lives only in `@react-native-firebase/auth` | `src/config/firebase.ts`, all record repos, `userStorage.ts` | Implemented `mintClientAuthToken` callable + `jsAuthBridge.ts` (`signInWithCustomToken`), AsyncStorage persistence for JS auth, wired at OTP confirm / boot / updateProfile / reactivation; test `test:js-auth-bridge` | Deploy functions; grant runtime service account **Service Account Token Creator**; verify on device (QA A9/A14) |
| Boot session revalidation reads `phoneIndex/{phone}`, which production rules deny → every production relaunch would sign the user out | **P0** | `firestore.rules` `phoneIndex: allow read: if false`; `state/auth.tsx` used `loadProfileByPhoneFirestore` | `src/state/auth.tsx`, `src/services/auth/profileByPhone.ts` | Production boot now reads own `users/{uid}` via bridge (`loadProfileByUidFirestore`); transient failures keep cached session instead of force-clearing | Device QA A14 |
| Firestore/Storage rules never verified as deployed (Firestore created in Test Mode; expiry email ~14 Jun 2026) | **P0 (deployment)** | Firebase CLI token expired (401/invalid_grant), console state unverifiable from repo | `firestore.rules`, `storage.rules` | Local rules audited: **secure** (no `if true`, no test-mode expiry, UID isolation, server-owned indexes, protected identity fields, deny-all Storage wildcard) | `firebase login --reauth`, then `firebase deploy --only firestore:rules --project vyaamikk-diary` and `--only storage`; confirm published timestamp in Console |
| Firebase CLI unauthenticated | **P0 (deployment)** | `firebase projects:list` → 401; refresh token rejected (400) | local CLI | None possible from repo | `firebase login --reauth` as `shivamsaurav.special@gmail.com` |
| Unused `android.permission.RECORD_AUDIO` + duplicated location permissions injected into app.json (during failed EAS attempt) | **P1** | `git diff app.json`; zero audio API usage in repo | `app.json` | Removed; deduplicated; `expo-image-picker` plugin `microphonePermission: false` prevents re-injection | None |
| Accidental uncommitted edit disabled the Dukaan PDF button loading state (`// loading={busy}`) | **P1** | `git diff app/(app)/customer-credit/[id].tsx` | customer-credit detail screen | Reverted file to HEAD | None |
| Grievance officer name and registered address are bracketed placeholders; `assertProductionConfig` does not block on them | **P1 (store/legal)** | `src/config/legal.ts` `[GRIEVANCE OFFICER NAME…]`, `[REGISTERED ADDRESS…]` | `src/config/legal.ts` | Not fabricated (requires real legal data) | Owner supplies real name/address + effective date before store submission |
| Legal URLs configured but website live-status unknown | **P1 (store)** | `env.ts` defaults → `vyaamikk.specialsoftwares.in/{privacy,terms,legal,delete-account}` | `src/config/env.ts` | Verified no `example.com` anywhere reachable | Deploy website; verify each URL live |
| i18n gaps: hi missing 67 leaf keys (whole `consent`, `materialMovement`, `workTeam` sections); ta/te/gu each missing 22 (incl. `consent` prefixes) | **P2** | JSON structural diff vs `en.json` (2 401 leaf keys) | `src/i18n/locales/*.json` | Documented; English fallback works, no raw keys, no crash | Translate missing keys via existing `i18n:translate-draft` + review tooling |
| Firebase App Check not installed (iOS App Attest / Play Integrity) | **P2** | No `@react-native-firebase/app-check`, no plugin, no code | — | Rollout checklist written (below) | Follow checklist post-launch-candidate; never enable enforcement before verified tokens |
| No crash reporting (Crashlytics/Sentry absent) | **P2** | package.json, plugins | — | Documented | Choose and integrate a crash reporter before public launch |
| Backup/console tasks (PITR, scheduled exports, backup bucket, IAM, restore drill) unverifiable from repo | **P2** | `docs/BACKUP_AND_RECOVERY.md` describes intent only | Firebase/GCP console | Documented as unverified | Complete console-side setup; run restore drill |
| Storage upload mechanism on RN | verified OK | `uploadString(ref, base64)` — avoids the `fetch(file://).blob()` zero-byte RN pitfall | `userStorage.ts` | No change needed | Device QA S1–S8 (device-only proof) |
| Production mock-OTP fallback | verified impossible | `getActiveBackend()` structurally returns only `firebase-production`/`not-configured` when `EXPO_PUBLIC_APP_MODE=production`; `assertProductionNativeOtp` hard-blocks | `env.ts`, `nativePhoneAuth.ts` | None needed | — |
| Cash Paid denomination UI/validation/PDF | verified removed | `test:cash-paid-no-denomination` passes; legacy `denominationBreakdown` ignored safely | composer, validation, PDF services | None needed (done in commit 81af3c5) | QA P3 |
| PDF filenames | verified human-readable | every `pdfService.generate` caller passes structured `fileName`; `test:pdf-file-names` passes | `pdfFileNames.ts` | None needed (done in commit 81af3c5) | QA P1 |
| Deletion-mode reactivation | verified backend-enforced | callables check fresh phone OTP (10-min TTL), exact phone-index ownership, fresh email verification; rules block client edits of `status`/deletion/reactivation fields | functions/reactivation, `firestore.rules` | None needed (done in commit 81af3c5) | QA A10–A12 |
| Dev placeholders in production UI | verified absent | all `123456`/dev-banner/dev-reset code `__DEV__`- or `env.isDevelopment`-gated; `backend.*` mock-OTP i18n keys are dead (never rendered) | settings.tsx, OtpVerificationScreen | None needed | — |
| Secrets in git | verified clean | only `.env.example` tracked; native Firebase configs on disk but git-ignored; `.easignore` does **not** exclude them so EAS receives them | `.gitignore`, `.easignore` | None needed | — |
| `_saveLocks` / `completedSteps[]` / `clientRecordId` / `idempotencyKey` | verified intact | 4 save test suites pass; no semantics touched this pass | `src/services/records/` | None | — |

## Firestore warning resolution

The local `firestore.rules` are production-safe (audited line-by-line: owner-only
access, server-owned indexes locked, `protectedIdentityFieldsUnchanged()` guard,
no `request.time` expiry, no wildcard allow). **However, what is live in the
`vyaamikk-diary` project cannot be confirmed until the CLI is re-authenticated and
the rules are deployed.** Until Console confirmation, treat the Test-Mode expiry as
unresolved-blocking.

After deploy, confirm manually: Firebase Console → Firestore Database → Rules →
published timestamp + contents match repo.

## Cloud Functions inventory

| Function | Trigger | Region | Client caller | Auth | Reads/Writes | Deployed? |
|---|---|---|---|---|---|---|
| `resolveOrCreateUserByPhone` | callable | asia-south1 | `callResolveOrCreateUserByPhone` (post-OTP) | required | users, phoneIndex, ueidIndex, retiredPhones | unknown (CLI blocked) |
| `claimMobile` | callable (alias) | asia-south1 | — | required | same | unknown |
| `mintClientAuthToken` | callable | asia-south1 | `callMintClientAuthToken` (JS auth bridge) | required | none (Admin Auth only) | **NEW — not deployed** |
| `startEmailVerification` | callable | asia-south1 | email verify flow | required | pendingEmailVerifications | unknown |
| `verifyAndBindEmail` | callable | asia-south1 | email verify + reactivation | required | users, emailIndex, pendingEmailVerifications | unknown |
| `changeVerifiedEmail` | callable | asia-south1 | settings identity | required | users, emailIndex | unknown |
| `retireIdentity` | callable | asia-south1 | account deletion | required | users, indexes, retiredPhones | unknown |
| `completeAccountDeletion` | callable | asia-south1 | `callCompleteAccountDeletion` | required | users, indexes | unknown |
| `scheduledDeletionCleanup` | scheduled | asia-south1 | — | n/a | users, indexes | unknown |
| `startAccountReactivation` | callable | asia-south1 | pending-deletion screen | required + fresh phone OTP | users, phoneIndex, pendingEmailVerifications | unknown |
| `completeAccountReactivation` | callable | asia-south1 | pending-deletion screen | required + fresh phone+email proof | users | unknown |

`npm --prefix functions run build` passes. App Check requirement: not configured on
any function (consistent with App Check not being rolled out).

## App Check rollout checklist (P2 — post-candidate)

1. Install `@react-native-firebase/app-check`; add plugin config.
2. Register iOS App Attest + Android Play Integrity in Firebase Console.
3. Initialize with debug provider for dev builds; ship an EAS build with providers.
4. Watch Firestore/Storage/Functions App Check metrics until verified-traffic ratio is stable.
5. Only then enable enforcement, product by product.

## Test results (2026-07-14)

`npm run typecheck` ✅ · `npm run lint` ✅ (**note: lint is an alias for typecheck — there is no ESLint pass**) · `npm --prefix functions run build` ✅

All 32 tsx test suites pass: i18n, formatters, identity-mobile, customer-credit,
customer-credit-save, letterhead-pdf, save-idempotency, save-hardening,
save-lifecycle, save-locks, amount-in-words, cash-paid-serial, pdf-file-names,
cash-paid-no-denomination, reactivation-routing, **js-auth-bridge (new)**,
native-phone-auth, legal-consent, identity-email, auth-wrapper, deletion, inr,
inr-words, cash-date, financial-year, pdf-gujarati, pdf-redesign, pro-pack-dedupe,
draft-meaningful, share-text, display-alias, payment-period.

No Firestore-rules emulator test suite exists (gap, P2).

## Remaining blockers

- **P0:** re-authenticate Firebase CLI; deploy Firestore rules, Storage rules, and functions (including `mintClientAuthToken`); grant Token Creator IAM; Console confirmation of rules.
- **P1:** grievance officer/address placeholders in `legal.ts`; website legal URLs not confirmed live; full manual device QA (`docs/PRELAUNCH_DEVICE_QA.md`) — especially A9/A14 (bridge) and S1–S8 (storage on device).
- **P2:** i18n missing keys; App Check; crash reporting; backup console setup; Firestore-rules emulator tests.
- **P3:** AI, monetisation, Jira, further visual polish.

**Flippable hero card / Liquid Glass** — verified implemented correctly
(`src/components/you/DigitalBusinessIdentityCard.tsx`): the outer
`DashboardGreetingHeroSurface` shell is never transformed or faded; only the inner
front/back face layers rotate (`rotateY` with perspective, opacity crossfade);
reduce-motion snaps without animating; tap target has accessibility role/label/hint;
stage height is pre-measured so there is no layout shift. Glass surfaces use
`BlurView` with an opaque themed fallback (`src/components/ui/GlassSurface.tsx`).
The tab bar itself is the system `NativeTabs` bar (Liquid Glass on iOS 26+,
Material 3 on Android) — no custom migration performed.
