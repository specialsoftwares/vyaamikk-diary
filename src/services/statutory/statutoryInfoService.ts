/**
 * Statutory information orchestration — prompts, tab data, calendar markers.
 * In-app only; no PII in logs.
 */

import type {
  StatutoryCategory,
  StatutoryInfoOccurrence,
  StatutoryPromptCard,
  StatutoryReminderOffset,
} from "@/domain/statutoryInfo";
import { STATUTORY_DISCLAIMER_KEY } from "@/domain/statutoryInfo";
type TFn = (key: string, vars?: Record<string, string | number>) => string;
import { statutoryInfoRepository } from "@/repositories/statutoryInfoRepository";
import { formatEntryDate } from "@/utils/date";
import { createLogger } from "@/utils/logger";

import { formatStatutoryDueLine, formatStatutoryPeriodLine } from "./statutoryCompliancePeriod";
import {
  daysUntilDue,
  generateAllStatutoryDues,
  occurrenceId,
  reminderOffsetForToday,
  snoozeUntilLaterToday,
} from "./statutoryDeadlineEngine";
import {
  getAttachedNotes,
  getEnabledStatutoryTemplates,
  getStatutoryTemplate,
} from "./statutoryInfoRegistry";

const log = createLogger("statutory");

export type StatutoryUrgencyGroup = "1" | "3" | "5" | "7" | "later";

export interface StatutoryTabItem {
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
  urgency: StatutoryUrgencyGroup;
  status: StatutoryInfoOccurrence["status"];
  periodLabel: string;
  periodLine: string;
  dueLine: string;
}

export interface StatutoryTabViewModel {
  disclaimer: string;
  upcoming: Record<StatutoryUrgencyGroup, StatutoryTabItem[]>;
  dismissed: StatutoryTabItem[];
  reference: StatutoryTabItem[];
  calendarByDate: Record<string, StatutoryTabItem[]>;
}

function translateTemplate(
  t: TFn,
  templateId: string,
  field: "title" | "applicability" | "body" | "caution",
  keys: { titleKey: string; applicabilityKey: string; bodyKey: string; cautionKey: string }
): string {
  const key = keys[`${field}Key` as keyof typeof keys] ?? keys.titleKey;
  try {
    return t(key);
  } catch {
    return key;
  }
}

function buildCard(
  t: TFn,
  templateId: string,
  dueDateMs: number,
  dueDateKey: string,
  offset: StatutoryReminderOffset,
  periodLabel: string
): StatutoryPromptCard | null {
  const template = getStatutoryTemplate(templateId);
  if (!template) return null;
  const attached = getAttachedNotes(templateId);
  const penaltyKeys = [
    ...(template.penaltyNoteKeys ?? []),
    ...attached.flatMap((a) => a.penaltyNoteKeys ?? [a.bodyKey]),
  ];
  const periodLine = formatStatutoryPeriodLine(periodLabel, t);
  const dueLine = formatStatutoryDueLine(dueDateMs, formatEntryDate, t);
  return {
    occurrenceId: occurrenceId(templateId, dueDateKey, offset),
    templateId,
    category: template.category,
    title: translateTemplate(t, templateId, "title", template),
    applicability: translateTemplate(t, templateId, "applicability", template),
    body: translateTemplate(t, templateId, "body", template),
    caution: translateTemplate(t, templateId, "caution", template),
    penaltyNotes: penaltyKeys.map((k) => {
      try {
        return t(k);
      } catch {
        return "";
      }
    }).filter(Boolean),
    dueDateMs,
    daysLeft: daysUntilDue(dueDateMs),
    reminderOffsetDays: offset,
    periodLabel,
    periodLine,
    dueLine,
  };
}

async function syncOccurrenceState(
  userId: string,
  reference: Date = new Date()
): Promise<void> {
  await statutoryInfoRepository.clearExpiredSnoozes(userId);
  const dues = generateAllStatutoryDues(reference);
  const existing = await statutoryInfoRepository.listForUser(userId);
  const existingMap = new Map(existing.map((e) => [e.id, e]));

  for (const due of dues) {
    for (const offset of [7, 5, 3, 1] as const) {
      const id = occurrenceId(due.templateId, due.dueDateKey, offset);
      const prev = existingMap.get(id);
      await statutoryInfoRepository.upsert({
        id,
        userId,
        templateId: due.templateId,
        dueDateKey: due.dueDateKey,
        dueDateMs: due.dueDateMs,
        reminderOffsetDays: offset,
        status: prev?.status ?? "pending",
        dismissedAt: prev?.dismissedAt ?? null,
        snoozedUntil: prev?.snoozedUntil ?? null,
        shownAt: prev?.shownAt ?? null,
      });
    }
  }
}

export async function getStatutoryPromptCardsForToday(
  userId: string,
  t: TFn,
  reference: Date = new Date()
): Promise<StatutoryPromptCard[]> {
  await syncOccurrenceState(userId, reference);
  const rows = await statutoryInfoRepository.listForUser(userId);
  const now = reference.getTime();
  const cards: StatutoryPromptCard[] = [];

  for (const row of rows) {
    if (row.status === "dismissed") continue;
    if (row.status === "snoozed" && row.snoozedUntil && row.snoozedUntil > now) continue;
    const offsetToday = reminderOffsetForToday(row.dueDateMs, reference);
    if (offsetToday !== row.reminderOffsetDays) continue;

    const template = getStatutoryTemplate(row.templateId);
    if (!template?.promptEnabled) continue;

    const due = generateAllStatutoryDues(reference).find(
      (d) => d.templateId === row.templateId && d.dueDateKey === row.dueDateKey
    );
    const card = buildCard(
      t,
      row.templateId,
      row.dueDateMs,
      row.dueDateKey,
      row.reminderOffsetDays,
      due?.periodLabel ?? row.dueDateKey
    );
    if (card) {
      card.occurrenceId = row.id;
      cards.push(card);
    }
  }

  cards.sort((a, b) => a.daysLeft - b.daysLeft || a.title.localeCompare(b.title));
  log.info("prompt candidates", { count: cards.length });
  return cards;
}

export async function dismissStatutoryPrompt(
  userId: string,
  occurrenceIds: string[]
): Promise<void> {
  await statutoryInfoRepository.markDismissed(userId, occurrenceIds);
}

export async function snoozeStatutoryPrompt(
  userId: string,
  occurrenceIds: string[],
  reference: Date = new Date()
): Promise<void> {
  const until = snoozeUntilLaterToday(reference);
  await statutoryInfoRepository.markSnoozed(userId, occurrenceIds, until);
}

export async function markStatutoryPromptShown(
  userId: string,
  occurrenceIds: string[]
): Promise<void> {
  await statutoryInfoRepository.markShown(userId, occurrenceIds);
}

function urgencyGroup(daysLeft: number): StatutoryUrgencyGroup {
  if (daysLeft <= 1) return "1";
  if (daysLeft <= 3) return "3";
  if (daysLeft <= 5) return "5";
  if (daysLeft <= 7) return "7";
  return "later";
}

export async function buildStatutoryTabViewModel(
  userId: string,
  t: TFn,
  categoryFilter: StatutoryCategory | "all" = "all",
  reference: Date = new Date()
): Promise<StatutoryTabViewModel> {
  await syncOccurrenceState(userId, reference);
  const rows = await statutoryInfoRepository.listForUser(userId);
  const dues = generateAllStatutoryDues(reference);
  const dueMap = new Map(dues.map((d) => [`${d.templateId}:${d.dueDateKey}`, d]));

  const upcoming: Record<StatutoryUrgencyGroup, StatutoryTabItem[]> = {
    "1": [],
    "3": [],
    "5": [],
    "7": [],
    later: [],
  };
  const dismissed: StatutoryTabItem[] = [];
  const calendarByDate: Record<string, StatutoryTabItem[]> = {};

  const pushItem = (row: typeof rows[0], status: StatutoryInfoOccurrence["status"]) => {
    const template = getStatutoryTemplate(row.templateId);
    if (!template) return;
    if (categoryFilter !== "all" && template.category !== categoryFilter) return;
    const due = dueMap.get(`${row.templateId}:${row.dueDateKey}`);
    const daysLeft = daysUntilDue(row.dueDateMs, reference);
    const periodLabel = due?.periodLabel ?? row.dueDateKey;
    const item: StatutoryTabItem = {
      occurrenceId: row.id,
      templateId: row.templateId,
      category: template.category,
      title: translateTemplate(t, row.templateId, "title", template),
      applicability: translateTemplate(t, row.templateId, "applicability", template),
      body: translateTemplate(t, row.templateId, "body", template),
      caution: translateTemplate(t, row.templateId, "caution", template),
      penaltyNotes: (template.penaltyNoteKeys ?? []).map((k) => t(k)),
      dueDateMs: row.dueDateMs,
      daysLeft,
      urgency: urgencyGroup(daysLeft),
      status,
      periodLabel,
      periodLine: formatStatutoryPeriodLine(periodLabel, t),
      dueLine: formatStatutoryDueLine(row.dueDateMs, formatEntryDate, t),
    };
    if (status === "dismissed" || status === "read") {
      dismissed.push(item);
    } else if (daysLeft >= 0 && daysLeft <= 30) {
      upcoming[urgencyGroup(daysLeft)].push(item);
    } else if (daysLeft > 30) {
      upcoming.later.push(item);
    }
    const key = row.dueDateKey;
    calendarByDate[key] = calendarByDate[key] ?? [];
    calendarByDate[key].push(item);
  };

  const seenDue = new Set<string>();
  for (const row of rows) {
    const k = `${row.templateId}:${row.dueDateKey}`;
    if (seenDue.has(k)) continue;
    seenDue.add(k);
    pushItem(row, row.status);
  }

  /** Calendar dots: every generated due date (not only reminder-offset rows). */
  for (const due of dues) {
    const template = getStatutoryTemplate(due.templateId);
    if (!template?.promptEnabled) continue;
    const calKey = due.dueDateKey;
    if ((calendarByDate[calKey] ?? []).some((i) => i.templateId === due.templateId)) continue;
    const row = rows.find(
      (r) => r.templateId === due.templateId && r.dueDateKey === due.dueDateKey
    );
    if (row) pushItem(row, row.status);
  }

  for (const g of Object.keys(upcoming) as StatutoryUrgencyGroup[]) {
    upcoming[g].sort((a, b) => a.dueDateMs - b.dueDateMs);
  }
  dismissed.sort((a, b) => b.dueDateMs - a.dueDateMs);

  const referenceOnly = getEnabledStatutoryTemplates()
    .filter((tm) => !tm.promptEnabled && !tm.attachedToTemplateId)
    .map((tm) => ({
      occurrenceId: `ref_${tm.id}`,
      templateId: tm.id,
      category: tm.category,
      title: t(tm.titleKey),
      applicability: t(tm.applicabilityKey),
      body: t(tm.bodyKey),
      caution: t(tm.cautionKey),
      penaltyNotes: [] as string[],
      dueDateMs: 0,
      daysLeft: 0,
      urgency: "later" as StatutoryUrgencyGroup,
      status: "read" as const,
      periodLabel: "",
      periodLine: "",
      dueLine: "",
    }))
    .filter((i) => categoryFilter === "all" || i.category === categoryFilter);

  return {
    disclaimer: t(STATUTORY_DISCLAIMER_KEY),
    upcoming,
    dismissed,
    reference: referenceOnly,
    calendarByDate,
  };
}

export function statutoryMarkersByDate(
  view: StatutoryTabViewModel
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of Object.keys(view.calendarByDate)) {
    out[key] = view.calendarByDate[key].length > 0;
  }
  return out;
}
