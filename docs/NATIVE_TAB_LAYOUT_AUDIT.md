# Native Tab Layout Audit

**Date:** 2026-07-15  
**Expo Router:** `~6.0.24` (`package.json`)  
**Expo SDK:** `~54.0.0`

---

## Implementation classification

| Question | Answer |
|----------|--------|
| JavaScript `<Tabs>`? | **No** |
| `NativeTabs` (unstable)? | **Yes** — `expo-router/unstable-native-tabs` |
| Custom tab bar component? | **No** — system native tab bar |
| Custom tab animations conflicting with native? | **No custom tab animations** in layout |

**Primary file:** `app/(app)/(tabs)/_layout.tsx`

```tsx
import { Icon, Label, NativeTabs, VectorIcon } from "expo-router/unstable-native-tabs";
```

---

## Tab labels and routes (unchanged — correct)

| Trigger `name` | Route file | Intended label key | Display |
|----------------|------------|-------------------|---------|
| `calendar` | `calendar.tsx` | `calendarMaps.tabLabel` | Calendar |
| `you` | `you.tsx` | `you.title` | You |
| `saved-records` | `saved-records.tsx` | `savedRecords.tabLabel` | Saved |
| `settings` | `settings.tsx` | `settings.tabLabel` | Settings |

---

## Styling audit

| Property | Current value | Risk on iOS 26 |
|----------|---------------|----------------|
| `tintColor` | `#4338CA` (brand indigo) | Low — active tint only |
| `iconColor` | `colors.textMuted` from theme | Low |
| `labelStyle.default.fontSize` | *(removed)* | **Fixed** — custom `fontSize: 11` removed; system typography only (colors retained) |
| `labelStyle.selected.fontSize` | *(removed)* | **Fixed** — see above |
| Custom letter spacing | None on labels | Low |
| Forced tab widths | None | Low |
| Horizontal padding | None custom | Low |
| Icon sizing | Via `VectorIcon` + MaterialCommunityIcons outline glyphs | Low in Expo Go; verify native render |
| `ThemeProvider` / `NavigationThemeProvider` | Wrapped around `NativeTabs` with `background`/`card` from theme | Low |
| Safe area | Delegated to native tab bar + screen `Screen` components | Verify on notch/Dynamic Island devices |
| ScrollView structure | Per-tab screens use `Screen` scroll — no wrapper around `NativeTabs` | OK |

### Deferred hosts mounted beside NativeTabs

```tsx
<DeferredStatutoryPromptHost />
<DeferredLocationFootprintConsentHost />
```

These mount **sibling** to `NavigationThemeProvider`/`NativeTabs` tree — modals may present over content; see interaction freeze doc.

---

## iOS 26 Liquid Glass — Expo Go limitation

**Do not judge final Liquid Glass spacing from Expo Go.** Expo Go uses its own shell; `unstable-native-tabs` native behaviour (blur, floating tab bar, label/icon spacing) requires:

### Native-build verification checklist (operator)

| # | Check | Device |
|---|-------|--------|
| 1 | Tab bar uses system Liquid Glass material (blur, floating) | iPhone iOS 26+ **EAS dev build** |
| 2 | Label truncation on "Saved" / long localized strings | iPhone + Android |
| 3 | Icon optical alignment with labels | iPhone iOS 26 |
| 4 | Dark mode tab bar contrast | Both |
| 5 | Safe area inset above tab bar on home-indicator devices | iPhone |
| 6 | Tab bar does not overlap composer FAB / bottom CTAs | You tab |
| 7 | Compare `fontSize: 11` vs system default (remove override test build) | iPhone iOS 26 |

### Hypothesis for "incorrect spacing on iOS 26"

Best-supported static hypothesis: **custom `labelStyle.fontSize: 11`** on `NativeTabs` may conflict with iOS 26 system tab label metrics under Liquid Glass, producing cramped or misaligned labels. **Requires native build A/B test** — remove custom `labelStyle` in experimental build.

---

## Android notes

Material 3 bottom navigation via native tabs API. Verify:

- Label ellipsize on Gujarati/Hindi strings
- `iconColor` contrast in dark mode

---

## Recommended Fable tasks (P1)

1. ~~Drop custom `labelStyle` font sizes~~ ✅ Implemented — colors only in `_layout.tsx`
2. Native dev build screenshot comparison on **iOS 26 Liquid Glass** — **pending** (Apple Developer team not yet available)
3. Document final tab spec in `PRODUCTION_READINESS.md` after native verification only
