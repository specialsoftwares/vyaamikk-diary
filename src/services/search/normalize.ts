/**
 * Search text normalization — Unicode-safe, no logging of queries.
 */

export function normalizeSearchText(input: string): string {
  return String(input ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeQuery(query: string): string[] {
  const n = normalizeSearchText(query);
  if (!n) return [];
  return n.split(" ").filter((t) => t.length > 0);
}

/** Digits-only form for invoice/LR/amount matching (e.g. 2,00,000 → 200000). */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function appendText(parts: string[], value: unknown): void {
  if (value == null) return;
  if (typeof value === "number" && Number.isFinite(value)) {
    parts.push(String(value));
    parts.push(String(Math.round(value)));
    return;
  }
  if (typeof value === "boolean") return;
  if (typeof value === "string" && value.trim()) {
    parts.push(value.trim());
  }
}

export function appendAmount(parts: string[], amount: number | null | undefined): void {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return;
  parts.push(String(amount));
  parts.push(digitsOnly(String(amount)));
  const inr = amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  parts.push(inr);
  parts.push(inr.replace(/,/g, ""));
}

/** Last four digits only — safe for search index (not full numbers). */
export function appendMobileLast4(
  parts: string[],
  mobile: string | null | undefined
): void {
  if (!mobile?.trim()) return;
  const d = digitsOnly(mobile);
  if (d.length >= 4) parts.push(d.slice(-4));
}
