/**
 * VYAAMIKK DIARY — INDIA GST TAX-DOCUMENT MODEL
 *
 * This module must not infer GST liability merely from the payment channel.
 *
 * IGST Act section 14 applies to specified OIDAR supplies made from a
 * non-taxable territory to a non-taxable online recipient. It is not a
 * blanket rule making Google Play or Apple the GST supplier for subscriptions
 * sold by an Indian LLP.
 *
 * For India-based Google Play developers, Google's current tax documentation
 * states that the developer remains responsible for determining applicable
 * GST on app / in-app sales; Google separately handles applicable marketplace
 * TDS / GST-TCS obligations.
 *
 * Apple tax treatment must follow the applicable Paid Apps Agreement /
 * Schedule 2, App Store tax settings and India-specific arrangement. Do not
 * assume Apple's tax responsibility until that channel has been formally
 * classified.
 *
 * Therefore tax-document generation is controlled by a verified
 * PlatformTaxPolicy, not merely by whether the buyer supplied a GSTIN.
 *
 * Direct-web/Razorpay sales, when introduced, are developer-direct supplies
 * and have their own explicitly configured GST treatment.
 *
 * Buyer GST registration determines B2B/B2C recipient classification; it
 * does NOT by itself determine whether Special Softwares or a platform is
 * responsible for charging/reporting tax.
 *
 * No tax invoice may be generated from an unconfirmed tax-responsibility
 * policy.
 */

import { BillingError } from "../errors";

import { isPaiseCalculationValid as taxMathValid } from "./taxMath";

export const IST_TIME_ZONE = "Asia/Kolkata";

const FY_PATTERN = /^(\d{4})-(\d{2})$/;

function istParts(epochMs: number): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const bag = Object.fromEntries(
    fmt.formatToParts(new Date(epochMs)).map((p) => [p.type, p.value])
  );
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
  };
}

/** Invoice FY label, e.g. "2026-27". */
export function getFinancialYearForDate(date: Date | number): string {
  const ms = typeof date === "number" ? date : date.getTime();
  if (!Number.isFinite(ms)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "invalid_financial_year_date",
    });
  }
  const { year, month } = istParts(ms);
  const startYear = month >= 4 ? year : year - 1;
  return formatFy(startYear);
}

export function getCurrentFinancialYear(now: Date | number = Date.now()): string {
  return getFinancialYearForDate(now);
}

/** IST calendar month key YYYY-MM. */
export function getMonthKey(date: Date | number): string {
  const ms = typeof date === "number" ? date : date.getTime();
  const { year, month } = istParts(ms);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseFinancialYear(fy: string): { startYear: number; endYear: number } {
  const m = FY_PATTERN.exec(fy);
  if (!m) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "invalid_financial_year_string",
    });
  }
  const startYear = Number(m[1]);
  const endTwo = Number(m[2]);
  const expectedEndTwo = (startYear + 1) % 100;
  if (endTwo !== expectedEndTwo) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "invalid_financial_year_string",
    });
  }
  return { startYear, endYear: startYear + 1 };
}

/** Epoch ms of 1 April 00:00:00.000 IST of the FY. */
export function getFinancialYearStartDate(fy: string): Date {
  const { startYear } = parseFinancialYear(fy);
  return new Date(istWallTimeToUtcMs(startYear, 4, 1, 0, 0, 0));
}

export function isPaiseCalculationValid(parts: {
  taxableAmountInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  totalInPaise: number;
}): boolean {
  return taxMathValid(parts);
}

function formatFy(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/**
 * Convert an Asia/Kolkata wall-clock to UTC epoch. IST is UTC+05:30 with no DST.
 */
function istWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): number {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second) - (5 * 60 + 30) * 60_000;
  return utcGuess;
}

/** Test helper: IST wall clock → epoch ms. */
export function istWallClockToEpochMs(isoLocal: string): number {
  // "2027-03-31T23:59:59"
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(isoLocal);
  if (!m) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "invalid_ist_wall_clock",
    });
  }
  return istWallTimeToUtcMs(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6])
  );
}

/**
 * Add calendar days to an Asia/Kolkata civil date, returning 23:59:59.000 IST
 * of the resulting day. Used for operational invoice-issue aging only.
 */
export function addIstCalendarDays(epochMs: number, days: number): number {
  if (!Number.isFinite(epochMs) || !Number.isInteger(days)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "invalid_ist_calendar_date",
    });
  }
  const { year, month, day } = istParts(epochMs);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return istWallTimeToUtcMs(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    23,
    59,
    59
  );
}

/**
 * Rule 47 ordinary taxable-service outer issue hint: 30 days from supply.
 * Not enforced against pending-GSTIN holds in VYD-40 (production-enablement gate).
 */
export const ORDINARY_TAXABLE_SERVICE_INVOICE_ISSUE_DAYS = 30;

export function ordinaryTaxableServiceInvoiceIssueDueAt(supplyOccurredAt: number): number {
  return addIstCalendarDays(supplyOccurredAt, ORDINARY_TAXABLE_SERVICE_INVOICE_ISSUE_DAYS);
}

/**
 * Section 34 reporting outer limit: 30 November following the end of the FY
 * of the original supply. Annual-return date is unknown and is not guessed.
 */
export function section34OutputTaxReductionOuterLimitMs(originalSupplyOccurredAt: number): number {
  const { endYear } = parseFinancialYear(getFinancialYearForDate(originalSupplyOccurredAt));
  return istWallTimeToUtcMs(endYear, 11, 30, 23, 59, 59);
}

/**
 * Canonical India-local calendar date for tax documents: dd-MM-yyyy in
 * Asia/Kolkata. Never use UTC ISO date slices for invoice/GSTR dates.
 */
export function formatIstCalendarDate(epochMs: number): string {
  if (!Number.isFinite(epochMs)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "invalid_ist_calendar_date",
    });
  }
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const bag = Object.fromEntries(
    fmt.formatToParts(new Date(epochMs)).map((p) => [p.type, p.value])
  );
  return `${bag.day}-${bag.month}-${bag.year}`;
}
