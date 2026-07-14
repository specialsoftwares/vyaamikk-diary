# Pre-Build Edge Case Handover

**Date:** 2026-06-08 · **Updated:** 2026-07-15 (Firestore production rules deployed)
**Scope:** Final corrections before Firebase deploy + EAS build

---

## 2026-07-15 update — Firestore production rules deployed

Production `firestore.rules` compiled and released successfully to Firebase project **`vyaamikk-diary`** on **2026-07-15 01:14 IST (UTC+5:30)** via `firebase deploy --only firestore:rules --project vyaamikk-diary` (after `firebase login --reauth`).

| Check | Status |
|-------|--------|
| Project ID | `vyaamikk-diary` |
| Rules compiled + released | ✅ |
| No test-mode expiry in local production rules | ✅ (no `request.time < timestamp.date(...)`) |
| No public wildcard in local production rules | ✅ (no `allow read, write: if true`; permissive rules remain in `firestore.rules.dev` only) |
| Firebase Console published timestamp | ⏳ **Pending** operator verification |

`firestore.rules` was **not modified** for this deploy — repo file matches what was released.

---

## 2026-07-14 update — JS-SDK auth bridge (P0)

Recon proved that production builds could sign in but **could not save any cloud
record or upload any image**: Firestore/Storage run on the firebase JS SDK, whose
auth was never signed in (`request.auth == null` → rules deny), and boot
revalidation read the client-forbidden `phoneIndex` (would sign users out on every
relaunch). Fixed:

- `functions/src/identity/mintClientAuthToken.ts` (new callable, asia-south1)
- `src/services/auth/jsAuthBridge.ts` (new) — `ensureJsAuthSession()`
- `src/config/firebase.ts` — AsyncStorage persistence for JS auth on native
- `src/state/auth.tsx` — boot revalidation by own uid; transient failure keeps
  cached session
- Wired at OTP confirm, boot, `updateProfile`, `finishReactivation`
- Test: `npm run test:js-auth-bridge`

**Before any EAS production-mode build:** deploy functions, grant the runtime
service account *Service Account Token Creator*, ~~deploy Firestore~~ ✅ Firestore
rules deployed 2026-07-15, deploy Storage rules,
and pass device QA A9/A14 (`docs/PRELAUNCH_DEVICE_QA.md`).

Also fixed 2026-07-14: `app.json` duplicate location permissions + unused
`RECORD_AUDIO` removed (`expo-image-picker` plugin `microphonePermission: false`);
accidental `// loading={busy}` regression on the Dukaan detail screen reverted.

---

## Final Corrections Before Build

### 1. PDF filename strategy

- Central utility: `src/services/pdf/pdfFileNames.ts` — `buildPdfFileName()`, `buildPdfFileNameForBusinessEntry()`
- Patterns: `Vyaamikk-Cash-Payment-Voucher-{Receiver}-{CPVSerial}-{Date}.pdf`, PO, letterhead, Dukaan, payment request, material movement, diary fallback
- `pdfService.generate()` accepts optional structured `fileName` input; share sheet uses sanitized name (Android copies to cache with friendly name)
- Tests: `npm run test:pdf-file-names`

### 2. Cash Paid denomination removal status

- Removed from composer UI, Zod schema, export validation, and CPV PDF (including Full Legal Record witness/footer blocks retained)
- Legacy `denominationBreakdown` on old records is ignored — no migration
- Tests: `npm run test:cash-paid-no-denomination`, `npm run test:cash-paid-serial`

### 3. Dev placeholder cleanup status

- `BackendModeBanner` returns null (no backend mode banner in UI)
- Mock OTP hint only when `env.isDevelopment` on OTP screen
- Developer reset section only under `__DEV__` in Settings
- Session clear error no longer mentions "dev build"

### 4. Deletion-mode login / reactivation backend enforcement

- `resolveOrCreateUserByPhone` returns `{ status: "deletion_pending", requiresReactivation, maskedEmail, … }` instead of throwing
- Production reactivation: `startAccountReactivation` → email code → `verifyAndBindEmail` → `completeAccountReactivation`
- `cancelAccountDeletion` blocked on `firebase-production` (must use reactivation flow)
- Firestore rules: clients cannot mutate `status`, deletion fields, `reactivation*`, `ueid`, `phoneE164`, `emailHash`
- Tests: `npm run test:reactivation-routing`

### 5. Tests run (this pass)

```bash
npm run typecheck
npm run lint
npm run test:i18n
npm run test:formatters
npm run test:identity-mobile
npm run test:letterhead-pdf
npm run test:save-idempotency
npm run test:amount-in-words
npm run test:cash-paid-serial
npm run test:pdf-file-names
npm run test:cash-paid-no-denomination
npm run test:reactivation-routing
npm --prefix functions run build
```

### 6. Remaining manual QA

1. Real-device OTP login (EAS dev build + deployed Functions)
2. Deletion-pending → reactivate with registered email (production Firebase)
3. Export/share PDFs on iOS + Android — confirm filenames visible outside app
4. Cash Paid Full Legal Record PDF — witness section present, no denomination table
5. Letterhead / CPV photo upload on device (Storage JS SDK)
6. Deploy: `firebase deploy --only functions,firestore:rules,storage`

---

## Untouched (explicit)

- `_saveLocks`, `completedSteps[]`, `clientRecordId`, `idempotencyKey`
- Unrelated Firestore record schemas
- PDF layout/content (except CPV denomination removal)
- en-IN formatters, boot animation, tab destinations, language switching architecture
