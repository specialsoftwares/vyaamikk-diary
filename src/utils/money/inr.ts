import { formatAmount, type FormatAmountOptions } from "@/utils/formatters/formatAmount";

/**
 * Indian rupee (INR) parsing and display.
 * Amounts are stored as decimal rupees (not paise).
 */

/** Parse user-entered INR text into decimal rupees, or null if invalid. */
export function parseINRInput(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return raw;
  }

  let s = String(raw).trim();
  if (!s) return null;

  s = s.replace(/₹/gi, "").replace(/\s/g, "");
  if (/[a-df-zA-DF-Z]/i.test(s)) return null;

  const dotCount = (s.match(/\./g) ?? []).length;
  if (dotCount > 1) return null;

  if (s.includes(",")) {
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastDot !== -1 && lastComma > lastDot) return null;
    s = s.replace(/,/g, "");
  }

  if (s.startsWith("-") || s.includes("-", 1)) return null;

  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Like {@link parseINRInput} but returns NaN when invalid (for Zod preprocess). */
export function parseINRInputOrNaN(raw: unknown): number {
  return parseINRInput(raw) ?? NaN;
}

/** Format rupees for display (default Indian grouping, e.g. ₹2,00,000). */
export function formatINR(
  amount: number,
  options?: { locale?: string; withSymbol?: boolean } & Pick<
    FormatAmountOptions,
    "minimumFractionDigits" | "maximumFractionDigits"
  >
): string {
  void options?.locale;
  return formatAmount(amount, {
    withSymbol: options?.withSymbol ?? true,
    minimumFractionDigits: options?.minimumFractionDigits,
    maximumFractionDigits: options?.maximumFractionDigits,
  });
}
