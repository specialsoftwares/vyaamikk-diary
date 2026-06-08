import { DATA_FORMAT_LOCALE } from "./constants";

export interface FormatNumberOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/** Format plain numbers with fixed en-IN locale (Western Arabic numerals). */
export function formatNumber(
  value: number,
  options: FormatNumberOptions = {}
): string {
  if (!Number.isFinite(value)) return "—";
  const { minimumFractionDigits = 0, maximumFractionDigits = 2 } = options;
  return new Intl.NumberFormat(DATA_FORMAT_LOCALE, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}
