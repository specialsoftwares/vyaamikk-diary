# Pre-Build Edge Case Handover

**Date:** 2026-06-08  
**Scope:** Final corrections before Firebase deploy + EAS build

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
