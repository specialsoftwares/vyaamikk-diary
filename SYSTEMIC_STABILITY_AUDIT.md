# Vyaamikk Diary — Systemic Stability Audit

Audit date: 2026-06-04. Source: repository file inspection (not assumptions).

---

## A. App routes under `app/`

| Route | File | Purpose | Access |
|-------|------|---------|--------|
| `/` | `app/index.tsx` | Boot: DB init → auth gates → route / draft sheet | Private shell |
| `/(public)/landing` | `app/(public)/landing.tsx` | Public landing | Public |
| `/(auth)/login`, `otp`, `v2`, etc. | `app/(auth)/*` | Phone OTP, profile, onboarding | Auth |
| `/(app)/(tabs)/you` | `app/(app)/(tabs)/you.tsx` | Dashboard | Signed-in |
| `/(app)/(tabs)/calendar` | `app/(app)/(tabs)/calendar.tsx` | Calendar / Maps tab | Signed-in |
| `/(app)/(tabs)/saved-records` | `app/(app)/(tabs)/saved-records.tsx` | Saved records | Signed-in |
| `/(app)/(tabs)/settings` | `app/(app)/(tabs)/settings.tsx` | Settings hub | Signed-in |
| `/(app)/composer/[type]` | `app/(app)/composer/[type].tsx` | Business entry composer | Signed-in |
| `/(app)/composer/movement` | `app/(app)/composer/movement.tsx` | Material movement sub-picker | Signed-in |
| `/(app)/customer-credit/*` | `app/(app)/customer-credit/*` | Dukaan / credit | Signed-in |
| `/(app)/purchase-order/*` | `app/(app)/purchase-order/*` | PO list / form | Signed-in |
| `/(app)/professional-pack/*` | `app/(app)/professional-pack/*` | Pro brief | Signed-in |
| `/(app)/letterhead/*` | `app/(app)/letterhead/*` | Letterhead | Signed-in |
| `/(app)/settings/business-insights*` | `app/(app)/settings/business-insights*.tsx` | Business insights | Signed-in |
| `/(app)/settings/identity` | `app/(app)/settings/identity.tsx` | Profile & business identity | Signed-in |
| `/(app)/settings/location-footprints` | `app/(app)/settings/location-footprints.tsx` | Location access prefs | Signed-in |
| `/(app)/statutory/*` | `app/(app)/statutory/*` | Statutory tab + detail | Signed-in |

Full route tree: 74 files under `app/` (expo-router file-based).

---

## B. Firestore collections (from `firestore.rules` + services)

| Collection | Write | Read | User-scoped | Notes |
|------------|-------|------|-------------|-------|
| `users/{uid}` | `src/services/auth/firebase.ts`, profile updates | Auth, boot | Yes | Profile doc |
| `users/{uid}/entries/{id}` | `src/services/diary/firebase.ts` | Diary, search, calendar | Yes | Business entries |
| `users/{uid}/professionalPacks/{id}` | `src/services/professionalPack/firebase.ts` | Pro pack screens | Yes | |
| `users/{uid}/letterheadDocs/{id}` | Letterhead services | Letterhead | Yes | |
| `users/{uid}/customerCreditRecords/{id}` | `src/services/customerCredit/firebase.ts` | Dukaan | Yes | |
| `users/{uid}/purchaseOrders/{id}` | `src/services/purchaseOrder/firebase.ts` | PO | Yes | |
| `users/{uid}/counters/{id}` | PO `allocateSerial` transaction | PO serial | Yes | |
| `users/{uid}/_saveLocks/{clientRecordId}` | Save lock services | Save coordinator | Yes | Idempotency |
| `users/{uid}/config/{id}` | Config writes | Settings | Yes | |
| `users/{uid}/trustedDevices/{id}` | Device trust | Auth | Yes | |
| `phoneIndex/{phone}` | Auth registration | Auth lookup | Global index | |
| `ueidIndex/{ueid}` | Auth | Lookup | Global | |
| `emailIndex/{hash}` | Email verification CF | Lookup | Global | |
| `retiredPhones/{phone}` | Deletion lifecycle | Auth | Global | |
| `pendingEmailVerifications/{id}` | Email CF | Verification | Global | |

`firestore.indexes.json`: present.

---

## C. Local storage / SQLite / AsyncStorage

**SQLite** (`src/localDb/schema.ts`, DB `vyaamikk_diary.db`, v6): `meta`, `form_drafts`, `entries_local`, `sync_queue`, `active_route`, `pincode_cache`, `statutory_occurrences`, `master_data_suggestions`, `business_insights`, `global_search_index` (later migrations).

**AsyncStorage keys (confirmed):**
- `vyd_language_v1` — UI language (`src/i18n/types.ts`)
- `vyd_session_v2` — auth session (SecureStore on native)
- `vyd_idempotency_v1_*` — save idempotency attempts
- `vyd_location_footprints_v1_{userId}` — location prefs
- `vyd_global_search_recent_v1` — recent searches
- `vyd_fy_recap_v1_{userId}_{fy}` — FY recap cache
- `vyd_pro_pack_draft_*` — pro pack drafts

**SecureStore:** session `vyd_session_v2` on iOS/Android.

---

## D. State providers (not Zustand)

| Provider | File | Persistence |
|----------|------|-------------|
| `AuthProvider` | `src/state/auth.tsx` | SecureStore session + optional Firestore revalidation |
| `LocalDbProvider` | `src/state/localDb.tsx` | SQLite init |
| `SyncProvider` | `src/state/sync.tsx` | Sync engine |
| `I18nProvider` | `src/i18n/index.tsx` | AsyncStorage `vyd_language_v1` |
| `ThemeProvider` | `src/theme` | AsyncStorage theme pref |

No Zustand stores found.

---

## E. Cloud Function callables

| Callable | Client | Region |
|----------|--------|--------|
| `resolveOrCreateUserByPhone` / `claimMobile` | `src/services/auth/identityCallable.ts` | asia-south1 |
| `startEmailVerification`, `verifyAndBindEmail`, `changeVerifiedEmail` | identityCallable / email | asia-south1 |
| `retireIdentity`, `completeAccountDeletion` | `src/services/accountDeletion/*` | asia-south1 |

Auth boot uses SecureStore + optional `loadProfileByPhoneFirestore`; **`onAuthStateChanged` not used** in app (grep: no matches).

---

## F. PDF services

Directory: `src/services/pdf/` (27 files). Entry point: `pdfService.ts` (`expo-print` / `printToFileAsync`).

Record types: business entry, customer credit, PO, letterhead, professional pack, diary. Errors generally caught at screen level (`userFacingMessage`); composer surfaces `pdfFailed` via save result.

---

## G. i18n coverage

- Bundles: `en.json`, `hi.json`, `ta.json`, `te.json`, `gu.json` (+ legacy `en.ts`/`hi.ts` not used at runtime init)
- Init: `src/i18n/i18n.ts` loads JSON bundles
- `LocaleUiText`: `src/components/ui/LocaleUiText.tsx` — used on major screens
- `formatAmount`, `formatDate`, `formatTime`: en-IN locked in `src/utils/formatters/*` (unchanged this pass)

---

## H. Boot animation gate

- `BootAnimationGate`: `src/boot/BootAnimationGate.tsx` — exists
- `VyaamikkBootAnimation`: `src/components/boot/VyaamikkBootAnimation.tsx`
- Session guard: `consumeBootAnimationSlot()` once per cold session
- Hold: `BOOT_HOLD_TIMEOUT_MS` 12s; release when `animationDone && bootReady && routeResolved`
- Font hold uses `BRAND_SURFACE` (no white flash during font load)
- **Risk (before fix):** `app/index.tsx` returned `null` during DB `loading`/`preparing` → possible white flash behind Stack

---

## I. Known weak screens — status before fix

| File | Issue (confirmed) |
|------|-------------------|
| `useBusinessInsightsDashboard.ts` | `try/finally` without `catch`; no `error` state; dual `useEffect`+`useFocusEffect` reload; no stale guard |
| `StatutoryInformationScreen.tsx` | `try/finally` without `catch`; no error UI |
| `calendar.tsx` | Raw `{error}` string in `Text` (line ~248); no ErrorState/retry |
| `location-footprints.tsx` | `return null` when `!prefs`; reload has no catch |
| `identity.tsx` | `return null` when `!baseline` → blank flash |
| `professional-pack/[id].tsx` | Fetch errors treated as not-found; no catch on load |

---

## Confirmed bugs before fix

| File | Component | Domain | Bug | Risk | Fix plan |
|------|-----------|--------|-----|------|----------|
| `useBusinessInsightsDashboard.ts` | `load` | D2/D4 | Missing catch | Perpetual loader or stale data on failure | Add catch + error + requestId guard + reload |
| `business-insights*.tsx` | screens | D4 | No ErrorState on hook failure | Blank/spinner forever | Wire ErrorState + retry |
| `StatutoryInformationScreen.tsx` | `load` | D2/D4 | Missing catch | Silent failure / empty UI | catch + ErrorState + retry |
| `calendar.tsx` | list header | D4 | Raw error text | Poor UX / leaks technical text | ErrorState + reload |
| `location-footprints.tsx` | screen | D4 | null on load | Blank screen | Loader + catch + ErrorState |
| `identity.tsx` | screen | D4 | null before baseline | Blank flash | Loader skeleton |
| `professional-pack/[id].tsx` | `load` | D2/D4 | No catch; !pack → not found | Misleading not-found | fetchError vs notFound states |
| `app/index.tsx` | boot prep | D4 | `return null` during prepare | White flash | Themed background placeholder |

**Not confirmed / unchanged:**
- PO serial: `allocateSerial` uses `runTransaction` — **safe**
- Composer saves: `saveLockRef` set before first `await` in composer/[type], PO form, credit form — **OK**
- `clientRecordId`: stable `useRef` in composer + credit form — **OK**
- Language switch: `switchInFlightRef`, `LANGUAGE_SWITCH_MIN_HOLD_MS` 1200, static wait copy — **OK**
- `saveIdempotency` JSON.parse — already try/catch
- `onAuthStateChanged` — not used; auth via SecureStore boot — **document only**

---

## Bugs fixed (post-remediation)

See git diff. Summary:

1. Business insights hook + 6 consumer screens — error state, retry, stale guard
2. Statutory screen — catch, ErrorState, retry, mounted guard
3. Calendar tab — ErrorState replaces raw error string
4. Location footprints — loader + ErrorState + reload error handling
5. Identity — loader instead of null during baseline init
6. Pro pack detail — fetch error vs not-found separation
7. Boot index — non-null background during prepare phase
8. `en.json` — calm load-error copy keys for affected screens

---

## Known risks not fixed

Documented in `KNOWN_RISKS.md`.

---

## Files changed

- `SYSTEMIC_STABILITY_AUDIT.md` (this file)
- `KNOWN_RISKS.md` (new)
- `src/hooks/useBusinessInsightsDashboard.ts`
- `src/screens/StatutoryInformationScreen.tsx`
- `app/(app)/(tabs)/calendar.tsx`
- `app/(app)/settings/location-footprints.tsx`
- `app/(app)/settings/identity.tsx`
- `app/(app)/professional-pack/[id].tsx`
- `app/(app)/settings/business-insights.tsx`
- `app/(app)/settings/business-insights/cash-paid.tsx`
- `app/(app)/settings/business-insights/customers.tsx`
- `app/(app)/settings/business-insights/movement.tsx`
- `app/(app)/settings/business-insights/parties.tsx`
- `app/(app)/settings/business-insights/pins.tsx`
- `app/index.tsx`
- `src/i18n/locales/en.json` (load-error copy only)

---

## Tests run

| Command | Result |
|---------|--------|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run test:i18n` | Pass |
| `npm run test:formatters` | Pass |
| `npm run test:identity-mobile` | Pass |
| `npm run test:customer-credit` | Pass |
| `npm run test:letterhead-pdf` | Pass |
| `npm run test:save-idempotency` | Pass |
| `npm run test:save-hardening` | Pass |
| `npm run test:save-lifecycle` | Pass |

All requested scripts exist and passed. No type/lint failures.

---

## Manual QA checklist

- [ ] Business Insights: airplane mode → ErrorState + Try again → recovery
- [ ] Statutory tab: same
- [ ] Calendar tab: force load error → ErrorState, not raw string
- [ ] Location Access settings: no blank screen on open
- [ ] Identity settings: no blank flash on open
- [ ] Pro pack detail: invalid id with network error vs genuine missing record
- [ ] Cold boot: no white flash before animation
- [ ] Language switch: still shows target-language buffer ≥1200ms
- [ ] Save CTAs: double-tap does not duplicate records
