# Fable Consolidated Fix Input

**Date:** 2026-07-15  
**Purpose:** Evidence-backed implementation tasks for a single Fable 5 pass. No speculative refactors.

---

## P0 Security

### F-SEC-01 — Deploy hardened production Firestore rules

| Field | Value |
|-------|-------|
| Status | ✅ **Complete** (2026-07-15 ~02:02 IST) |
| Rules commit | `9c4369a` — Security: harden production Firestore access rules |
| Client compatibility commit | `11503ce` — Fix: route email identity writes through server (repo; aligns with live rules) |
| Project ID | `vyaamikk-diary` |
| Deploy account | `support.vyd@specialsoftwares.com` |
| Deploy command | `firebase deploy --only firestore:rules --project vyaamikk-diary` |
| Deploy scope | Firestore rules only — no Functions, Storage, Hosting, or indexes |
| Pre-deploy tests | ✅ All **25** `npm run test:firestore-rules` checks passed |
| Rules compile + release | ✅ Successful |
| Local rules audit | No `allow read, write: if true`; no `request.time` expiry; UID isolation `isOwner(uid)`; server collections `if false`; client profile allowlist + deletion path |
| `firestore.rules` modified at deploy | **No** — deployed from commit `9c4369a` |
| Firebase Console timestamp | ✅ **Verified** — newest Rules revision matches ~02:02 IST deployment |

### F-SEC-01b — Client profile write compatibility with hardened rules

| Field | Value |
|-------|-------|
| Status | ✅ **Complete** (commit `11503ce` in repo) |
| Change | Production email bind via `verifyAndBindEmail`; patch-only Firestore merges; server-owned fields stripped from client writes |
| Live dependency | Requires app build shipping `11503ce`; rules alone do not implement client patches |

### F-SEC-02 — Expo Go dev backend must not hit production Firestore unauthenticated

| Field | Value |
|-------|-------|
| Evidence | Prior `permission-denied` on OTP in Expo Go when default was `firebase-shared-dev` |
| Files | `src/config/env.ts` (`EXPO_PUBLIC_DEV_BACKEND` opt-in) |
| Status | **Fixed in prior session** — default `local-mock` (uncommitted in working tree) |
| Production rules live | ✅ Hardened rules deployed — Expo Go must stay on `local-mock` or permissive dev project |
| Test | Expo Go login `123456` → no Firestore writes |
| Marked complete | ❌ **No** — environment isolation not verified end-to-end in this pass |

---

## P0 Interaction freeze

### F-FRZ-01 — CurtainSheet teardown gap (highest-confidence hypothesis)

| Field | Value |
|-------|-------|
| Symptom | Content frozen; native tab bar may still work |
| Reproduction steps | You → + New Record → open picker → dismiss via drag/backdrop/select → tap dashboard buttons |
| Root cause | `teardown()` only when spring `finished===true`; `rendered` Modal keeps full-screen `Pressable` (`CurtainSheet.tsx` L247–268) |
| File | `src/components/ui/CurtainSheet.tsx` |
| Function | `springClose`, `teardown`, `useEffect` on `visible` |
| Correction | On `finished===false`, force `teardown()`; add max close timeout (~400ms); set backdrop `Pressable` `pointerEvents` to `none` when `isClosing` or opacity≈0 |
| Regression risk | Medium — animation timing |
| Test | Operator matrix #1, #9; automated: mount/unmount cycle test with mocked Reanimated |

### F-FRZ-02 — Identity card flip `animatingRef` lock

| Field | Value |
|-------|-------|
| Reproduction | You tab → rapid flip hero card → interrupt (tab switch mid-animation) |
| Root cause | `animatingRef` cleared only when `withTiming` `finished===true` (`DigitalBusinessIdentityCard.tsx` L304–320) |
| Correction | Reset on `useFocusEffect` blur; handle `finished===false`; optional `cancelAnimation` |
| Regression risk | Low |
| Test | Manual flip stress on You tab |

---

## P1 Language transition

### F-LANG-01 — Central transition controller

| Field | Value |
|-------|-------|
| Evidence | Multiple remount paths; 1200ms hold; dev `DevSettings.reload`; weak visual |
| Files to consolidate | `src/i18n/index.tsx`, `LanguageSwitchScreen.tsx`, `reloadApp.ts`, `LanguageToggle.tsx` |
| Design | See `docs/LANGUAGE_TRANSITION_REDESIGN.md` |
| Correction | Implement 550–650ms state machine with Reduce Motion + rollback |
| Test | `npm run test:i18n`; manual rapid switch |

### F-LANG-02 — Remove or wire deprecated LanguageToggle

| Field | Value |
|-------|-------|
| File | `src/components/ui/LanguageToggle.tsx` |
| Issue | No `switching` guard — competes with `LanguageSelector` |
| Correction | Delete export or delegate to controller with lock |
| Test | Grep ensure no imports |

---

## P1 Native tabs

### F-TAB-01 — Validate labelStyle override on iOS 26 native build

| Field | Value |
|-------|-------|
| File | `app/(app)/(tabs)/_layout.tsx` L70–73 |
| Issue | `fontSize: 11` may conflict with Liquid Glass system metrics |
| Correction | A/B test removing custom `labelStyle` sizes on EAS dev build |
| Test | Screenshot compare iOS 26 device — **not Expo Go** |

---

## P1 Runtime performance

### F-PERF-01 — Lazy locale bundles

| Field | Value |
|-------|-------|
| Files | `src/i18n/i18n.ts` |
| Evidence | 5 JSON ~900KB+ eager; 3850 modules; 12.4MB HBC |
| Correction | Dynamic import per lang; keep `en` eager |
| Test | `expo export` size compare |

### F-PERF-02 — Lazy script fonts

| Field | Value |
|-------|-------|
| File | `src/i18n/LocaleFontProvider.tsx` |
| Evidence | 12 Noto TTF loaded at startup |
| Correction | Load active script family only |
| Test | First-open timing on Expo Go |

### F-PERF-03 — iOS share-sheet exporting guard (diary detail)

| Field | Value |
|-------|-------|
| File | `app/(app)/diary/[id].tsx` `onExportPdf` L168–216 |
| Evidence | `ComposerSaveSuccess.tsx` L44–63 has guard; diary does not |
| Correction | Extract `useShareSheetBusyGuard` hook; apply to diary + other share callers |
| Regression risk | Low |
| Test | Manual iOS share dismiss |

---

## P2 Edge cases

### F-EDGE-01 — DigitalBusinessIdentityCard share lock timeout

| Field | Value |
|-------|-------|
| File | `DigitalBusinessIdentityCard.tsx` L462–503 |
| Issue | `shareLockRef` 400ms timeout — if share hangs, flip blocked |
| Correction | Clear on `AppState` active + focus |

### F-EDGE-02 — Statutory sheet auto-show timing

| Field | Value |
|-------|-------|
| File | `StatutoryPromptHost.tsx` |
| Issue | 1200ms delayed modal on tab focus — may coincide with user interaction |
| Correction | Defer until user idle or post-interaction |

### F-EDGE-03 — expo-build-properties version mismatch

| Field | Value |
|-------|-------|
| Evidence | Metro warns `0.14.8` vs expected `~1.0.10` |
| Correction | Separate dependency alignment pass (not in interaction fix) |

---

## Native-build-only verification

| Item | Build profile |
|------|---------------|
| Liquid Glass tab spacing | EAS `development` or `development-production-otp` |
| Production OTP end-to-end | `development-production-otp` |
| JS auth bridge + Firestore writes | `development-production-otp` |
| Cash Paid photo upload | Dev build + Firebase Storage |
| App Check (future) | Production |

---

## Repository readiness for Fable pass

| Gate | Status |
|------|--------|
| Firestore rules hardened (`9c4369a`) verified locally | ✅ |
| Firestore rules emulator tests (25 checks) | ✅ Passed before deploy |
| Firestore rules deployed live | ✅ `vyaamikk-diary` — 2026-07-15 ~02:02 IST; account `support.vyd@specialsoftwares.com`; rules only |
| Client rules compatibility (`11503ce`) | ✅ In repo |
| Firebase Console rules timestamp | ✅ Verified |
| Production smoke testing | ❌ Not complete |
| Expo Go environment isolation | ❌ Not complete |
| Native OTP verification on device | ❌ Not complete |
| App Check | ❌ Not installed |
| Storage rules verification | ❌ Not complete |
| Fable runtime pass | ❌ Not complete |
| Reproducible freeze captured live | ❌ — static hypothesis only |
| Blocking overlay defect identified | ✅ hypothesis `CurtainSheet` |
| Language multiple implementations | ✅ primary + deprecated `LanguageToggle` |
| Tab implementation documented | ✅ `NativeTabs` unstable API |
| Bundle audit complete | ✅ |
| Edge matrix complete | ✅ |
| Safe to proceed with consolidated Fable implementation | **Yes** — hardened Firestore rules live; runtime/smoke/OTP/App Check/Storage still open |

---

## Implementation discipline reminder

Do **not** modify: `_saveLocks`, `completedSteps[]`, `clientRecordId`, `idempotencyKey`, save architecture, auth contracts, PDF business logic, Firestore schemas, or enable App Check in this pass.
