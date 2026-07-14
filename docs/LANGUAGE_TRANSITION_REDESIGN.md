# Language Transition Redesign (Design Only)

**Date:** 2026-07-15  
**Status:** ✅ **Implemented** in Fable runtime pass — see `languageTransitionController.ts`, `LanguageTransitionOverlay.tsx`, lazy `i18n.ts` + `localeFonts.ts`.

---

## Current architecture map

### Single primary path (active — all selectors)

| Step | File | Function / component |
|------|------|---------------------|
| UI trigger | `src/components/settings/LanguageSelector.tsx` | `onSelect` → `setLang(next)` |
| Controller | `src/i18n/languageTransitionController.ts` | `idle` → `preparing` → `switching` → `settling` → `idle` (~600ms visible) |
| Provider entry | `src/i18n/index.tsx` `I18nProvider.setLang` | **Only public switching entry point** |
| Overlay | `src/i18n/LanguageTransitionOverlay.tsx` | Fade in/out; `pointerEvents="none"` when hiding; **400ms hide fallback** |
| Locale load | `src/i18n/i18n.ts` `ensureLocaleBundle` | Dynamic `import()` per lang; `en` eager only |
| Font load | `src/i18n/localeFonts.ts` | Per-script family on demand; system-font fallback |
| Font apply | `src/i18n/LocaleFontProvider.tsx` | Active language only |
| Removed | `LanguageSwitchScreen.tsx`, `reloadApp.ts`, `LanguageToggle.tsx` | No `DevSettings.reload()` in language path |

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
