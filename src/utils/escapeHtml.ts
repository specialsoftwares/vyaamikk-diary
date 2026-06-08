/**
 * Escape user-controlled text before embedding in HTML/PDF templates.
 * Prevents HTML injection in expo-print generated documents.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Alias for PDF template modules. */
export const esc = escapeHtml;

/**
 * Escape for HTML attribute contexts (e.g. img src when not a trusted data URI).
 */
export function escapeHtmlAttr(value: unknown): string {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
