/**
 * Calendar & Maps — normalized view models from repositories (no raw storage).
 */

import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import type { LetterheadDocument } from "@/services/letterhead";
import { getDiaryRepository } from "@/services/diary";
import { getLetterheadDocumentRepository } from "@/services/letterhead";
import { getProfessionalPackRepository } from "@/services/professionalPack";
import { buildEntrySnippet, resolveEntryTitle } from "@/services/dashboard/atAGlanceItemBuilder";
import {
  buildFreightDispatchMapIntel,
  freightDispatchLocationSummary,
  freightDispatchSearchableText,
  hasFreightDispatchMapIntel,
} from "./freightDispatchMapIntel";
import {
  buildSearchableLocationText,
  entryMapCoordinates,
  manualLocationTextFromEntry,
} from "@/utils/location/entryLocation";
import { entryTypeLabelKey } from "@/utils/businessEntry/display";
import { dayKey } from "@/utils/date";

import type {
  CalendarDayViewModel,
  CalendarMapCategoryKey,
  CalendarMapRecord,
  CalendarMapSection,
  CalendarMapsSourceData,
  CalendarMarkedDots,
} from "./calendarMapsTypes";

const LIST_LIMIT = 1200;

type TFn = (k: string, vars?: Record<string, string | number>) => string;

function iconForType(type: BusinessEntryType): string {
  switch (type) {
    case "payment_request":
      return "cash-multiple";
    case "outward_freight_details":
      return "truck-outline";
    case "business_cash_given":
      return "wallet-outline";
    case "staff_matter":
      return "account-tie-outline";
    case "work_update_issue":
      return "clipboard-text-outline";
    case "material_dispatched":
      return "package-variant";
    case "material_received":
      return "package-down";
    case "material_return":
      return "swap-horizontal";
    case "reminder_purchase":
    case "reminder_email":
    case "reminder_gst_return":
      return "bell-outline";
    case "letterhead_matter":
      return "file-document-outline";
    default:
      return "book-outline";
  }
}

function categoryForEntry(type: BusinessEntryType): CalendarMapCategoryKey {
  switch (type) {
    case "payment_request":
      return "payments";
    case "outward_freight_details":
    case "material_dispatched":
      return "freight";
    case "material_received":
    case "material_return":
      return "materials";
    case "staff_matter":
      return "staff";
    case "work_update_issue":
    case "business_cash_given":
    case "legacy":
      return "work";
    case "reminder_purchase":
    case "reminder_email":
    case "reminder_gst_return":
      return "reminders";
    case "letterhead_matter":
      return "letterhead";
    default:
      return "work";
  }
}

function entryCalendarDates(entry: BusinessEntry): number[] {
  const p = entry.payload as unknown as Record<string, unknown>;
  const dates = [entry.entryDate];
  if (entry.reminder?.at) dates.push(entry.reminder.at);
  if (entry.entryType === "payment_request" && p.dueDate) dates.push(Number(p.dueDate));
  if (entry.entryType === "reminder_gst_return" && p.dueDate) dates.push(Number(p.dueDate));
  if (entry.entryType === "reminder_purchase" && p.requiredByDate) {
    dates.push(Number(p.requiredByDate));
  }
  if (entry.entryType === "material_dispatched" && p.expectedDeliveryDate) {
    dates.push(Number(p.expectedDeliveryDate));
  }
  if (entry.entryType === "business_cash_given" && p.expectedSettlementDate) {
    dates.push(Number(p.expectedSettlementDate));
  }
  return dates.filter((d) => Number.isFinite(d) && d > 0);
}

function entryToMapRecord(entry: BusinessEntry, t: TFn, dateKey: string, sortMs: number): CalendarMapRecord {
  const cat = categoryForEntry(entry.entryType);
  const coords = entryMapCoordinates(entry.location);
  const gps = entry.location?.gps;
  const dispatchIntel = buildFreightDispatchMapIntel(entry, t);
  const dispatchPlace =
    dispatchIntel && hasFreightDispatchMapIntel(dispatchIntel)
      ? freightDispatchLocationSummary(dispatchIntel)
      : null;
  const baseSearch = buildSearchableLocationText(entry);
  const intelSearch =
    dispatchIntel && hasFreightDispatchMapIntel(dispatchIntel)
      ? freightDispatchSearchableText(entry, dispatchIntel)
      : "";
  return {
    id: `entry-${entry.id}`,
    entityType: "diary_entry",
    title: resolveEntryTitle(entry, t),
    subtitle: buildEntrySnippet(entry, t),
    date: dateKey,
    sortMs,
    categoryKey: cat,
    categoryLabelKey: entryTypeLabelKey(entry.entryType),
    iconName: iconForType(entry.entryType),
    target: { kind: "diary_entry", entryId: entry.id },
    location: coords
      ? {
          latitude: coords.latitude,
          longitude: coords.longitude,
          source: "gps" as const,
          accuracy: gps?.accuracy ?? entry.location?.geo?.accuracy ?? null,
          addressLabel: gps?.addressLabel ?? entry.location?.name ?? null,
          capturedAt: gps?.capturedAt ?? new Date(entry.location!.geo!.capturedAt).toISOString(),
        }
      : null,
    mapFootprintSource: coords ? "gps" : null,
    manualLocationLabel: dispatchPlace ?? manualLocationTextFromEntry(entry),
    searchableLocationText: [baseSearch, intelSearch].filter(Boolean).join(" ").trim() || null,
    entryType: entry.entryType,
    dispatchIntel: hasFreightDispatchMapIntel(dispatchIntel) ? dispatchIntel : null,
  };
}

function packToMapRecord(pack: ProfessionalServicePack, dateKey: string, sortMs: number, t: TFn): CalendarMapRecord {
  return {
    id: `pack-${pack.id}`,
    entityType: "professional_pack",
    title: pack.title?.trim() || t("proPack.title"),
    subtitle: String(pack.facts.matterSummary ?? "").slice(0, 80) || null,
    date: dateKey,
    sortMs,
    categoryKey: "proPacks",
    categoryLabelKey: "globalSearch.categories.professional_pack",
    iconName: "briefcase-outline",
    target: { kind: "professional_pack", packId: pack.id },
    location: null,
    manualLocationLabel: null,
    searchableLocationText: null,
  };
}

function letterheadToMapRecord(doc: LetterheadDocument, dateKey: string): CalendarMapRecord {
  const sub = doc.input.subject?.trim() || doc.input.body.trim().slice(0, 72) || null;
  return {
    id: `lh-${doc.id}`,
    entityType: "letterhead_document",
    title: doc.title?.trim() || doc.input.title,
    subtitle: sub,
    date: dateKey,
    sortMs: doc.input.date,
    categoryKey: "letterhead",
    categoryLabelKey: "composer.types.letterhead_matter",
    iconName: "file-document-outline",
    target: { kind: "letterhead_document", documentId: doc.id },
    location: null,
    manualLocationLabel: doc.input.place?.trim() || null,
    searchableLocationText: [doc.input.place, doc.input.subject].filter(Boolean).join(" ") || null,
  };
}

const SECTION_ORDER: CalendarMapCategoryKey[] = [
  "payments",
  "freight",
  "materials",
  "staff",
  "work",
  "reminders",
  "letterhead",
  "proPacks",
  "statutory",
];

export function mergeStatutoryCalendarMarkers(
  base: Record<string, CalendarMarkedDots>,
  statutoryDateKeys: string[]
): Record<string, CalendarMarkedDots> {
  const out = { ...base };
  for (const key of statutoryDateKeys) {
    const prev = out[key] ?? { entry: false, followUp: false, pack: false, statutory: false };
    out[key] = { ...prev, statutory: true };
  }
  return out;
}

export function statutoryItemsToMapRecords(
  items: import("@/services/statutory").StatutoryTabItem[],
  dateKey: string,
  t: TFn
): CalendarMapRecord[] {
  return items.map((item) => ({
    id: `stat-${item.occurrenceId}`,
    entityType: "statutory_info" as const,
    title: item.title,
    subtitle: t("statutory.calendar.markerSubtitle"),
    date: dateKey,
    sortMs: item.dueDateMs,
    categoryKey: "statutory" as const,
    categoryLabelKey: "statutory.calendar.section",
    iconName: "information-outline",
    target: {
      kind: "statutory_info" as const,
      occurrenceId: item.occurrenceId,
      templateId: item.templateId,
    },
    location: null,
    manualLocationLabel: null,
    searchableLocationText: null,
  }));
}

export async function loadCalendarMapsSourceData(userId: string): Promise<CalendarMapsSourceData> {
  const [entries, letterheadDocs, packs] = await Promise.all([
    getDiaryRepository().list(userId, { includeDeleted: false, limit: LIST_LIMIT }),
    getLetterheadDocumentRepository().list(userId),
    getProfessionalPackRepository().list(userId, { includeDeleted: false, limit: 500 }),
  ]);
  return {
    entries: entries.filter((e) => !e.deletedAt),
    packs: packs.filter((p) => !p.deletedAt),
    letterheadDocs,
  };
}

export function buildMarkedDatesForMonth(
  data: CalendarMapsSourceData
): Record<string, CalendarMarkedDots> {
  const out: Record<string, CalendarMarkedDots> = {};

  const mark = (key: string, field: keyof CalendarMarkedDots) => {
    const prev = out[key] ?? { entry: false, followUp: false, pack: false, statutory: false };
    out[key] = { ...prev, [field]: true };
  };

  for (const e of data.entries) {
    mark(dayKey(e.entryDate), "entry");
    if (e.reminder) mark(dayKey(e.reminder.at), "followUp");
    for (const d of entryCalendarDates(e)) {
      if (d !== e.entryDate && e.reminder?.at !== d) {
        mark(dayKey(d), "entry");
      }
    }
  }
  for (const p of data.packs) {
    const due = p.dueDate ?? p.reminder?.at ?? p.matterDate;
    if (due) mark(dayKey(due), "pack");
  }
  for (const doc of data.letterheadDocs) {
    mark(dayKey(doc.input.date), "entry");
  }
  return out;
}

export function buildCalendarDayView(
  data: CalendarMapsSourceData,
  dateKey: string,
  t: TFn,
  statutoryForDay: import("@/services/statutory").StatutoryTabItem[] = []
): CalendarDayViewModel {
  const buckets: Record<CalendarMapCategoryKey, CalendarMapRecord[]> = {
    payments: [],
    freight: [],
    materials: [],
    staff: [],
    work: [],
    reminders: [],
    letterhead: [],
    proPacks: [],
    statutory: statutoryItemsToMapRecords(statutoryForDay, dateKey, t),
  };
  const seen = new Set<string>();

  for (const entry of data.entries) {
    const dates = entryCalendarDates(entry);
    if (!dates.some((d) => dayKey(d) === dateKey)) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const sortMs = dates.find((d) => dayKey(d) === dateKey) ?? entry.entryDate;
    const rec = entryToMapRecord(entry, t, dateKey, sortMs);
    buckets[rec.categoryKey].push(rec);
  }

  for (const doc of data.letterheadDocs) {
    if (dayKey(doc.input.date) !== dateKey) continue;
    buckets.letterhead.push(letterheadToMapRecord(doc, dateKey));
  }

  for (const pack of data.packs) {
    const dates = [pack.matterDate, pack.dueDate, pack.reminder?.at].filter(
      (d): d is number => d != null && Number.isFinite(d)
    );
    if (!dates.some((d) => dayKey(d) === dateKey)) continue;
    const sortMs = dates.find((d) => dayKey(d) === dateKey) ?? pack.matterDate;
    buckets.proPacks.push(packToMapRecord(pack, dateKey, sortMs, t));
  }

  const sections: CalendarMapSection[] = [];
  for (const key of SECTION_ORDER) {
    const items = buckets[key].sort((a, b) => a.sortMs - b.sortMs);
    if (items.length) sections.push({ categoryKey: key, data: items });
  }

  const totalCount = sections.reduce((n, s) => n + s.data.length, 0);
  return { dateKey, sections, totalCount, isEmpty: totalCount === 0 };
}

/** @deprecated Use `buildMapMarkerRecordsAsync` for GPS + PIN approximate markers. */
export { buildMapMarkerRecordsAsync } from "./mapMarkerRecords";
