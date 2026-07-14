# Interaction Freeze Diagnostic

**Date:** 2026-07-15  
**Scope:** Read-mostly static + export audit. Manual device reproduction matrix is documented for operator execution; this pass did **not** claim live freeze reproduction without operator evidence.

**Fable implementation (2026-07-15):** `CurtainSheet` phase model + guaranteed teardown, `DigitalBusinessIdentityCard` flip-lock recovery, central language transition controller, `useStuckBusyRecovery` on PDF share callers. **Operator matrix still required** on physical device / native dev build — Expo Go manual smoke only.

## Symptom signature

Reported pattern: **tab bar remains tappable; screen content/buttons stop responding**. Scrolling may or may not work. Hardware back may still work depending on overlay type.

This signature is consistent with a **partial-screen or RN-Modal overlay** that sits above tab content but **below or outside** the native `UITabBar` layer (Expo Router `unstable-native-tabs`).

---

## Phase 1 — Firestore (context only)

Expo Go currently runs `local-mock` backend (per `src/config/env.ts` dev default). Interaction freezes in Expo Go are **unlikely** to be Firestore `permission-denied` unless `EXPO_PUBLIC_DEV_BACKEND=shared-dev` is set. See `docs/FABLE_CONSOLIDATED_FIX_INPUT.md` P0 Security section.

---

## Reproduction matrix (operator — execute on iPhone + Android)

Run each sequence **5×** on a clean Metro session (`npx expo start --lan`). After each step, attempt taps on the active tab's primary actions.

| # | Sequence | Freeze observed? | Notes |
|---|----------|------------------|-------|
| 1 | Cold boot → You → open composer picker → close → tap dashboard tiles | ☐ | Tests `ComposerPickerSheet` / `CurtainSheet` teardown |
| 2 | You → Saved → open record → back → open another record | ☐ | Stack navigation + detail loading |
| 3 | Settings → language switch → return to You → interact | ☐ | Full-tree swap via `LanguageSwitchScreen` + DevSettings.reload |
| 4 | Settings → Appearance toggle → back → interact | ☐ | Theme context only; no overlay expected |
| 5 | Calendar → map mode → location action → dismiss → interact | ☐ | `CalendarMapsModeTransition` dual layers |
| 6 | Cash Paid composer → photo picker cancel → interact | ☐ | Native picker cancel path |
| 7 | Composer → validation error → fix → submit | ☐ | Form focus / validation overlay |
| 8 | PDF generate → dismiss share sheet → interact | ☐ | iOS share promise hang (known class) |
| 9 | Open/dismiss every bottom sheet (statutory, location, drafts) | ☐ | RN `Modal` sheets |
| 10 | Switch all four tabs 10× rapidly → interact | ☐ | Native tab switching stress |
| 11 | Background app 30s → foreground → interact | ☐ | AppState / stale modal |
| 12 | Airplane mode error → retry → interact | ☐ | Sync banner + offline handlers |

### Per-freeze record template

```
Route:
Action immediately before freeze:
Component/sheet/modal opened:
Scrolling works: Y/N
Tab switching works: Y/N
Hardware/back works: Y/N
Only taps fail: Y/N
Visible loading state: Y/N
Console error:
Pending network op:
Language changed recently: Y/N
```

---

## Static touch-blocking audit — high-risk layers

### P0 hypothesis — `CurtainSheet` stuck `rendered` state

| Property | Value |
|----------|-------|
| File | `src/components/ui/CurtainSheet.tsx` + `src/components/ui/curtainSheetPhases.ts` |
| Root cause (confirmed statically) | `teardown()` only when spring `finished===true`; `rendered` Modal kept full-screen `Pressable` after interrupted close |
| **Fix implemented** | Explicit phases `closed` → `opening` → `open` → `closing`; backdrop/sheet `pointerEvents="none"` when `closing`; idempotent `handleCloseSettled`; **450ms defensive timeout**; `dispose()` on unmount |
| Test | `npm run test:curtain-phases` |
| Device verification | ☐ Operator matrix #1, #9 on **native dev build** (Expo Go smoke only — not claimed as production validation) |

**Used by:** `src/components/composer/ComposerPickerSheet.tsx` (You tab `pickerOpen` state, `app/(app)/(tabs)/you.tsx` L436–444).

### P1 hypothesis — `DigitalBusinessIdentityCard` flip lock

| Property | Value |
|----------|-------|
| File | `src/components/you/DigitalBusinessIdentityCard.tsx` + `identityCardFlipController.ts` |
| Root cause (confirmed statically) | `animatingRef` cleared only when `withTiming` `finished===true` |
| **Fix implemented** | `createFlipLockController` — idempotent release; **880ms defensive timeout** (`FLIP_MS + 300`); blur/unmount `cancelAnimation` + release; `finished===false` snaps to nearest stable side |
| Test | `npm run test:flip-lock` |
| Device verification | ☐ You tab flip stress on native device |

### P1 hypothesis — iOS share sheet / `exporting` stuck

| Property | Value |
|----------|-------|
| Files | `app/(app)/diary/[id].tsx`, `ComposerSaveSuccess.tsx`, `letterhead/history.tsx`, `purchase-order/index.tsx`, `customer-credit/[id].tsx`, `DigitalBusinessIdentityCard.tsx` |
| Root cause (confirmed statically) | `await share(...)` may never settle after iOS share sheet dismiss |
| **Fix implemented** | Shared `useStuckBusyRecovery` hook — resets busy state on screen refocus + `AppState` active |
| Device verification | ☐ iOS share dismiss on native device |

### P2 — Calendar map/calendar dual layer

| File | `src/components/calendarMaps/CalendarMapsModeTransition.tsx` |
| Mechanism | Both panels `absoluteFill`; inactive layer `pointerEvents="none"`. During 220ms crossfade, `mode` prop switches immediately — low risk if `mode` state is consistent. |

### P2 — Statutory / location modals

| Files | `StatutoryPromptSheet.tsx`, `LocationFootprintConsentSheet.tsx` |
| Mechanism | Standard RN `Modal visible={visible}`. Unmount when `visible=false`. Backdrop `Pressable` dismisses. **Lower risk** unless `visible` state stuck true. |

### Safe — non-blocking overlays

| File | Notes |
|------|-------|
| `src/feedback/AppFeedback.tsx` | Banner overlay `pointerEvents="none"` (L110) |
| `src/components/ui/skeleton/SkeletonLoadingPanel.tsx` | Returns `null` when `loading=false`; no touch capture |
| `src/boot/BootAnimationGate.tsx` | Returns `null` when `visible=false` |

---

## Async / loading-state audit summary

Full handler table in `docs/FABLE_CONSOLIDATED_FIX_INPUT.md`.

Key finding: most handlers use `try/finally`. **Exception class:** iOS share-sheet promise hang bypasses `finally` timing — needs focus/AppState guard pattern (already proven in `ComposerSaveSuccess`).

---

## Subscription / focus cleanup audit summary

No listener accumulation found on repeated tab visits. `SyncProvider`, `AuthProvider`, deferred statutory/location hosts mount once at root. Tab screens use `useFocusEffect` with cleanup.

See consolidated report for details.

---

## React Native DevTools profiling (operator — Phase 6)

**Not executed in this pass** (requires physical device + operator). Recommended protocol:

1. `npx expo start --lan` → open in Expo Go → press `j` for DevTools.
2. Profile: 10× tab switch; open/close New Record picker; language switch; Saved Records drill-down; one PDF share.
3. Record: long commits, rerender storms, duplicate network calls, listener count growth, `languageChanged` event frequency, caught exceptions.

**Do not** paste personal business data into logs or this doc.

---

## Confirmed root causes vs hypotheses

| Finding | Status |
|---------|--------|
| Reproducible live freeze sequence captured | **Not confirmed** — requires operator matrix |
| Blocking overlay defect identified statically | **Yes — root cause confirmed** `CurtainSheet` teardown gap |
| CurtainSheet / flip-lock fixes implemented | **Yes** — commit `Fix: harden runtime interactions and language transitions` |
| Loading-state stuck without `finally` | **Not found** in audited handlers |
| Share-sheet `exporting` stuck on iOS | **Mitigation implemented** — `useStuckBusyRecovery`; native iOS verify pending |

---

## Recommended Fable implementation order

1. ~~`CurtainSheet` — guaranteed teardown~~ ✅ Implemented
2. ~~`DigitalBusinessIdentityCard` — flip lock recovery~~ ✅ Implemented
3. ~~Share-sheet guard hook~~ ✅ `useStuckBusyRecovery` applied
4. ~~Language transition controller~~ ✅ Implemented
5. **Operator** runs reproduction matrix after fixes on **native dev build**
