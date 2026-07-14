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
| Status | ✅ **Complete** (commit `3bc2e2e`) — runtime isolation in `runtimeEnvironment.ts` |
| Test | `npm run test:env-resolution`, `npm run test:env-shell-precedence` |
| Marked complete | ✅ Expo Go → `local-mock`; dev client → `firebase-production` fail-closed |

---

## P0 Interaction freeze

### F-FRZ-01 — CurtainSheet teardown gap (highest-confidence hypothesis)

| Field | Value |
|-------|-------|
| Status | ✅ **Implemented** |
| Correction | `curtainSheetPhases.ts` + `CurtainSheet.tsx` phase model; 450ms timeout; `pointerEvents` gating |
| Test | `npm run test:curtain-phases` |
| Device verify | ☐ Native dev build operator matrix |

### F-FRZ-02 — Identity card flip `animatingRef` lock

| Field | Value |
|-------|-------|
| Status | ✅ **Implemented** — `identityCardFlipController.ts` |
| Test | `npm run test:flip-lock` |

---

## P1 Language transition

### F-LANG-01 — Central transition controller

| Field | Value |
|-------|-------|
| Status | ✅ **Implemented** |
| Test | `npm run test:language-transition`, `npm run test:i18n` |

### F-LANG-02 — Remove deprecated LanguageToggle

| Field | Value |
|-------|-------|
| Status | ✅ **Removed** — file deleted; export removed from `ui/index.ts` |

---

## P1 Native tabs

### F-TAB-01 — Validate labelStyle override on iOS 26 native build

| Field | Value |
|-------|-------|
| Status | ✅ **Partial** — custom `fontSize` removed; **Liquid Glass geometry verify pending** on physical iOS 26 device |

---

## P1 Runtime performance

### F-PERF-01 — Lazy locale bundles

| Field | Value |
|-------|-------|
| Status | ✅ **Implemented** — `ensureLocaleBundle` dynamic import |
| Export HBC | Unchanged 12.4 MB; runtime init reduced |

### F-PERF-02 — Lazy script fonts

| Field | Value |
|-------|-------|
| Status | ✅ **Implemented** — `localeFonts.ts` per-script load |

### F-PERF-03 — iOS share-sheet exporting guard (diary detail)

| Field | Value |
|-------|-------|
| Status | ✅ **Implemented** — `useStuckBusyRecovery` on diary + other share callers |

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
| Expo Go environment isolation | ✅ Complete (`3bc2e2e`) |
| Native OTP verification on device | ❌ Not complete |
| App Check | ❌ Not installed |
| Storage rules verification | ❌ Not complete |
| Fable runtime pass | ✅ Implemented — **native device matrix pending** |
| Reproducible freeze captured live | ❌ — root cause fixed statically; operator verify pending |
| Blocking overlay defect identified | ✅ **Fixed** `CurtainSheet` |
| Language multiple implementations | ✅ **Single controller** |
| Tab implementation documented | ✅ `NativeTabs` unstable API |
| Bundle audit complete | ✅ |
| Edge matrix complete | ✅ |
| Safe to proceed with consolidated Fable implementation | **Yes** — hardened Firestore rules live; runtime/smoke/OTP/App Check/Storage still open |

---

## Implementation discipline reminder

Do **not** modify: `_saveLocks`, `completedSteps[]`, `clientRecordId`, `idempotencyKey`, save architecture, auth contracts, PDF business logic, Firestore schemas, or enable App Check in this pass.
