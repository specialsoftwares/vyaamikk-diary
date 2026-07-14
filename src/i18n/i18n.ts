import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import type { Lang } from "./types";
import { isLang, SUPPORTED_LANGS } from "./types";

const NS = "translation" as const;

/**
 * English is the only eagerly-registered bundle (fallback language, required
 * for first paint). The other locale payloads (~130–200KB JSON each) load on
 * demand via dynamic import — at boot for a stored non-English preference, or
 * during a language transition before the switch commits.
 */
type LocaleModule = { default?: Record<string, unknown> } & Record<string, unknown>;

const LOCALE_LOADERS: Record<Exclude<Lang, "en">, () => Promise<LocaleModule>> = {
  hi: () => import("./locales/hi.json"),
  ta: () => import("./locales/ta.json"),
  te: () => import("./locales/te.json"),
  gu: () => import("./locales/gu.json"),
};

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
    load = LOCALE_LOADERS[lang]()
      .then((mod) => {
        const data = (mod.default ?? mod) as Record<string, unknown>;
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
