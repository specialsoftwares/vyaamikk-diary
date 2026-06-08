/**
 * At-a-Glance dashboard view models — MSME business-control lists.
 * UI screens render sections from this service only (no screen-local filtering).
 */

import { startOfDay } from "date-fns";

import type { BusinessEntry } from "@/domain/businessEntry";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import { isReceivable, primaryDueDate } from "@/domain/customerCredit";
import { getDiaryRepository } from "@/services/diary";
import { getLetterheadDocumentRepository } from "@/services/letterhead";
import { getProfessionalPackRepository } from "@/services/professionalPack";
import { getCustomerCreditRepository } from "@/services/customerCredit";

import {
  creditToItem,
  diaryEntryToItem,
  letterheadToItem,
  packToItem,
} from "./atAGlanceItemBuilder";
import type {
  AtAGlanceItem,
  AtAGlanceSection,
  AtAGlanceSourceData,
  AtAGlanceUrgency,
  AtAGlanceViewKind,
  AtAGlanceViewModel,
} from "./atAGlanceTypes";

const ONE_DAY = 86_400_000;
const LIST_LIMIT = 1200;
/** Max rows per section on At-a-Glance detail screens. */
export const AT_A_GLANCE_SECTION_PREVIEW_CAP = 5;

type TFn = (k: string, vars?: Record<string, string | number>) => string;

/** Calendar boundaries for At-a-Glance views (local timezone, startOfDay). */
export interface AtAGlanceBounds {
  now: number;
  todayStart: number;
  todayEnd: number;
  tomorrowStart: number;
  tomorrowEnd: number;
  /** Rolling week: start of day (today − 6), inclusive. */
  weekStart: number;
  upcomingWeekEnd: number;
}

/** Same bounds used for filtering — use for period labels on detail screens. */
export function getAtAGlanceBounds(now = Date.now()): AtAGlanceBounds {
  return computeAtAGlanceBounds(now);
}

function computeAtAGlanceBounds(now = Date.now()): AtAGlanceBounds {
  const todayStart = startOfDay(new Date(now)).getTime();
  return {
    now,
    todayStart,
    todayEnd: todayStart + ONE_DAY,
    tomorrowStart: todayStart + ONE_DAY,
    tomorrowEnd: todayStart + 2 * ONE_DAY,
    weekStart: todayStart - 6 * ONE_DAY,
    upcomingWeekEnd: todayStart + 7 * ONE_DAY,
  };
}

function isToday(ms: number, b: AtAGlanceBounds): boolean {
  return ms >= b.todayStart && ms < b.todayEnd;
}

function isInWeek(ms: number, b: AtAGlanceBounds): boolean {
  return ms >= b.weekStart && ms < b.todayEnd;
}

function urgencyFor(dateMs: number, b: AtAGlanceBounds): AtAGlanceUrgency {
  if (dateMs < b.todayStart) return "overdue";
  if (dateMs < b.todayEnd) return "today";
  if (dateMs < b.tomorrowEnd) return "tomorrow";
  if (dateMs < b.upcomingWeekEnd) return "this_week";
  return "later";
}

const URGENCY_ORDER: AtAGlanceUrgency[] = [
  "overdue",
  "today",
  "tomorrow",
  "this_week",
  "later",
];

function actionableDates(entry: BusinessEntry): number[] {
  const p = entry.payload as unknown as Record<string, unknown>;
  const dates: number[] = [];
  if (entry.reminder?.at) dates.push(entry.reminder.at);

  switch (entry.entryType) {
    case "payment_request":
      if (p.dueDate) dates.push(Number(p.dueDate));
      break;
    case "reminder_gst_return":
      if (p.dueDate) dates.push(Number(p.dueDate));
      break;
    case "reminder_purchase":
      if (p.requiredByDate) dates.push(Number(p.requiredByDate));
      break;
    case "material_dispatched":
      if (p.expectedDeliveryDate) dates.push(Number(p.expectedDeliveryDate));
      break;
    case "business_cash_given":
      if (p.expectedSettlementDate) dates.push(Number(p.expectedSettlementDate));
      if (p.paymentDate) dates.push(Number(p.paymentDate));
      break;
    default:
      break;
  }
  return dates.filter((d) => Number.isFinite(d) && d > 0);
}

function collectEntryDates(entry: BusinessEntry): number[] {
  const dates = actionableDates(entry);
  dates.push(entry.entryDate);
  if (entry.documentHistory?.lastGeneratedAt) {
    dates.push(entry.documentHistory.lastGeneratedAt);
  }
  return dates.filter((d) => Number.isFinite(d) && d > 0);
}

function entryIsPending(entry: BusinessEntry): boolean {
  if (entry.status === "archived") return false;
  if (entry.status === "settled") {
    return Boolean(entry.reminder && entry.reminder.at > Date.now());
  }
  if (entry.entryType === "business_cash_given") {
    const p = entry.payload as { settlementStatus?: string };
    if (p.settlementStatus === "settled" && !entry.reminder) return false;
  }
  return true;
}

function primaryUpcomingDate(entry: BusinessEntry, b: AtAGlanceBounds): number | null {
  if (!entryIsPending(entry)) return null;
  const dates = actionableDates(entry);
  if (dates.length === 0) return null;
  const future = dates.filter((d) => d >= b.todayStart);
  if (future.length) return Math.min(...future);
  const overdue = dates.filter((d) => d < b.todayStart);
  if (overdue.length) return Math.min(...overdue);
  return null;
}

function packUpcomingDate(pack: ProfessionalServicePack, b: AtAGlanceBounds): number | null {
  const dates = [pack.dueDate, pack.reminder?.at, pack.matterDate].filter(
    (d): d is number => d != null && Number.isFinite(d) && d > 0
  );
  if (!dates.length) return null;
  const future = dates.filter((d) => d >= b.todayStart);
  if (future.length) return Math.min(...future);
  const overdue = dates.filter((d) => d < b.todayStart);
  return overdue.length ? Math.min(...overdue) : null;
}

function pushSection(
  sections: AtAGlanceSection[],
  sectionKey: string,
  items: AtAGlanceItem[]
): void {
  if (items.length === 0) return;
  const totalCount = items.length;
  const data =
    totalCount > AT_A_GLANCE_SECTION_PREVIEW_CAP
      ? items.slice(0, AT_A_GLANCE_SECTION_PREVIEW_CAP)
      : items;
  sections.push({ sectionKey, data, totalCount });
}

function sortByDateAsc(items: AtAGlanceItem[]): AtAGlanceItem[] {
  return [...items].sort((a, b) => a.dateMs - b.dateMs);
}

function sortByDateDesc(items: AtAGlanceItem[]): AtAGlanceItem[] {
  return [...items].sort((a, b) => b.dateMs - a.dateMs);
}

// ——— Today ———

type TodayBucket =
  | "dueToday"
  | "followupsToday"
  | "dispatchFreight"
  | "payments"
  | "staffWork"
  | "materials"
  | "gstCompliance"
  | "documents"
  | "createdToday";

function classifyTodayEntry(entry: BusinessEntry, b: AtAGlanceBounds): TodayBucket | null {
  const p = entry.payload as unknown as Record<string, unknown>;
  const dates = collectEntryDates(entry);

  const dueToday =
    (entry.entryType === "payment_request" && p.dueDate && isToday(Number(p.dueDate), b)) ||
    (entry.entryType === "reminder_gst_return" && p.dueDate && isToday(Number(p.dueDate), b)) ||
    (entry.entryType === "reminder_purchase" &&
      p.requiredByDate &&
      isToday(Number(p.requiredByDate), b)) ||
    (entry.entryType === "material_dispatched" &&
      p.expectedDeliveryDate &&
      isToday(Number(p.expectedDeliveryDate), b)) ||
    (entry.entryType === "business_cash_given" &&
      p.expectedSettlementDate &&
      isToday(Number(p.expectedSettlementDate), b));

  if (dueToday) return "dueToday";

  if (entry.reminder && isToday(entry.reminder.at, b)) return "followupsToday";

  if (
    entry.entryType === "outward_freight_details" ||
    entry.entryType === "material_dispatched"
  ) {
    if (dates.some((d) => isToday(d, b))) return "dispatchFreight";
  }

  if (entry.entryType === "payment_request" && isToday(entry.entryDate, b)) {
    return "payments";
  }

  if (
    (entry.entryType === "staff_matter" || entry.entryType === "work_update_issue") &&
    isToday(entry.entryDate, b)
  ) {
    return "staffWork";
  }

  if (
    (entry.entryType === "material_dispatched" ||
      entry.entryType === "material_received") &&
    isToday(entry.entryDate, b)
  ) {
    return "materials";
  }

  if (entry.entryType === "reminder_gst_return" && dates.some((d) => isToday(d, b))) {
    return "gstCompliance";
  }

  if (
    entry.entryType === "reminder_email" &&
    (isToday(entry.entryDate, b) || (entry.reminder && isToday(entry.reminder.at, b)))
  ) {
    return "gstCompliance";
  }

  if (
    entry.pdfUri ||
    entry.entryType === "letterhead_matter" ||
    entry.documentHistory?.lastGeneratedAt
  ) {
    const gen = entry.documentHistory?.lastGeneratedAt;
    if ((gen && isToday(gen, b)) || isToday(entry.entryDate, b)) return "documents";
  }

  if (isToday(entry.entryDate, b)) return "createdToday";

  return null;
}

function buildTodayView(data: AtAGlanceSourceData, t: TFn, b: AtAGlanceBounds): AtAGlanceViewModel {
  const buckets: Record<TodayBucket, AtAGlanceItem[]> = {
    dueToday: [],
    followupsToday: [],
    dispatchFreight: [],
    payments: [],
    staffWork: [],
    materials: [],
    gstCompliance: [],
    documents: [],
    createdToday: [],
  };
  const used = new Set<string>();

  for (const entry of data.entries) {
    if (entry.deletedAt) continue;
    const bucket = classifyTodayEntry(entry, b);
    if (!bucket || used.has(entry.id)) continue;
    used.add(entry.id);
    const dateMs =
      bucket === "dueToday"
        ? collectEntryDates(entry).find((d) => isToday(d, b)) ?? entry.entryDate
        : bucket === "followupsToday"
          ? entry.reminder!.at
          : entry.entryDate;
    buckets[bucket].push(diaryEntryToItem(entry, t, dateMs));
  }

  for (const doc of data.letterheadDocs) {
    if (isToday(doc.input.date, b) || isToday(doc.updatedAt, b)) {
      buckets.documents.push(letterheadToItem(doc, t, doc.input.date));
    }
  }

  for (const pack of data.packs) {
    const at = pack.reminder?.at ?? pack.dueDate;
    if (at && isToday(at, b)) {
      buckets.followupsToday.push(packToItem(pack, t, at));
    } else if (pack.dueDate && isToday(pack.dueDate, b)) {
      buckets.dueToday.push(packToItem(pack, t, pack.dueDate));
    }
  }

  for (const record of data.creditRecords) {
    const due = primaryDueDate(record, b.now);
    if (due != null && isToday(due, b)) {
      buckets.dueToday.push(creditToItem(record, t, due));
    }
  }

  const order: TodayBucket[] = [
    "dueToday",
    "followupsToday",
    "dispatchFreight",
    "payments",
    "staffWork",
    "materials",
    "gstCompliance",
    "documents",
    "createdToday",
  ];

  const sections: AtAGlanceSection[] = [];
  for (const key of order) {
    pushSection(sections, key, sortByDateAsc(buckets[key]));
  }

  const totalItems = sections.reduce((n, s) => n + s.data.length, 0);
  return { view: "today", sections, totalItems, isEmpty: totalItems === 0 };
}

// ——— This week ———

export interface AtAGlanceWeekRangeFilter {
  startMs: number;
  endExclusiveMs: number;
}

function buildThisWeekView(
  data: AtAGlanceSourceData,
  t: TFn,
  b: AtAGlanceBounds,
  rangeFilter?: AtAGlanceWeekRangeFilter
): AtAGlanceViewModel {
  const rangeStart = rangeFilter?.startMs ?? b.weekStart;
  const rangeEndExclusive = rangeFilter?.endExclusiveMs ?? b.todayEnd;

  const buckets: Record<string, AtAGlanceItem[]> = {
    pendingFollowups: [],
    payments: [],
    freight: [],
    purchasesMaterials: [],
    staffWork: [],
    gstEmail: [],
    letterheadDocuments: [],
  };

  const weekUsed = new Set<string>();

  const inWeekSpan = (ms: number) => ms >= rangeStart && ms < rangeEndExclusive;

  for (const entry of data.entries) {
    if (entry.deletedAt) continue;
    const dates = collectEntryDates(entry);
    const relevant =
      inWeekSpan(entry.entryDate) || dates.some((d) => inWeekSpan(d));
    if (!relevant) continue;

    const primaryDate =
      entry.reminder?.at ??
      dates.filter((d) => inWeekSpan(d)).sort((a, c) => a - c)[0] ??
      entry.entryDate;

    const item = diaryEntryToItem(entry, t, primaryDate);
    if (weekUsed.has(entry.id)) continue;

    if (entry.reminder && inWeekSpan(entry.reminder.at) && entry.reminder.at >= b.now) {
      weekUsed.add(entry.id);
      buckets.pendingFollowups.push(item);
      continue;
    }

    weekUsed.add(entry.id);
    switch (entry.entryType) {
      case "payment_request":
        buckets.payments.push(item);
        break;
      case "outward_freight_details":
      case "material_dispatched":
        buckets.freight.push(item);
        break;
      case "material_received":
      case "reminder_purchase":
        buckets.purchasesMaterials.push(item);
        break;
      case "staff_matter":
      case "work_update_issue":
        buckets.staffWork.push(item);
        break;
      case "reminder_gst_return":
      case "reminder_email":
        buckets.gstEmail.push(item);
        break;
      case "letterhead_matter":
        buckets.letterheadDocuments.push(item);
        break;
      default:
        if (entry.pdfUri || entry.documentHistory?.lastGeneratedAt) {
          buckets.letterheadDocuments.push(item);
        } else {
          buckets.staffWork.push(item);
        }
    }
  }

  for (const doc of data.letterheadDocs) {
    if (inWeekSpan(doc.input.date) || inWeekSpan(doc.updatedAt)) {
      buckets.letterheadDocuments.push(letterheadToItem(doc, t, doc.input.date));
    }
  }

  for (const pack of data.packs) {
    const at = pack.reminder?.at ?? pack.dueDate ?? pack.matterDate;
    if (!inWeekSpan(at)) continue;
    const item = packToItem(pack, t, at);
    if (pack.reminder && pack.reminder.at >= b.now) {
      buckets.pendingFollowups.push(item);
    } else if (pack.dueDate) {
      buckets.payments.push(item);
    } else {
      buckets.staffWork.push(item);
    }
  }

  const order = [
    "pendingFollowups",
    "payments",
    "freight",
    "purchasesMaterials",
    "staffWork",
    "gstEmail",
    "letterheadDocuments",
  ];
  const sections: AtAGlanceSection[] = [];
  for (const key of order) {
    pushSection(sections, key, sortByDateDesc(buckets[key] ?? []));
  }

  const totalItems = sections.reduce((n, s) => n + s.data.length, 0);
  return { view: "this_week", sections, totalItems, isEmpty: totalItems === 0 };
}

// ——— Upcoming ———

function buildUpcomingView(data: AtAGlanceSourceData, t: TFn, b: AtAGlanceBounds): AtAGlanceViewModel {
  const byUrgency: Record<AtAGlanceUrgency, AtAGlanceItem[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    this_week: [],
    later: [],
  };
  const seen = new Set<string>();

  const add = (item: AtAGlanceItem, dateMs: number) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    const urgency = urgencyFor(dateMs, b);
    byUrgency[urgency].push({ ...item, dateMs, urgency });
  };

  for (const entry of data.entries) {
    if (entry.deletedAt) continue;
    const dateMs = primaryUpcomingDate(entry, b);
    if (dateMs == null) continue;
    if (dateMs < b.todayStart && !entryIsPending(entry)) continue;
    if (dateMs >= b.todayStart && entry.status === "settled" && !entry.reminder) continue;
    const chip =
      dateMs < b.todayStart ? "atAGlance.chip.overdue" : undefined;
    add(
      diaryEntryToItem(entry, t, dateMs, {
        urgency: urgencyFor(dateMs, b),
        statusChipKey: chip,
      }),
      dateMs
    );
  }

  for (const pack of data.packs) {
    const dateMs = packUpcomingDate(pack, b);
    if (dateMs == null) continue;
    add(packToItem(pack, t, dateMs), dateMs);
  }

  for (const record of data.creditRecords) {
    const dateMs = primaryDueDate(record, b.now);
    if (dateMs == null) continue;
    const chip = dateMs < b.todayStart ? "atAGlance.chip.overdue" : undefined;
    add(creditToItem(record, t, dateMs, { statusChipKey: chip }), dateMs);
  }

  const sections: AtAGlanceSection[] = [];
  for (const u of URGENCY_ORDER) {
    pushSection(sections, u, sortByDateAsc(byUrgency[u]));
  }

  const totalItems = sections.reduce((n, s) => n + s.data.length, 0);
  return { view: "upcoming", sections, totalItems, isEmpty: totalItems === 0 };
}

export async function loadAtAGlanceSourceData(userId: string): Promise<AtAGlanceSourceData> {
  const [entries, letterheadDocs, packs, creditRecords] = await Promise.all([
    getDiaryRepository().list(userId, { includeDeleted: false, limit: LIST_LIMIT }),
    getLetterheadDocumentRepository().list(userId),
    getProfessionalPackRepository().list(userId, { includeDeleted: false, limit: 500 }),
    getCustomerCreditRepository()
      .list(userId, { limit: 500 })
      .catch(() => []),
  ]);
  return {
    entries: entries.filter((e) => !e.deletedAt),
    letterheadDocs,
    packs: packs.filter((p) => !p.deletedAt),
    creditRecords: creditRecords.filter((r) => !r.deletedAt && isReceivable(r)),
  };
}

export function buildAtAGlanceView(
  view: AtAGlanceViewKind,
  data: AtAGlanceSourceData,
  t: TFn,
  now = Date.now(),
  weekRangeFilter?: AtAGlanceWeekRangeFilter
): AtAGlanceViewModel {
  const bounds = computeAtAGlanceBounds(now);
  switch (view) {
    case "today":
      return buildTodayView(data, t, bounds);
    case "this_week":
      return buildThisWeekView(data, t, bounds, weekRangeFilter);
    case "upcoming":
      return buildUpcomingView(data, t, bounds);
  }
}
