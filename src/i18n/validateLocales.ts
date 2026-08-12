import en from "./locales/en.json";
import { SUPPORTED_LANGS, type Lang } from "./types";

type JsonTree = Record<string, unknown>;

/**
 * Read locale JSON via static `require` paths (not dynamic `import()`).
 * Metro async chunks for JSON are unreliable under Expo Go HMR.
 * This does NOT register bundles into i18next — validation is read-only.
 */
function loadLocaleTree(lang: Lang): JsonTree {
  switch (lang) {
    case "en":
      return en as JsonTree;
    case "hi":
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("./locales/hi.json") as JsonTree;
    case "ta":
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("./locales/ta.json") as JsonTree;
    case "te":
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("./locales/te.json") as JsonTree;
    case "gu":
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("./locales/gu.json") as JsonTree;
  }
}

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
export async function validateLocaleSetup(): Promise<LocaleValidationReport> {
  const trees = new Map<Lang, JsonTree>();
  const registered: Lang[] = [];
  const missingRegistration: Lang[] = [];

  for (const lang of SUPPORTED_LANGS) {
    try {
      const tree = loadLocaleTree(lang);
      if (tree && Object.keys(tree).length > 0) {
        trees.set(lang, tree);
        registered.push(lang);
      } else {
        missingRegistration.push(lang);
      }
    } catch {
      missingRegistration.push(lang);
    }
  }

  const enKeys = flattenKeys(en);
  const missingKeys: Partial<Record<Lang, string[]>> = {};

  for (const lang of SUPPORTED_LANGS) {
    if (lang === "en") continue;
    const tree = trees.get(lang);
    if (!tree) continue;
    const localeKeys = new Set(flattenKeys(tree));
    const missing = enKeys.filter((key) => !localeKeys.has(key));
    if (missing.length > 0) missingKeys[lang] = missing.slice(0, 20);
  }

  const ok = missingRegistration.length === 0;
  return { ok, registered, missingRegistration, missingKeys };
}

export function assertLocalesInDev(): void {
  if (!__DEV__) return;
  void validateLocaleSetup()
    .then((report) => {
      if (!report.ok) {
        console.warn("[i18n] locale validation failed", report);
      }
    })
    .catch((e) => {
      console.warn("[i18n] locale validation errored", e);
    });
}
