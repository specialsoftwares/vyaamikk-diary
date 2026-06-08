import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import hi from "./locales/hi.json";
import ta from "./locales/ta.json";
import te from "./locales/te.json";
import gu from "./locales/gu.json";
import type { Lang } from "./types";
import { isLang, SUPPORTED_LANGS } from "./types";

const NS = "translation" as const;

export const I18N_RESOURCES = {
  en: { [NS]: en },
  hi: { [NS]: hi },
  ta: { [NS]: ta },
  te: { [NS]: te },
  gu: { [NS]: gu },
} as const;

let initPromise: Promise<typeof i18n> | null = null;

export async function initI18n(initialLang: Lang = "en"): Promise<typeof i18n> {
  if (i18n.isInitialized) {
    if (isLang(i18n.language) && i18n.language !== initialLang) {
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
      resources: I18N_RESOURCES,
      interpolation: { escapeValue: false },
      returnNull: false,
      returnEmptyString: false,
      keySeparator: ".",
      compatibilityJSON: "v4",
    })
    .then(() => i18n);

  return initPromise;
}

/** All locale bundles are registered at init — kept for API compatibility. */
export async function ensureLocaleBundle(_lang: Lang): Promise<void> {
  await initI18n();
}

export async function changeAppLanguage(lang: Lang): Promise<void> {
  await initI18n();
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

export function getRegisteredLanguages(): Lang[] {
  return SUPPORTED_LANGS.filter((code) => i18n.hasResourceBundle(code, NS));
}

export { i18n };
