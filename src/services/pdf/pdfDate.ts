/** Consistent PDF date formatting — DD MMM YYYY. */

export function formatPdfDate(ms: number, locale = "en-IN"): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toDateString();
  }
}

export function formatPdfDateTime(ms: number, locale = "en-IN"): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}
