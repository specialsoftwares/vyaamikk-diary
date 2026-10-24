import type { BusinessEntry } from "@/domain/businessEntry";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import type { LetterheadDocument } from "@/services/letterhead";
import { dayKey } from "@/utils/date";

import type { CalendarMarkedDots, CalendarMapsSourceData } from "./calendarMapsTypes";

export function entryCalendarDates(entry: BusinessEntry): number[] {
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

export function buildOccurrenceMarks(data: CalendarMapsSourceData): Record<string, CalendarMarkedDots> {
  const out: Record<string, CalendarMarkedDots> = {};
  const mark = (key: string, field: keyof CalendarMarkedDots) => {
    const prev = out[key] ?? { entry: false, followUp: false, pack: false, statutory: false };
    out[key] = { ...prev, [field]: true };
  };

  for (const e of data.entries) {
    mark(dayKey(e.entryDate), "entry");
    if (e.reminder) mark(dayKey(e.reminder.at), "followUp");
    for (const d of entryCalendarDates(e)) {
      const key = dayKey(d);
      if (key === dayKey(e.entryDate)) continue;
      if (e.reminder && key === dayKey(e.reminder.at)) continue;
      mark(key, "followUp");
    }
  }
  for (const p of data.packs) {
    if (p.matterDate) mark(dayKey(p.matterDate), "pack");
    if (p.dueDate) mark(dayKey(p.dueDate), "followUp");
    if (p.reminder?.at) mark(dayKey(p.reminder.at), "followUp");
  }
  for (const doc of data.letterheadDocs) {
    mark(dayKey(doc.input.date), "entry");
  }
  return out;
}

export function fixtureTouchesDay(
  entry: BusinessEntry | null,
  pack: ProfessionalServicePack | null,
  doc: LetterheadDocument | null,
  date: string
): { entry: boolean; pack: boolean; letter: boolean } {
  return {
    entry: entry ? entryCalendarDates(entry).some((value) => dayKey(value) === date) : false,
    pack: pack
      ? [pack.matterDate, pack.dueDate, pack.reminder?.at].some(
          (value) => value != null && dayKey(value) === date
        )
      : false,
    letter: doc ? dayKey(doc.input.date) === date : false,
  };
}
