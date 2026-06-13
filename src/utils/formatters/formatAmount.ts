import { parseINRInput } from "@/utils/money/inr";

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

/** Format a numeric amount, or return an already-formatted INR string unchanged. */
export function formatAmountDisplay(
  value: unknown,
  options: FormatAmountOptions = {}
): string {
  if (typeof value === "number") {
    return formatAmount(value, options);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return formatAmount(NaN, options);
    if (/^₹/.test(trimmed)) return trimmed;
    const parsed = parseINRInput(trimmed);
    if (parsed != null) return formatAmount(parsed, options);
    return trimmed;
  }
  return formatAmount(NaN, options);
}

/** Canonical user-facing INR formatter — pass raw numbers only. */
export const formatCurrencyINR = formatAmount;
