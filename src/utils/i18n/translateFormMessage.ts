/** Resolve Zod / form error keys stored as i18n paths. */
export function translateFormMessage(
  t: (key: string, params?: Record<string, string | number>) => string,
  raw: string
): string {
  if (!raw) return raw;
  if (raw.startsWith("composer.") || raw.startsWith("datePolicy.")) {
    try {
      return t(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}
