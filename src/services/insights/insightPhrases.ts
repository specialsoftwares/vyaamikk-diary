import en from "@/i18n/locales/en.json";

/** One locale sentence. `key` is a path in the locale catalogs. `text` is a figure, not a translation. */
export interface InsightPhrase {
  key: string;
  vars?: Record<string, string | number>;
  text?: string;
}

export function insightPhrase(
  key: string,
  vars?: Record<string, string | number>
): InsightPhrase {
  return vars ? { key, vars } : { key };
}

/** A quantity or money figure that stays as stored, in every language. */
export function insightText(text: string): InsightPhrase {
  return { key: "", text };
}

function readKey(tree: unknown, key: string): string | null {
  let node: unknown = tree;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object" || !Object.prototype.hasOwnProperty.call(node, part)) {
      return null;
    }
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : null;
}

function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = vars[name];
    return value == null ? "" : String(value);
  });
}

/** Join catalog sentences. English is the default so calculations stay testable without a language runtime. */
export function renderInsightPhrases(
  phrases: readonly InsightPhrase[],
  tree: unknown = en,
  joiner = " "
): string {
  const source = tree ?? en;
  return phrases
    .map((phrase) => phraseText(phrase, (key, vars) => {
      const template = readKey(source, key);
      return template ? fill(template, vars) : "";
    }))
    .filter(Boolean)
    .join(joiner);
}

/** Same sentences in the active language. Data fragments stay unchanged. */
export function translateInsightPhrases(
  phrases: readonly InsightPhrase[],
  t: (key: string, vars?: Record<string, string | number>) => string,
  joiner = " "
): string {
  return phrases
    .map((phrase) => phraseText(phrase, t))
    .filter(Boolean)
    .join(joiner);
}

function phraseText(
  phrase: InsightPhrase,
  lookup: (key: string, vars?: Record<string, string | number>) => string
): string {
  if (phrase.text != null) return phrase.text.trim();
  if (!phrase.key) return "";
  return lookup(phrase.key, phrase.vars).trim();
}
