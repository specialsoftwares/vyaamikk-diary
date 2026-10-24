/**
 * Exact INR minor units for the party ledger.
 * One rupee is 100 paise. Callers pass validated strings or unambiguous numbers.
 * BigInt never crosses JSON; minor units are canonical integer strings.
 */

export const INR_CURRENCY = "INR" as const;
export const INR_SCALE = 2;

export interface InrMoney {
  currency: typeof INR_CURRENCY;
  minor: string;
  scale: typeof INR_SCALE;
}

export type MoneyRejectReason =
  | "empty"
  | "invalid"
  | "negative"
  | "fractional_paise"
  | "non_finite"
  | "ambiguous"
  | "out_of_range";

export type MoneyParse =
  | { ok: true; money: InrMoney }
  | { ok: false; reason: MoneyRejectReason };

const MAX_MINOR = 10n ** 15n;

export function inr(minor: bigint): InrMoney {
  if (minor > MAX_MINOR || minor < -MAX_MINOR) {
    throw new RangeError("inr_out_of_range");
  }
  return { currency: INR_CURRENCY, minor: minor.toString(), scale: INR_SCALE };
}

export function minorOf(money: InrMoney): bigint {
  if (!/^-?\d+$/.test(money.minor)) throw new Error("inr_minor_invalid");
  return BigInt(money.minor);
}

export function addInr(left: InrMoney, right: InrMoney): InrMoney {
  return inr(minorOf(left) + minorOf(right));
}

export function subInr(left: InrMoney, right: InrMoney): InrMoney {
  return inr(minorOf(left) - minorOf(right));
}

export function sumInr(parts: InrMoney[]): InrMoney {
  let total = 0n;
  for (const part of parts) total += minorOf(part);
  return inr(total);
}

export function isZeroInr(money: InrMoney): boolean {
  return minorOf(money) === 0n;
}

/** User-entered or stored rupee text. Does not round leftover paise. */
export function parseInrDecimal(raw: unknown): MoneyParse {
  if (raw == null) return { ok: false, reason: "empty" };
  if (typeof raw === "number") return parseFiniteRupees(raw);
  if (typeof raw !== "string") return { ok: false, reason: "invalid" };
  let text = raw.trim().replace(/₹/g, "").replace(/[\s\u00a0]/g, "");
  if (!text) return { ok: false, reason: "empty" };
  if (text.startsWith("+")) return { ok: false, reason: "invalid" };
  if (text.startsWith("-")) return { ok: false, reason: "negative" };
  if (/[a-zA-Z]/.test(text)) return { ok: false, reason: "invalid" };
  const dots = text.match(/\./g)?.length ?? 0;
  if (dots > 1) return { ok: false, reason: "invalid" };
  if (text.includes(",")) {
    if (!/^\d{1,3}(,\d{2,3})*(\.\d+)?$/.test(text) && !/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
      return { ok: false, reason: "invalid" };
    }
    text = text.replace(/,/g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, reason: "invalid" };
  const [whole, frac = ""] = text.split(".");
  if (frac.length > INR_SCALE) return { ok: false, reason: "fractional_paise" };
  const padded = frac.padEnd(INR_SCALE, "0");
  const minor = BigInt(whole || "0") * 100n + BigInt(padded || "0");
  if (minor > MAX_MINOR) return { ok: false, reason: "out_of_range" };
  return { ok: true, money: inr(minor) };
}

function parseFiniteRupees(value: number): MoneyParse {
  if (!Number.isFinite(value)) return { ok: false, reason: "non_finite" };
  if (value < 0) return { ok: false, reason: "negative" };
  if (value > 1e12) return { ok: false, reason: "out_of_range" };
  const scaled = value * 100;
  const nearest = Math.round(scaled);
  if (!Number.isSafeInteger(nearest)) return { ok: false, reason: "out_of_range" };
  if (Math.abs(scaled - nearest) > 1e-6) return { ok: false, reason: "ambiguous" };
  const roundTrip = nearest / 100;
  if (Math.abs(roundTrip - value) > 1e-8) return { ok: false, reason: "ambiguous" };
  return { ok: true, money: inr(BigInt(nearest)) };
}

function groupIndianDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  const tail = digits.slice(-3);
  const head = digits.slice(0, -3);
  const parts: string[] = [];
  for (let index = head.length; index > 0; index -= 2) {
    parts.unshift(head.slice(Math.max(0, index - 2), index));
  }
  return `${parts.join(",")},${tail}`;
}

/** Display from minor units. Does not pass through JS Number. */
export function formatInrMinor(minor: bigint | string, withSymbol = true): string {
  const value = typeof minor === "string" ? BigInt(minor) : minor;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const rupees = (abs / 100n).toString();
  const paise = (abs % 100n).toString().padStart(2, "0");
  const body = `${groupIndianDigits(rupees)}.${paise}`;
  const signed = negative ? `-${body}` : body;
  return withSymbol ? `₹${signed}` : signed;
}
