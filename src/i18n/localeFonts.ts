/**
 * Lazy per-language script font loading.
 *
 * Previously all 12 Noto TTFs (4 families × 3 weights) loaded at startup via
 * useFonts regardless of the active language. Now only the active language's
 * family loads — at boot for a stored preference, or during a language
 * transition BEFORE the switch commits, so text never renders blank.
 *
 * Failure or in-progress loading falls back to the system font (iOS/Android
 * system fonts render all supported Indic scripts) — never blank text.
 */

import type { Lang } from "./types";

export type ScriptLang = "hi" | "ta" | "te" | "gu";

const SCRIPT_LANG_SET: ReadonlySet<string> = new Set(["hi", "ta", "te", "gu"]);

export function isScriptLang(lang: Lang): lang is ScriptLang {
  return SCRIPT_LANG_SET.has(lang);
}

export const FONT_BY_LANG: Record<ScriptLang, string> = {
  hi: "NotoSansDevanagari_400Regular",
  ta: "NotoSansTamil_400Regular",
  te: "NotoSansTelugu_400Regular",
  gu: "NotoSansGujarati_400Regular",
};

/**
 * Per-weight TTF requires (not the package index, which would pull every
 * weight of the family into the asset graph).
 */
const FONT_SOURCES: Record<ScriptLang, () => Record<string, unknown>> = {
  hi: () => ({
    /* eslint-disable @typescript-eslint/no-require-imports */
    NotoSansDevanagari_400Regular: require("@expo-google-fonts/noto-sans-devanagari/400Regular/NotoSansDevanagari_400Regular.ttf"),
    NotoSansDevanagari_500Medium: require("@expo-google-fonts/noto-sans-devanagari/500Medium/NotoSansDevanagari_500Medium.ttf"),
    NotoSansDevanagari_600SemiBold: require("@expo-google-fonts/noto-sans-devanagari/600SemiBold/NotoSansDevanagari_600SemiBold.ttf"),
    /* eslint-enable @typescript-eslint/no-require-imports */
  }),
  ta: () => ({
    /* eslint-disable @typescript-eslint/no-require-imports */
    NotoSansTamil_400Regular: require("@expo-google-fonts/noto-sans-tamil/400Regular/NotoSansTamil_400Regular.ttf"),
    NotoSansTamil_500Medium: require("@expo-google-fonts/noto-sans-tamil/500Medium/NotoSansTamil_500Medium.ttf"),
    NotoSansTamil_600SemiBold: require("@expo-google-fonts/noto-sans-tamil/600SemiBold/NotoSansTamil_600SemiBold.ttf"),
    /* eslint-enable @typescript-eslint/no-require-imports */
  }),
  te: () => ({
    /* eslint-disable @typescript-eslint/no-require-imports */
    NotoSansTelugu_400Regular: require("@expo-google-fonts/noto-sans-telugu/400Regular/NotoSansTelugu_400Regular.ttf"),
    NotoSansTelugu_500Medium: require("@expo-google-fonts/noto-sans-telugu/500Medium/NotoSansTelugu_500Medium.ttf"),
    NotoSansTelugu_600SemiBold: require("@expo-google-fonts/noto-sans-telugu/600SemiBold/NotoSansTelugu_600SemiBold.ttf"),
    /* eslint-enable @typescript-eslint/no-require-imports */
  }),
  gu: () => ({
    /* eslint-disable @typescript-eslint/no-require-imports */
    NotoSansGujarati_400Regular: require("@expo-google-fonts/noto-sans-gujarati/400Regular/NotoSansGujarati_400Regular.ttf"),
    NotoSansGujarati_500Medium: require("@expo-google-fonts/noto-sans-gujarati/500Medium/NotoSansGujarati_500Medium.ttf"),
    NotoSansGujarati_600SemiBold: require("@expo-google-fonts/noto-sans-gujarati/600SemiBold/NotoSansGujarati_600SemiBold.ttf"),
    /* eslint-enable @typescript-eslint/no-require-imports */
  }),
};

/** Receives a lazy asset getter so tests never touch real .ttf requires. */
type FontLoader = (getAssets: () => Record<string, unknown>) => Promise<void>;

/** Lazy expo-font resolution — unavailable in Node tests (system fallback). */
function defaultFontLoader(): FontLoader | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Font = require("expo-font") as {
      loadAsync: (assets: Record<string, unknown>) => Promise<void>;
    };
    return (getAssets) => Font.loadAsync(getAssets());
  } catch {
    return null;
  }
}

let testFontLoader: FontLoader | null | undefined;

/** Test-only injection point. Pass undefined to restore the real loader. */
export function __setFontLoaderForTests(loader: FontLoader | null | undefined): void {
  testFontLoader = loader;
}

const loadedScriptLangs = new Set<ScriptLang>();
const inFlight = new Map<ScriptLang, Promise<boolean>>();

export function isScriptFontLoaded(lang: Lang): boolean {
  return isScriptLang(lang) ? loadedScriptLangs.has(lang) : true;
}

/**
 * Load the active language's script font family. Cached per language; never
 * throws — returns false on failure so callers keep the system-font fallback.
 */
export async function ensureScriptFontLoaded(lang: Lang): Promise<boolean> {
  if (!isScriptLang(lang)) return true;
  if (loadedScriptLangs.has(lang)) return true;

  let load = inFlight.get(lang);
  if (!load) {
    load = (async () => {
      try {
        const loader = testFontLoader !== undefined ? testFontLoader : defaultFontLoader();
        if (!loader) return false;
        await loader(() => FONT_SOURCES[lang]());
        loadedScriptLangs.add(lang);
        return true;
      } catch {
        return false;
      } finally {
        inFlight.delete(lang);
      }
    })();
    inFlight.set(lang, load);
  }
  return load;
}

/** Loaded font family for a language, or undefined → system font fallback. */
export function resolveLoadedLocaleFont(lang: Lang): string | undefined {
  if (!isScriptLang(lang)) return undefined;
  return loadedScriptLangs.has(lang) ? FONT_BY_LANG[lang] : undefined;
}

/** Test-only cache reset. */
export function __clearScriptFontCacheForTests(): void {
  loadedScriptLangs.clear();
  inFlight.clear();
}
