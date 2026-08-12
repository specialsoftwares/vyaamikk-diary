import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import type { Lang } from "./types";
import { isLang, SUPPORTED_LANGS } from "./types";

const NS = "translation" as const;

/**
 * English is the only eagerly-registered i18n bundle (fallback language,
 * required for first paint). Other locales are registered into i18next on
 * demand — at boot for a stored non-English preference, or during a language
 * transition before the switch commits.
 *
 * Loaders use synchronous `require()` of explicit `.json` paths (not
 * `import()`). Metro's async-require chunks for JSON are fragile under Expo Go
 * HMR ("Requiring unknown module N") after graph changes; require keeps the
 * payloads in the main bundle while still delaying `addResourceBundle` until
 * the language is actually needed.
 */
type LocaleModule = { default?: Record<string, unknown> } & Record<string, unknown>;

function loadLocaleModule(lang: Exclude<Lang, "en">): LocaleModule {
  switch (lang) {
    case "hi":
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("./locales/hi.json") as LocaleModule;
    case "ta":
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("./locales/ta.json") as LocaleModule;
    case "te":
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("./locales/te.json") as LocaleModule;
    case "gu":
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("./locales/gu.json") as LocaleModule;
  }
}

const bundleLoads = new Map<Lang, Promise<void>>();

let initPromise: Promise<typeof i18n> | null = null;

/** Initialize if needed WITHOUT touching the active language. */
async function ensureInitialized(): Promise<void> {
  if (i18n.isInitialized) return;
  await initI18n("en");
}

export async function initI18n(initialLang: Lang = "en"): Promise<typeof i18n> {
  if (i18n.isInitialized) {
    if (isLang(i18n.language) && i18n.language !== initialLang) {
      await ensureLocaleBundle(initialLang);
      await i18n.changeLanguage(initialLang);
    }
    return i18n;
  }
  if (initPromise) return initPromise;

  const lng = isLang(initialLang) ? initialLang : "en";

  initPromise = i18n
    .use(initReactI18next)
    .init({
      lng,
      fallbackLng: "en",
      supportedLngs: [...SUPPORTED_LANGS],
      ns: [NS],
      defaultNS: NS,
      resources: { en: { [NS]: en } },
      interpolation: { escapeValue: false },
      returnNull: false,
      returnEmptyString: false,
      keySeparator: ".",
      compatibilityJSON: "v4",
    })
    .then(() => i18n);

  return initPromise;
}

/**
 * Load and register one locale bundle. Cached: repeated calls resolve from
 * the registered bundle / in-flight promise. Throws when the dynamic import
 * fails so callers can keep the current language instead of switching to a
 * half-empty one.
 */
export async function ensureLocaleBundle(lang: Lang): Promise<void> {
  await ensureInitialized();
  if (lang === "en" || i18n.hasResourceBundle(lang, NS)) return;

  let load = bundleLoads.get(lang);
  if (!load) {
    load = Promise.resolve()
      .then(() => {
        const mod = loadLocaleModule(lang);
        const data = (mod.default ?? mod) as Record<string, unknown>;
        if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
          throw new Error(`[i18n] locale bundle empty: ${lang}`);
        }
        i18n.addResourceBundle(lang, NS, data, true, true);
      })
      .catch((e: unknown) => {
        bundleLoads.delete(lang);
        throw e;
      });
    bundleLoads.set(lang, load);
  }
  await load;
}

export async function changeAppLanguage(lang: Lang): Promise<void> {
  await ensureInitialized();
  await ensureLocaleBundle(lang);
  await i18n.changeLanguage(lang);
  if (i18n.language !== lang) {
    throw new Error(`[i18n] changeLanguage failed: expected ${lang}, got ${i18n.language}`);
  }
}

export function translateSync(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>
): string {
  const t = i18n.getFixedT(lang, NS);
  return t(key, vars as Record<string, string>);
}

/** Languages whose bundle is currently registered (loaded). */
export function getRegisteredLanguages(): Lang[] {
  return SUPPORTED_LANGS.filter((code) => i18n.hasResourceBundle(code, NS));
}

export { i18n };
