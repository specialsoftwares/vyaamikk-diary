/** Statutory information — informational only; not user diary records. */

export type StatutoryCategory = "GST" | "IncomeTax" | "TDS_TCS" | "LLP";

export type StatutoryReminderOffset = 7 | 5 | 3 | 1;

export type StatutoryOccurrenceStatus = "pending" | "dismissed" | "snoozed" | "read";

export type StatutoryDueRuleKind =
  | "monthly_day_next_month"
  | "quarterly_day_after_quarter"
  | "annual_calendar"
  | "annual_after_fy"
  | "advance_tax_instalment"
  | "tds_monthly_deposit"
  | "tds_quarterly_return"
  | "qrmp_pmt06_monthly"
  | "reference_only";

export interface StatutoryDueRule {
  kind: StatutoryDueRuleKind;
  /** Day of month (1–31). */
  day?: number;
  /** For annual_calendar / TDS quarterly: calendar month (1–12). */
  month?: number;
  /** Quarter end months (3, 6, 9, 12) for quarterly rules. */
  quarterEnds?: number[];
  /** Instalment month (6, 9, 12, 3) for advance tax. */
  instalmentMonth?: number;
}

export interface StatutoryInfoTemplate {
  id: string;
  category: StatutoryCategory;
  titleKey: string;
  applicabilityKey: string;
  bodyKey: string;
  cautionKey: string;
  dueRule: StatutoryDueRule;
  /** Optional penalty/interest note keys shown on the card. */
  penaltyNoteKeys?: string[];
  sourceNoteKey?: string;
  enabled: boolean;
  priority: number;
  /** No prompts — tab/reference only. */
  promptEnabled: boolean;
  /** Shown only as footer on parent template cards. */
  attachedToTemplateId?: string;
}

export interface StatutoryInfoOccurrence {
  id: string;
  templateId: string;
  dueDateMs: number;
  dueDateKey: string;
  reminderOffsetDays: StatutoryReminderOffset;
  status: StatutoryOccurrenceStatus;
  dismissedAt: number | null;
  snoozedUntil: number | null;
  shownAt: number | null;
}

export interface StatutoryPromptCard {
  occurrenceId: string;
  templateId: string;
  category: StatutoryCategory;
  title: string;
  applicability: string;
  body: string;
  caution: string;
  penaltyNotes: string[];
  dueDateMs: number;
  daysLeft: number;
  reminderOffsetDays: StatutoryReminderOffset;
  periodLabel: string;
  periodLine: string;
  dueLine: string;
}

export const STATUTORY_REMINDER_OFFSETS: StatutoryReminderOffset[] = [7, 5, 3, 1];

export const STATUTORY_DISCLAIMER_KEY = "statutory.disclaimer";
