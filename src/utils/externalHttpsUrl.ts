/**
 * Pure HTTPS URL gate for external browser opens (no React Native imports).
 */

const HTTPS_ONLY = /^https:\/\//i;
const FORBIDDEN_AUTH = /\/auth\/?(\?|#|$)/i;
const RETIRED_IN_HOST = /(?:^|\.)specialsoftwares\.in$/i;
const PLACEHOLDER_HOST = /(?:^|\.)example\.com$|\.example$/i;

/** Honest user-facing copy when the system browser cannot be opened. */
export const EXTERNAL_OPEN_FAILED_MESSAGE =
  "Unable to open this page. Please try again.";

/**
 * Normalize and validate a value that is about to be passed to Linking.openURL.
 * Returns the exact https string to open, or null when the value must not be opened.
 *
 * Rejects: non-strings, objects (e.g. entire PublicLinkResolution), Expo Router
 * paths, `/https://…` accidents, mailto/javascript, `/auth`, retired `.in`
 * hosts, example.com placeholders, empty store-style blanks.
 */
export function normalizeOpenableHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url) return null;
  if (/^(javascript|data|file|vbscript|mailto):/i.test(url)) return null;
  if (!HTTPS_ONLY.test(url)) return null;
  if (FORBIDDEN_AUTH.test(url)) return null;
  if (url.startsWith("/") || /\s/.test(url)) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (RETIRED_IN_HOST.test(parsed.hostname)) return null;
  if (PLACEHOLDER_HOST.test(parsed.hostname)) return null;
  if (parsed.username || parsed.password) return null;

  return url;
}

export function isSafeExternalUrl(url: string): boolean {
  return normalizeOpenableHttpsUrl(url) != null;
}
