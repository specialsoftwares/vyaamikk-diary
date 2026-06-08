import { digitsOnly } from "./normalize";

/** Strip sensitive long digit sequences from visible snippets. */
export function sanitizeSearchSnippet(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/\b\d{10,}\b/g, (m) => `···${m.slice(-4)}`)
    .replace(/\b\d{6,9}\b/g, (m) => `···${m.slice(-4)}`);
}

export function buildMatchedSnippet(
  rawSnippet: string,
  query: string,
  maxLen = 96
): string {
  const snippet = sanitizeSearchSnippet(rawSnippet);
  if (!snippet) return "";
  const q = query.trim();
  if (!q || q.length < 2) {
    return snippet.length > maxLen ? `${snippet.slice(0, maxLen)}…` : snippet;
  }
  const lower = snippet.toLocaleLowerCase("en");
  const needle = q.toLocaleLowerCase("en");
  const idx = lower.indexOf(needle);
  if (idx >= 0) {
    const start = Math.max(0, idx - 24);
    const slice = snippet.slice(start, start + maxLen);
    const prefix = start > 0 ? "…" : "";
    const suffix = start + maxLen < snippet.length ? "…" : "";
    return `${prefix}${slice}${suffix}`;
  }
  const tokens = needle.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    const ti = lower.indexOf(tok);
    if (ti >= 0) {
      const start = Math.max(0, ti - 20);
      const slice = snippet.slice(start, start + maxLen);
      return `${start > 0 ? "…" : ""}${slice}${slice.length < snippet.length ? "…" : ""}`;
    }
  }
  const digitQ = digitsOnly(q);
  if (digitQ.length >= 2) {
    const compact = digitsOnly(snippet);
    const di = compact.indexOf(digitQ);
    if (di >= 0) {
      return snippet.length > maxLen ? `${snippet.slice(0, maxLen)}…` : snippet;
    }
  }
  return snippet.length > maxLen ? `${snippet.slice(0, maxLen)}…` : snippet;
}
