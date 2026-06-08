/**
 * Privacy-safe logging helpers for PDF flows.
 * Never pass HTML, PDF bodies, bank fields, or letterhead matter text to logs.
 */

const PDF_HTML_RE = /<!DOCTYPE|<html[\s>]|<body[\s>]/i;

const ALLOWED_META_KEYS = new Set([
  "entryId",
  "packId",
  "docId",
  "userId",
  "entryType",
  "fileNameHint",
  "fileName",
  "ms",
  "count",
  "version",
  "op",
  "entity",
  "entityId",
  "backend",
  "scope",
]);

/** Returns true if a string looks like generated PDF HTML. */
export function looksLikePdfHtml(value: string): boolean {
  const s = value.trim();
  if (s.length < 120) return false;
  return PDF_HTML_RE.test(s);
}

/**
 * Whitelist-only metadata for pdfService / export logs.
 * Throws in development if disallowed keys are passed.
 */
export function safePdfLogMeta(
  meta?: Record<string, unknown>
): Record<string, string | number | boolean> | undefined {
  if (!meta) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!ALLOWED_META_KEYS.has(k)) {
      if (__DEV__) {
        console.warn(`[pdfSafeLog] blocked log key: ${k}`);
      }
      continue;
    }
    if (typeof v === "string" && looksLikePdfHtml(v)) continue;
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Redact PDF HTML if it appears in arbitrary log payloads. */
export function redactPdfContentInLogData(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[nested]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (looksLikePdfHtml(value)) return "[redacted:pdf-html]";
    if (value.length > 4000) return "[redacted:long-string]";
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactPdfContentInLogData(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/html|pdfcontent|pdfbody|rawhtml/i.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = redactPdfContentInLogData(v, depth + 1);
    }
    return out;
  }
  return value;
}
