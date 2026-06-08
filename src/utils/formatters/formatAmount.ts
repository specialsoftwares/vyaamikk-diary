import { DATA_FORMAT_LOCALE } from "./constants";

export interface FormatAmountOptions {
  withSymbol?: boolean;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/**
 * Format monetary amounts with fixed en-IN grouping and Western Arabic numerals.
 * Never pass UI language into this helper.
 */
export function formatAmount(
  amount: number,
  options: FormatAmountOptions = {}
): string {
  const {
    withSymbol = true,
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
  } = options;

  if (!Number.isFinite(amount)) {
    return withSymbol ? "₹—" : "—";
  }

  const formatted = new Intl.NumberFormat(DATA_FORMAT_LOCALE, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount);

  return withSymbol ? `₹${formatted}` : formatted;
}
