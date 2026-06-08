/**
 * Compliance period labels vs due dates (India MSME statutory UX).
 * Due dates follow registry rules; period = return/tax period the due date relates to.
 */

import { addMonths, startOfMonth } from "date-fns";

export type CompliancePeriodVariant =
  | "monthly"
  | "tds_deductions"
  | "qrmp_pmt06"
  | "quarterly"
  | "annual_fy"
  | "assessment_year"
  | "advance_instalment";

const MONTH_FMT = new Intl.DateTimeFormat("en-IN", { month: "short" });

/** FY start year (April–March) containing `date`. */
export function indiaFinancialYearStartYear(date: Date): number {
  return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
}

export function indiaFinancialYearLabel(fyStartYear: number): string {
  const end = fyStartYear + 1;
  return `FY ${fyStartYear}–${String(end).slice(-2)}`;
}

/** Calendar month/year label, e.g. "May 2026". */
export function formatMonthYearLabel(monthDate: Date): string {
  return `${MONTH_FMT.format(monthDate)} ${monthDate.getFullYear()}`;
}

/**
 * For standard monthly filings: due in month M relates to compliance period M−1.
 */
export function getMonthlyCompliancePeriodForDueDate(dueDate: Date): Date {
  return startOfMonth(addMonths(dueDate, -1));
}

export function formatCompliancePeriodLabel(
  periodAnchor: Date,
  variant: CompliancePeriodVariant = "monthly"
): string {
  switch (variant) {
    case "tds_deductions":
      return `${formatMonthYearLabel(periodAnchor)} deductions`;
    case "qrmp_pmt06":
      return `${formatMonthYearLabel(periodAnchor)} (PMT-06)`;
    case "monthly":
      return formatMonthYearLabel(periodAnchor);
    case "quarterly":
      return formatQuarterPeriodLabel(periodAnchor);
    case "annual_fy":
      return indiaFinancialYearLabel(indiaFinancialYearStartYear(periodAnchor));
    case "assessment_year": {
      const y = periodAnchor.getFullYear();
      return `AY ${y}–${String(y + 1).slice(-2)}`;
    }
    case "advance_instalment": {
      const m = periodAnchor.getMonth();
      const names: Record<number, string> = {
        5: "June",
        8: "September",
        11: "December",
        2: "March",
      };
      return `Advance tax — ${names[m] ?? formatMonthYearLabel(periodAnchor)}`;
    }
    default:
      return formatMonthYearLabel(periodAnchor);
  }
}

/** Quarter-end month (1-based) → Q1–Q4 label with FY. */
export function formatQuarterPeriodLabel(quarterEndMonthDate: Date): string {
  const endM = quarterEndMonthDate.getMonth() + 1;
  const endY = quarterEndMonthDate.getFullYear();
  const fyStart = endM >= 4 ? endY : endY - 1;
  const q =
    endM === 3 ? 4 : endM === 6 ? 1 : endM === 9 ? 2 : endM === 12 ? 3 : 1;
  return `Q${q} ${indiaFinancialYearLabel(fyStart)}`;
}

/** User-facing period line, e.g. "May 2026 period" or "May 2026 deductions". */
export function formatStatutoryPeriodLine(
  periodLabel: string,
  t: (k: string, v?: Record<string, string>) => string
): string {
  if (!periodLabel) return "";
  const hasContext =
    periodLabel.includes("deductions") ||
    periodLabel.includes("(PMT-06)") ||
    periodLabel.startsWith("Q") ||
    periodLabel.startsWith("FY ") ||
    periodLabel.startsWith("Advance tax") ||
    periodLabel.startsWith("AY ");
  if (hasContext) return periodLabel;
  return t("statutory.display.periodLine", { period: periodLabel });
}

/** User-facing due line, e.g. "Due: 11 Jun 2026". */
export function formatStatutoryDueLine(
  dueDateMs: number,
  formatDate: (ms: number) => string,
  t: (k: string, v?: Record<string, string>) => string
): string {
  return t("statutory.display.dueLine", { date: formatDate(dueDateMs) });
}

/** Card subtitle: title context + period + due. */
export function formatStatutoryDueSubtitle(
  title: string,
  periodLabel: string,
  dueDateMs: number,
  formatDate: (ms: number) => string,
  t: (k: string, v?: Record<string, string>) => string
): string {
  const period = formatStatutoryPeriodLine(
    periodLabel.includes("period") || periodLabel.includes("deductions") || periodLabel.startsWith("Q")
      ? periodLabel
      : `${periodLabel} period`,
    t
  );
  const due = formatStatutoryDueLine(dueDateMs, formatDate, t);
  return `${title} — ${period.replace(/^Period:\s*/i, "")}\n${due}`;
}
