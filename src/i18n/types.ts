/** UI languages supported by Vyaamikk Diary. Data formatting stays en-IN. */
export type Lang = "en" | "hi" | "ta" | "te" | "gu";

export const SUPPORTED_LANGS: readonly Lang[] = ["en", "hi", "ta", "te", "gu"] as const;

export const LANG_STORAGE_KEY = "vyd_language_v1";
export const LEGACY_LANG_STORAGE_KEY = "vyd_lang_v1";

export const LANG_NATIVE_LABELS: Record<Lang, string> = {
  en: "English",
  hi: "हिन्दी",
  ta: "தமிழ்",
  te: "తెలుగు",
  gu: "ગુજરાતી",
};

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (SUPPORTED_LANGS as readonly string[]).includes(value);
}

/** Fixed data-format locale — never tied to UI language. */
export const DATA_FORMAT_LOCALE = "en-IN" as const;
