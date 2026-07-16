/**
 * Pure mailto URL gate — no React Native imports (Node-testable).
 */

export function normalizeMailtoUrl(emailOrMailto: unknown): string | null {
  if (typeof emailOrMailto !== "string") return null;
  const raw = emailOrMailto.trim();
  if (!raw) return null;
  if (/^(javascript|data|file|vbscript):/i.test(raw)) return null;
  if (/^mailto:/i.test(raw)) {
    const rest = raw.slice("mailto:".length).trim();
    const addr = rest.split("?")[0]?.split("#")[0]?.trim() ?? "";
    if (!addr || !addr.includes("@")) return null;
    return raw.trim();
  }
  if (!raw.includes("@") || /\s/.test(raw)) return null;
  return `mailto:${raw}`;
}
