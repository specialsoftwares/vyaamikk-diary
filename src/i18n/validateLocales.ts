import en from "./locales/en.json";
import hi from "./locales/hi.json";
import ta from "./locales/ta.json";
import te from "./locales/te.json";
import gu from "./locales/gu.json";
import { I18N_RESOURCES } from "./i18n";
import { SUPPORTED_LANGS, type Lang } from "./types";

type JsonTree = Record<string, unknown>;

const LOCALES: Record<Lang, JsonTree> = { en, hi, ta, te, gu };

function flattenKeys(node: unknown, prefix = "", out: string[] = []): string[] {
  if (typeof node === "string") {
    if (prefix) out.push(prefix);
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      flattenKeys(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
}

export interface LocaleValidationReport {
  ok: boolean;
  registered: Lang[];
  missingRegistration: Lang[];
  missingKeys: Partial<Record<Lang, string[]>>;
}

/** Dev-only sanity check — missing keys are OK (English fallback handles them). */
export function validateLocaleSetup(): LocaleValidationReport {
  const registered = SUPPORTED_LANGS.filter(
    (lang) => Boolean(I18N_RESOURCES[lang]?.translation)
  );
  const missingRegistration = SUPPORTED_LANGS.filter((lang) => !registered.includes(lang));

  const enKeys = flattenKeys(en);
  const missingKeys: Partial<Record<Lang, string[]>> = {};

  for (const lang of SUPPORTED_LANGS) {
    if (lang === "en") continue;
    const localeKeys = new Set(flattenKeys(LOCALES[lang]));
    const missing = enKeys.filter((key) => !localeKeys.has(key));
    if (missing.length > 0) missingKeys[lang] = missing.slice(0, 20);
  }

  const ok = missingRegistration.length === 0;
  return { ok, registered, missingRegistration, missingKeys };
}

export function assertLocalesInDev(): void {
  if (!__DEV__) return;
  const report = validateLocaleSetup();
  if (!report.ok) {
    console.warn("[i18n] locale validation failed", report);
  }
}
