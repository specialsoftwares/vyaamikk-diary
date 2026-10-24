import type { BusinessEntry } from "@/domain/businessEntry";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import { primaryDueDate } from "@/domain/customerCredit";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import { addDays, startOfDay } from "date-fns";

export interface UpcomingBounds {
  nowMs: number;
  todayStart: number;
}

export function upcomingBounds(nowMs: number): UpcomingBounds {
  return { nowMs, todayStart: startOfDay(new Date(nowMs)).getTime() };
}

export function nextCalendarBoundary(nowMs: number): number {
  return addDays(startOfDay(new Date(nowMs)), 1).getTime();
}

export type UpcomingKind = "upcoming" | "overdue" | "excluded";

function entryIsPending(entry: BusinessEntry, nowMs: number): boolean {
  if (entry.deletedAt) return false;
  if (entry.status === "archived") return false;
  if (entry.status === "settled") {
    return Boolean(entry.reminder && entry.reminder.at > nowMs);
  }
  if (entry.entryType === "business_cash_given") {
    const payload = entry.payload as { settlementStatus?: string };
    if (payload.settlementStatus === "settled" && !entry.reminder) return false;
  }
  return true;
}

function actionableDates(entry: BusinessEntry): number[] {
  const payload = entry.payload as unknown as Record<string, unknown>;
  const dates: number[] = [];
  if (entry.reminder?.at) dates.push(entry.reminder.at);
  switch (entry.entryType) {
    case "payment_request":
    case "reminder_gst_return":
      if (payload.dueDate) dates.push(Number(payload.dueDate));
      break;
    case "reminder_purchase":
      if (payload.requiredByDate) dates.push(Number(payload.requiredByDate));
      break;
    case "material_dispatched":
      if (payload.expectedDeliveryDate) dates.push(Number(payload.expectedDeliveryDate));
      break;
    case "business_cash_given":
      if (payload.expectedSettlementDate) dates.push(Number(payload.expectedSettlementDate));
      if (payload.paymentDate) dates.push(Number(payload.paymentDate));
      break;
    default:
      break;
  }
  return dates.filter((value) => Number.isFinite(value) && value > 0);
}

export function classifyDiaryUpcoming(entry: BusinessEntry, nowMs: number): {
  kind: UpcomingKind;
  dateMs: number | null;
} {
  if (!entryIsPending(entry, nowMs)) return { kind: "excluded", dateMs: null };
  const dates = actionableDates(entry);
  if (dates.length === 0) return { kind: "excluded", dateMs: null };
  const todayStart = upcomingBounds(nowMs).todayStart;
  const future = dates.filter((value) => value >= todayStart);
  if (future.length > 0) {
    const dateMs = Math.min(...future);
    if (entry.status === "settled" && !entry.reminder) return { kind: "excluded", dateMs: null };
    return { kind: "upcoming", dateMs };
  }
  const overdue = dates.filter((value) => value < todayStart);
  if (overdue.length > 0) return { kind: "overdue", dateMs: Math.min(...overdue) };
  return { kind: "excluded", dateMs: null };
}

export function classifyPackUpcoming(pack: ProfessionalServicePack, nowMs: number): {
  kind: UpcomingKind;
  dateMs: number | null;
} {
  if (pack.deletedAt) return { kind: "excluded", dateMs: null };
  const dates = [pack.dueDate, pack.reminder?.at, pack.matterDate].filter(
    (value): value is number => value != null && Number.isFinite(value) && value > 0
  );
  if (dates.length === 0) return { kind: "excluded", dateMs: null };
  const todayStart = upcomingBounds(nowMs).todayStart;
  const future = dates.filter((value) => value >= todayStart);
  if (future.length > 0) return { kind: "upcoming", dateMs: Math.min(...future) };
  const overdue = dates.filter((value) => value < todayStart);
  return overdue.length > 0
    ? { kind: "overdue", dateMs: Math.min(...overdue) }
    : { kind: "excluded", dateMs: null };
}

export function classifyCreditUpcoming(record: CustomerCreditRecord, nowMs: number): {
  kind: UpcomingKind;
  dateMs: number | null;
} {
  if (record.deletedAt) return { kind: "excluded", dateMs: null };
  const dateMs = primaryDueDate(record, nowMs);
  if (dateMs == null) return { kind: "excluded", dateMs: null };
  const todayStart = upcomingBounds(nowMs).todayStart;
  return dateMs < todayStart
    ? { kind: "overdue", dateMs }
    : { kind: "upcoming", dateMs };
}

export function countUpcomingRecords(input: {
  entries: BusinessEntry[];
  packs: ProfessionalServicePack[];
  credits?: CustomerCreditRecord[];
  nowMs: number;
}): { upcoming: number; overdue: number } {
  const seen = new Set<string>();
  let upcoming = 0;
  let overdue = 0;
  const add = (id: string, kind: UpcomingKind) => {
    if (kind === "excluded" || seen.has(id)) return;
    seen.add(id);
    if (kind === "upcoming") upcoming += 1;
    if (kind === "overdue") overdue += 1;
  };
  for (const entry of input.entries) {
    add(entry.id, classifyDiaryUpcoming(entry, input.nowMs).kind);
  }
  for (const pack of input.packs) {
    add(`pack:${pack.id}`, classifyPackUpcoming(pack, input.nowMs).kind);
  }
  for (const credit of input.credits ?? []) {
    add(`credit:${credit.id}`, classifyCreditUpcoming(credit, input.nowMs).kind);
  }
  return { upcoming, overdue };
}
