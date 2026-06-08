/**
 * Generates statutory due dates from registry rules (compliance period → due date).
 * Update registry/GST_DEADLINE_RULES when government notifications change dates.
 */

import { addMonths, endOfMonth, startOfDay, startOfMonth } from "date-fns";

import type { StatutoryInfoTemplate, StatutoryReminderOffset } from "@/domain/statutoryInfo";
import { STATUTORY_REMINDER_OFFSETS } from "@/domain/statutoryInfo";
import { dayKey } from "@/utils/date";
import {
  type CompliancePeriodVariant,
  formatCompliancePeriodLabel,
  formatQuarterPeriodLabel,
  indiaFinancialYearLabel,
  indiaFinancialYearStartYear,
} from "./statutoryCompliancePeriod";
import { getEnabledStatutoryTemplates } from "./statutoryInfoRegistry";

export interface GeneratedStatutoryDue {
  templateId: string;
  dueDateMs: number;
  dueDateKey: string;
  /** Compliance / return period label (e.g. "May 2026", "Q1 FY 2026-27"). */
  periodLabel: string;
}

const HORIZON_MONTHS = 8;
/** Include recent past due dates still in the active filing cycle. */
const PAST_DUE_LOOKBACK_MONTHS = 2;

function filterDueHorizon(out: GeneratedStatutoryDue[], reference: Date): GeneratedStatutoryDue[] {
  const minMs = startOfMonth(addMonths(reference, -PAST_DUE_LOOKBACK_MONTHS)).getTime();
  const maxMs = endOfMonth(addMonths(reference, HORIZON_MONTHS)).getTime();
  return out.filter((d) => d.dueDateMs >= minMs && d.dueDateMs <= maxMs);
}

function noonMs(y: number, m: number, d: number): number {
  const dt = new Date(y, m, d, 12, 0, 0, 0);
  return dt.getTime();
}

function clampDay(y: number, m: number, day: number): number {
  const last = new Date(y, m + 1, 0).getDate();
  return Math.min(day, last);
}

function pushDue(
  out: GeneratedStatutoryDue[],
  templateId: string,
  y: number,
  m: number,
  d: number,
  periodLabel: string
): void {
  const day = clampDay(y, m, d);
  const ms = noonMs(y, m, day);
  out.push({
    templateId,
    dueDateMs: ms,
    dueDateKey: dayKey(ms),
    periodLabel,
  });
}

/**
 * Monthly items: due in calendar month M is for the preceding month's return period.
 * Includes offset −1 so the current month's deadlines (e.g. 11 Jun for May GSTR-1) are generated.
 */
export function generateMonthlyDueOccurrences(
  templateId: string,
  dueDayOfMonth: number,
  reference: Date,
  periodVariant: CompliancePeriodVariant = "monthly"
): GeneratedStatutoryDue[] {
  const out: GeneratedStatutoryDue[] = [];
  const refMonth = startOfMonth(reference);
  const horizonEnd = endOfMonth(addMonths(reference, HORIZON_MONTHS));

  for (let offset = -1; offset <= HORIZON_MONTHS + 1; offset++) {
    const dueMonth = addMonths(refMonth, offset);
    if (dueMonth > horizonEnd) break;

    const periodMonth = addMonths(dueMonth, -1);
    const periodLabel = formatCompliancePeriodLabel(periodMonth, periodVariant);
    pushDue(
      out,
      templateId,
      dueMonth.getFullYear(),
      dueMonth.getMonth(),
      dueDayOfMonth,
      periodLabel
    );
  }
  return filterDueHorizon(out, reference);
}

/** TDS deposit: preceding month deductions; March → due 30 April. */
function generateTdsMonthlyDeposits(templateId: string, reference: Date): GeneratedStatutoryDue[] {
  const out: GeneratedStatutoryDue[] = [];
  const refMonth = startOfMonth(reference);
  const horizonEnd = endOfMonth(addMonths(reference, HORIZON_MONTHS));

  for (let offset = -1; offset <= HORIZON_MONTHS + 1; offset++) {
    const dueMonth = addMonths(refMonth, offset);
    if (dueMonth > horizonEnd) break;
    const periodMonth = addMonths(dueMonth, -1);

    if (periodMonth.getMonth() === 2) {
      const periodLabel = formatCompliancePeriodLabel(periodMonth, "tds_deductions");
      pushDue(out, templateId, dueMonth.getFullYear(), 3, 30, periodLabel);
    } else {
      const periodLabel = formatCompliancePeriodLabel(periodMonth, "tds_deductions");
      pushDue(
        out,
        templateId,
        dueMonth.getFullYear(),
        dueMonth.getMonth(),
        7,
        periodLabel
      );
    }
  }
  return filterDueHorizon(out, reference);
}

function generateForTemplate(
  template: StatutoryInfoTemplate,
  ref: Date
): GeneratedStatutoryDue[] {
  if (!template.promptEnabled || template.dueRule.kind === "reference_only") {
    return [];
  }

  const rule = template.dueRule;
  const out: GeneratedStatutoryDue[] = [];
  const y = ref.getFullYear();
  const horizonEnd = endOfMonth(addMonths(ref, HORIZON_MONTHS));

  switch (rule.kind) {
    case "monthly_day_next_month":
      return generateMonthlyDueOccurrences(template.id, rule.day ?? 11, ref, "monthly");

    case "qrmp_pmt06_monthly":
      return generateMonthlyDueOccurrences(template.id, rule.day ?? 25, ref, "qrmp_pmt06");

    case "quarterly_day_after_quarter": {
      const day = rule.day ?? 13;
      const ends = rule.quarterEnds ?? [3, 6, 9, 12];
      for (let yr = y - 1; yr <= y + 1; yr++) {
        for (const endMonth of ends) {
          const quarterEnd = new Date(yr, endMonth - 1, 1);
          const dueMonthIndex = endMonth === 12 ? 0 : endMonth;
          const dueYear = endMonth === 12 ? yr + 1 : yr;
          const periodLabel = formatQuarterPeriodLabel(endOfMonth(quarterEnd));
          pushDue(out, template.id, dueYear, dueMonthIndex, day, periodLabel);
        }
      }
      break;
    }
    case "annual_calendar": {
      const month = (rule.month ?? 7) - 1;
      const day = rule.day ?? 31;
      for (let yr = y; yr <= y + 1; yr++) {
        const periodLabel = indiaFinancialYearLabel(yr - 1);
        pushDue(out, template.id, yr, month, day, periodLabel);
      }
      break;
    }
    case "annual_after_fy": {
      const fyStart = indiaFinancialYearStartYear(ref);
      const month = (rule.month ?? 4) - 1;
      const day = rule.day ?? 30;
      for (let f = 0; f <= 2; f++) {
        const endY = fyStart + f + 1;
        pushDue(
          out,
          template.id,
          endY,
          month,
          day,
          indiaFinancialYearLabel(fyStart + f)
        );
      }
      break;
    }
    case "advance_tax_instalment": {
      const instMonth = rule.instalmentMonth ?? 6;
      const day = rule.day ?? 15;
      for (let yr = y; yr <= y + 1; yr++) {
        const dueAnchor = new Date(yr, instMonth - 1, day);
        pushDue(
          out,
          template.id,
          yr,
          instMonth - 1,
          day,
          formatCompliancePeriodLabel(dueAnchor, "advance_instalment")
        );
      }
      break;
    }
    case "tds_monthly_deposit":
      return generateTdsMonthlyDeposits(template.id, ref);

    case "tds_quarterly_return": {
      const day = rule.day ?? 31;
      const dueMonth = (rule.month ?? 7) - 1;
      const quarterEndMonth = rule.quarterEnds?.[0] ?? 6;
      const configs: { endMonth: number; dueMonth: number; q: number }[] = [
        { endMonth: 6, dueMonth: 6, q: 1 },
        { endMonth: 9, dueMonth: 9, q: 2 },
        { endMonth: 12, dueMonth: 0, q: 3 },
        { endMonth: 3, dueMonth: 4, q: 4 },
      ];
      for (let yr = y; yr <= y + 1; yr++) {
        for (const c of configs) {
          const quarterEnd = endOfMonth(new Date(yr, c.endMonth - 1, 1));
          const periodLabel = formatQuarterPeriodLabel(quarterEnd);
          const dueY = c.endMonth === 12 ? yr + 1 : yr;
          pushDue(out, template.id, dueY, c.dueMonth, day, periodLabel);
        }
      }
      break;
    }
    default:
      break;
  }

  return filterDueHorizon(out, ref);
}

export function generateAllStatutoryDues(reference: Date = new Date()): GeneratedStatutoryDue[] {
  const all: GeneratedStatutoryDue[] = [];
  for (const t of getEnabledStatutoryTemplates()) {
    all.push(...generateForTemplate(t, reference));
  }
  const byKey = new Map<string, GeneratedStatutoryDue>();
  for (const d of all) {
    const k = `${d.templateId}:${d.dueDateKey}`;
    if (!byKey.has(k)) byKey.set(k, d);
  }
  return [...byKey.values()].sort((a, b) => a.dueDateMs - b.dueDateMs);
}

export function daysUntilDue(dueDateMs: number, reference: Date = new Date()): number {
  const due = startOfDay(new Date(dueDateMs)).getTime();
  const today = startOfDay(reference).getTime();
  return Math.round((due - today) / 86400000);
}

export function reminderOffsetForToday(
  dueDateMs: number,
  reference: Date = new Date()
): StatutoryReminderOffset | null {
  const left = daysUntilDue(dueDateMs, reference);
  if (STATUTORY_REMINDER_OFFSETS.includes(left as StatutoryReminderOffset)) {
    return left as StatutoryReminderOffset;
  }
  return null;
}

export function occurrenceId(
  templateId: string,
  dueDateKey: string,
  offset: StatutoryReminderOffset
): string {
  return `${templateId}_${dueDateKey}_${offset}`;
}

export function isDueWithinReminderWindow(
  dueDateMs: number,
  reference: Date = new Date()
): boolean {
  const left = daysUntilDue(dueDateMs, reference);
  return left >= 1 && left <= 7;
}

export function snoozeUntilLaterToday(reference: Date = new Date()): number {
  const evening = new Date(reference);
  evening.setHours(18, 0, 0, 0);
  const plusHours = reference.getTime() + 4 * 60 * 60 * 1000;
  return Math.max(evening.getTime(), plusHours);
}
