# Language Transition Redesign (Design Only)

**Date:** 2026-07-15  
**Status:** Design for Fable 5 implementation pass — **not implemented** in this diagnostic.

---

## Current architecture map

### Single primary path (active in Settings)

| Step | File | Function / component |
|------|------|---------------------|
| UI trigger | `src/components/settings/LanguageSelector.tsx` | `onSelect` → `setLang(next)` with `switching` guard |
| State machine (inline) | `src/i18n/index.tsx` `I18nProvider` | `setLang` → `setSwitchingToLang` → renders `LanguageSwitchScreen` |
| Buffer screen | `src/i18n/LanguageSwitchScreen.tsx` | Full-screen indigo buffer; `onPainted` after double `rAF` |
| Apply language | `src/i18n/index.tsx` `completeLanguageSwitch` | `persistLang` → `changeAppLanguage` → `setLangState` → `setMountKey` bump |
| Hold timing | `src/i18n/languageSwitchMessages.ts` | `LANGUAGE_SWITCH_MIN_HOLD_MS = 1200` |
| Reload | `src/i18n/reloadApp.ts` | `DevSettings.reload()` in `__DEV__` (Expo Go) |
| Font swap | `src/i18n/LocaleFontProvider.tsx` | `useFonts` loads **all** Noto script families at startup; `setLocaleFontFamily` on lang change |
| i18n engine | `src/i18n/i18n.ts` | All 5 locale JSON bundles registered eagerly at `initI18n` |

### Secondary / competing path (deprecated, still exported)

| File | Issue |
|------|-------|
| `src/components/ui/LanguageToggle.tsx` | Marked `@deprecated`; **no `switching` lock**; calls `setLang` directly. Exported from `src/components/ui/index.ts` but **not imported** by any `app/**` screen in current tree. Risk: future re-use without guard. |

### Multiple remount triggers on switch

1. `mountKey` fragment remount (`I18nProvider` L206)
2. `revision` bump for `t()` callback (L137)
3. `LocaleFontProvider` `revision` bump (L86–88)
4. `DevSettings.reload()` entire JS context in Expo Go dev (L148–149)

This explains **instability and visual weakness**: hard cut to static indigo buffer, 1.2s minimum hold, then full reload in dev — no eased transition, no Reduce Motion branch.

---

## Problems identified

| # | Problem | Evidence |
|---|---------|----------|
| 1 | No formal state machine | States implicit across `switching`, `switchingToLang`, `switchInFlightRef` |
| 2 | Dev reload vs prod remount diverge | `reloadApp.ts` vs `mountKey` only |
| 3 | Visual weakness | `LanguageSwitchScreen` — flat indigo, no transition animation, 14px muted copy |
| 4 | No Reduce Motion path | Unlike boot animation (`useBootReducedMotion`) |
| 5 | Eager locale + font cost | 5 JSON bundles + 12 Noto TTF at init regardless of active lang |
| 6 | Duplicate entry points | `LanguageToggle` vs `LanguageSelector` |
| 7 | Error rollback incomplete | On failure: clears `switchingToLang` but does not revert persisted lang if `persistLang` succeeded before `changeAppLanguage` failed |

---

## Proposed central transition controller

**New module (proposed):** `src/i18n/languageTransitionController.ts`  
**Hook (proposed):** `src/i18n/useLanguageTransition.ts`  
**UI (proposed):** replace ad-hoc `LanguageSwitchScreen` mount in `I18nProvider` with controller-driven overlay component.

### State machine

```
idle
  → preparing          (duplicate-tap lock acquired)
  → transitionIn       (overlay fade/slide in, ~150ms)
  → applyingLanguage   (persist + changeAppLanguage + font resolve)
  → settling           (InteractionManager + remount key bump, no navigation reset)
  → transitionOut      (overlay fade out, ~150ms)
  → idle               (lock released)
```

**Target total duration:** 550–650ms (or instant path when Reduce Motion enabled).

### Requirements checklist

| Requirement | Design |
|-------------|--------|
| Duplicate-tap lock | Single `inFlight` ref + ignore `setLang` while not `idle` |
| Guaranteed cleanup | `finally` always reaches `idle`; overlay `pointerEvents="none"` when hidden |
| Rollback | If `changeAppLanguage` fails after persist, restore previous lang from memory + AsyncStorage |
| Resource check | Verify Noto font for target script loaded (already eager — or lazy-load per lang in future) |
| Persist after success | `persistLang` only after `changeAppLanguage` confirms |
| No navigation reset | No `router.replace`; only optional `mountKey` bump on subtree |
| No Firebase listener recreation | Do not remount `AuthProvider` / `SyncProvider` — keep `I18nProvider` swap scoped to content subtree |
| No invisible overlay | Overlay unmounts or `pointerEvents="none"` + `opacity:0` in `idle` |
| Reduce Motion | Skip `transitionIn/Out`; apply language immediately with brief accessibility announcement |

### Files to consolidate

| Action | Files |
|--------|-------|
| **Merge into controller** | `src/i18n/index.tsx` (`setLang`, `completeLanguageSwitch`, `switchInFlightRef`) |
| **Replace** | `src/i18n/LanguageSwitchScreen.tsx` → transition overlay component |
| **Keep API** | `changeAppLanguage`, `translateSync` in `src/i18n/i18n.ts` |
| **Deprecate/remove** | `src/components/ui/LanguageToggle.tsx` (or wire to controller with lock) |
| **Simplify** | `src/i18n/reloadApp.ts` — remove `DevSettings.reload` from language path; use remount only |
| **Coordinate** | `src/i18n/LocaleFontProvider.tsx` — subscribe to controller `applyingLanguage` event instead of reacting to raw `lang` jitter |

### Visual redesign notes (Fable UI pass)

- Subtle crossfade on root content instead of full-tree replacement where possible.
- Script-aware wait copy already in `LANGUAGE_SWITCH_WAIT` — increase contrast/size for readability.
- Optional: brief haptic on success (`expo-haptics` light).

---

## Testing required after implementation

- `npm run test:i18n`
- Manual: switch en↔hi↔ta↔te↔gu on Settings; verify no touch freeze after switch.
- Manual: rapid double-tap language chip — only one transition.
- Manual: Reduce Motion ON — instant switch, no flash.
- Expo Go + native dev build smoke.
