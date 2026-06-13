# Known Risks — Vyaamikk Diary

Confirmed from codebase inspection (2026-06-04). Not theoretical.

## PO serial allocation

**Status: transaction-protected (safe).**

`firebasePurchaseOrderRepository.allocateSerial` in `src/services/purchaseOrder/firebase.ts` uses Firestore `runTransaction` on `users/{uid}/counters/{counterId}`. Retry with the same idempotency key does not allocate a new serial (covered by `saveLock.test.ts`).

**Risk if bypassed:** duplicate PO serial numbers under concurrent creates with different idempotency keys.

## Auth session vs Firebase token expiry

**Status: documented risk — no new auth stack added.**

App boot restores session from SecureStore (`vyd_session_v2`) without `onAuthStateChanged`. Firestore writes use the active Firebase client; if the ID token expires mid-session and refresh fails, saves may fail with permission errors until re-login.

**Mitigation today:** existing `userFacingMessage` on save paths; no silent swallow.

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
