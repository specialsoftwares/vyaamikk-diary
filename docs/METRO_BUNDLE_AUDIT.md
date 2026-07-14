# Metro Bundle Audit

**Date:** 2026-07-15 (baseline) · **Re-audit:** 2026-07-15 post-Fable lazy locale/fonts pass
**Method:** `npx expo export --platform ios --output-dir .expo-export-audit` (LAN dev environment; export audit dir gitignored).

---

## Dev server measurements (Expo Go / LAN)

| Metric | Observed |
|--------|----------|
| Module count | **3850–3953** modules (varies slightly by cache) |
| Metro initial bundle (Mac) | **~1.6–7.0s** depending on cold/warm cache |
| Hermes bytecode (export) | **12.4 MB** `.hbc` |
| Transfer to device (operator) | Slow on first open — **tens of MB unminified dev bundle over Wi‑Fi**; not measured precisely in this pass |
| Fast Refresh | Sub-second after first load (operator observation from prior session) |
| Reload | Full re-download on cold Metro restart |

**Why Expo Go download feels slow:** dev bundle includes ~3900 modules, 12.4MB bytecode, icon font, multiple script fonts, Firebase SDK paths — all transferred once per Metro session.

---

## Largest export assets (top 10)

| Size | Asset | Import / origin path |
|------|-------|---------------------|
| 12.4 MB | `entry-*.hbc` | `node_modules/expo-router/entry.js` — entire app graph |
| 1.31 MB | `6e435534…` (TTF) | `MaterialCommunityIcons.ttf` via `@expo/vector-icons` |
| ~220 KB × N | Noto/Barlow TTF variants | `@expo-google-fonts/*` via `LocaleFontProvider` + boot fonts |
| 128–204 KB each | Locale JSON (source) | `src/i18n/locales/*.json` — **en eager only**; hi/ta/te/gu via dynamic `import()` |

### Post-Fable runtime startup (not export size)

| Change | Before | After |
|--------|--------|-------|
| Locale registration at `initI18n` | All 5 bundles parsed | **en only**; others on demand |
| Script fonts at boot | 12 Noto TTF via `useFonts` | **Active script family only** via `localeFonts.ts` |
| iOS export HBC | 12.4 MB | **12.4 MB** (unchanged — dynamic imports remain in graph) |
| First-paint work | Parse ~900KB+ JSON + load all Noto | Parse en JSON + system font fallback |

**Honest note:** `expo export` still lists all locale/font assets as reachable chunks. The win is **runtime** init and language-switch loading order, not smaller offline export yet.

Full listing command used:

```bash
find .expo-export-audit -type f -exec du -h {} + | sort -hr | head -40
```

---

## Eager imports at root (performance impact)

| Module | File | Impact |
|--------|------|--------|
| All 5 locale JSON | `src/i18n/i18n.ts` `I18N_RESOURCES` | ~900KB+ JSON parsed at init |
| 12 Noto font files | `src/i18n/LocaleFontProvider.tsx` | Loaded at startup regardless of active language |
| Barlow + Barlow Condensed | `src/boot/BootAnimationGate.tsx` | Boot-only but still in graph |
| `firebase` + `@react-native-firebase/*` | Various services | Present in Expo Go bundle even when `local-mock` active |
| `react-native-calendars` | Calendar tab | Full calendar component tree |
| `lottie-react-native` | Boot / onboarding paths | Animation runtime |

**No website screenshot assets** found in app runtime imports. `scripts/prepare-public-screenshots.ts` targets `public-site/` only.

---

## Lazy-load candidates (do not delete — Fable optimization)

| Candidate | Current | Proposed |
|-----------|---------|----------|
| Locale bundles | All 5 at `initI18n` | Dynamic `import()` per lang (keep en eager) |
| Noto fonts | All scripts at startup | Load script font family only when lang selected |
| `@react-native-firebase/*` | Static requires in production paths | Already lazy in some auth adapters — extend pattern |
| Statutory / location hosts | Deferred via `InteractionManager` | ✅ already deferred |
| PDF services | Composer / diary paths | Route-level dynamic import where not already |

---

## Duplicate / heavy dependencies noted

| Package | Note |
|---------|------|
| `i18n-js` + `i18next` | Both in `package.json`; primary path is i18next |
| `expo-build-properties@0.14.8` | Expo 54 expects `~1.0.10` — version warning at start |
| Icon font 1.3MB | Consider subsetting or SVG icons for v2 |

---

## Recommendations (P1 Runtime performance)

1. **Do not block pre-launch on bundle size** — address in dedicated perf pass.
2. Lazy-load non-English locale JSON + script fonts — largest safe win for Expo Go download.
3. Measure before/after with same `expo export` command.
4. Production EAS build will differ (minification, tree-shake) — re-run export on release profile.

---

## Commands for operator re-test

```bash
npx expo start --lan
# Note Metro "Bundled Xms (N modules)" on first device connect

rm -rf .expo-export-audit
npx expo export --platform ios --output-dir .expo-export-audit
find .expo-export-audit -type f -exec du -h {} + | sort -hr | head -40
```
