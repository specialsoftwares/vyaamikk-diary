import { computeCreditSummary, isReceivable, type CustomerCreditRecord } from "@/domain/customerCredit";
import type { PartyInsightMeta, PinInsightMeta, FyRecapSnapshot } from "@/domain/businessInsight";
import type { MovementDistanceRecord } from "@/domain/movementInsight";
import { countUserDiaryRecords } from "@/services/dashboard/diaryRecordCounts";
import { getCustomerCreditRepository } from "@/services/customerCredit";
import { getPurchaseOrderRepository } from "@/services/purchaseOrder";
import { getLetterheadDocumentRepository } from "@/services/letterhead";
import {
  formatFinancialYearLabel,
  getCurrentFinancialYear,
  getFinancialYearForDate,
  getFinancialYearRange,
  startOfMonthMs,
  startOfWeekMs,
  listFinancialYearsFromDates,
} from "@/utils/financialYear";
import { maskMobileForDisplay } from "@/services/masterData/normalize";

import {
  listInsightsByKind,
  listDistinctFinancialYears,
  normalizePartyKey,
  removeShopCustomerPartyPinLinks,
} from "./businessInsightRepository";
import {
  listMovementDistancesForFy,
  totalApproxDistanceKm,
} from "./movementInsightRepository";
import { loadFyRecapSnapshot, scheduleFyRecapPrepare } from "./fyRecapService";

export interface PartyListItem {
  id: string;
  partyName: string;
  pin: string | null;
  locationLabel: string | null;
  recordCount: number;
  lastUsedAt: number;
}

export interface PinListItem {
  id: string;
  pin: string;
  locationLabel: string;
  parties: string[];
  recordCount: number;
  lastUsedAt: number;
}

export interface CustomerListItem {
  id: string;
  customerName: string;
  mobileDisplay: string;
  mobileLast4: string;
  statusLabel: string;
  pendingBalance: number;
  lastActivityAt: number;
  group: "active" | "closed" | "external" | "all";
}

export interface CashPaidSummary {
  fyTotal: number;
  monthTotal: number;
  entryCount: number;
  topRecipients: Array<{ name: string; count: number }>;
}

export interface DistancePeriodSummary {
  weekKm: number;
  monthKm: number;
  fyKm: number;
  allTimeKm: number;
  topRoutes: Array<{ route: string; count: number; km: number | null }>;
  topDestinationPins: Array<{ pin: string; label: string; count: number }>;
}

export interface BusinessInsightsDashboard {
  selectedFy: number;
  fyLabel: string;
  availableFys: number[];
  recordsCount: number;
  pdfsGeneratedCount: number;
  parties: PartyListItem[];
  pins: PinListItem[];
  customers: CustomerListItem[];
  cashPaid: CashPaidSummary;
  distance: DistancePeriodSummary;
  creditActiveCount: number;
  creditClosedCount: number;
  creditPendingBalance: number;
  purchaseOrderCount: number;
  archivedRecaps: FyRecapSnapshot[];
  currentRecap: FyRecapSnapshot | null;
}

function locationFromParty(meta: PartyInsightMeta): string | null {
  if (meta.locality && meta.state) return `${meta.locality}, ${meta.state}`;
  if (meta.state) return meta.state;
  if (meta.locality) return meta.locality;
  return null;
}

function locationFromPin(meta: PinInsightMeta): string {
  if (!meta.resolved) return "Location not resolved";
  const parts = [meta.locality, meta.district, meta.state].filter(Boolean);
  return parts.length ? parts.join(", ") : "Location not resolved";
}

const SHOP_CUSTOMER_SOURCE = "customer_credit";

/** Party insights are for business records only — not shop Credit/EMI customers. */
function isBusinessPartyMeta(meta: PartyInsightMeta): boolean {
  const sources = meta.sources ?? [];
  if (sources.length === 0) return true;
  return sources.some((s) => s !== SHOP_CUSTOMER_SOURCE);
}

function mapParties(rows: ReturnType<typeof listInsightsByKind>): PartyListItem[] {
  return rows
    .filter((r) => isBusinessPartyMeta(r.metadata as PartyInsightMeta))
    .map((r) => {
      const meta = r.metadata as PartyInsightMeta;
      return {
        id: r.id,
        partyName: meta.partyName || r.displayLabel,
        pin: meta.pin,
        locationLabel: locationFromParty(meta),
        recordCount: r.recordCount,
        lastUsedAt: r.lastUsedAt,
      };
    });
}

function mapPins(
  rows: ReturnType<typeof listInsightsByKind>,
  shopCustomerNameKeys: Set<string>
): PinListItem[] {
  return rows.map((r) => {
    const meta = r.metadata as PinInsightMeta;
    const parties = (meta.parties ?? []).filter(
      (name) => !shopCustomerNameKeys.has(normalizePartyKey(name))
    );
    return {
      id: r.id,
      pin: meta.pin || r.displayLabel,
      locationLabel: locationFromPin(meta),
      parties,
      recordCount: r.recordCount,
      lastUsedAt: r.lastUsedAt,
    };
  });
}

function aggregateCash(
  userId: string,
  fy: number
): CashPaidSummary {
  const rows = listInsightsByKind(userId, "cash_paid", fy, 5000);
  const monthStart = startOfMonthMs();
  const { startMs, endMs } = getFinancialYearRange(fy);
  let fyTotal = 0;
  let monthTotal = 0;
  const recipients = new Map<string, number>();

  for (const row of rows) {
    const meta = row.metadata as { amount?: number; givenToName?: string };
    const amount = Number(meta.amount);
    if (!Number.isFinite(amount)) continue;
    if (row.lastUsedAt >= startMs && row.lastUsedAt < endMs) fyTotal += amount;
    if (row.lastUsedAt >= monthStart) monthTotal += amount;
    const name = String(meta.givenToName ?? row.displayLabel).trim();
    if (name) recipients.set(name, (recipients.get(name) ?? 0) + 1);
  }

  const topRecipients = [...recipients.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    fyTotal: Math.round(fyTotal),
    monthTotal: Math.round(monthTotal),
    entryCount: rows.length,
    topRecipients,
  };
}

function topRoutes(movements: MovementDistanceRecord[], limit: number) {
  const map = new Map<string, { count: number; km: number | null }>();
  for (const m of movements) {
    const key = m.routeLabel ?? `${m.fromPin} → ${m.toPin}`;
    const prev = map.get(key);
    if (prev) prev.count += 1;
    else map.set(key, { count: 1, km: m.approxDistanceKm });
  }
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([route, v]) => ({ route, count: v.count, km: v.km }));
}

function topDestinationPins(movements: MovementDistanceRecord[], limit: number) {
  const map = new Map<string, { label: string; count: number }>();
  for (const m of movements) {
    const pin = m.toPin;
    const label = m.toLabel ?? pin;
    const prev = map.get(pin);
    if (prev) prev.count += 1;
    else map.set(pin, { label, count: 1 });
  }
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([pin, v]) => ({ pin, label: v.label, count: v.count }));
}

function mapCustomers(records: CustomerCreditRecord[], fy: number): CustomerListItem[] {
  const { startMs, endMs } = getFinancialYearRange(fy);
  return records
    .filter((r) => !r.deletedAt && r.saleDate >= startMs && r.saleDate < endMs)
    .map((r) => {
      const mobile = r.customerMobile?.replace(/\D/g, "").slice(-10) ?? "";
      const last4 = mobile.slice(-4);
      const summary = computeCreditSummary(r);
      let group: CustomerListItem["group"] = "all";
      if (r.mode === "external_finance") group = "external";
      else if (isReceivable(r)) group = "active";
      else if (r.status === "fully_paid" || r.status === "external_completed") group = "closed";

      return {
        id: r.id,
        customerName: r.customerName,
        mobileDisplay: mobile ? maskMobileForDisplay(mobile) : "—",
        mobileLast4: last4,
        statusLabel: r.status,
        pendingBalance: summary.balance,
        lastActivityAt: r.updatedAt,
        group,
      };
    })
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

export async function loadBusinessInsightsDashboard(
  userId: string,
  ueid: string,
  pdfsGeneratedCount: number,
  selectedFy?: number
): Promise<BusinessInsightsDashboard> {
  const fy = selectedFy ?? getCurrentFinancialYear();
  const { startMs, endMs } = getFinancialYearRange(fy);

  await removeShopCustomerPartyPinLinks(userId);
  const weekStart = startOfWeekMs();
  const monthStart = startOfMonthMs();

  const [
    partyRows,
    pinRows,
    movements,
    weekKm,
    monthKm,
    fyKm,
    allTimeKm,
    creditRecords,
    poList,
    letterheadDocs,
    dbFys,
  ] = await Promise.all([
    Promise.resolve(listInsightsByKind(userId, "party", fy, 80)),
    Promise.resolve(listInsightsByKind(userId, "pin", fy, 80)),
    listMovementDistancesForFy(userId, fy, 800),
    totalApproxDistanceKm(userId, { sinceMs: weekStart }),
    totalApproxDistanceKm(userId, { sinceMs: monthStart }),
    totalApproxDistanceKm(userId, { financialYear: fy }),
    totalApproxDistanceKm(userId),
    getCustomerCreditRepository()
      .list(userId, { limit: 500 })
      .catch(() => []),
    getPurchaseOrderRepository()
      .list(userId, { limit: 500 })
      .catch(() => []),
    getLetterheadDocumentRepository().list(userId).catch(() => []),
    Promise.resolve(listDistinctFinancialYears(userId)),
  ]);

  const recordsInFy = await countUserDiaryRecords(userId, { fyStartYear: fy });

  let creditActive = 0;
  let creditClosed = 0;
  let pendingBalance = 0;
  for (const rec of creditRecords) {
    if (rec.deletedAt) continue;
    if (rec.saleDate < startMs || rec.saleDate >= endMs) continue;
    if (isReceivable(rec)) {
      creditActive += 1;
      pendingBalance += computeCreditSummary(rec).balance;
    } else if (rec.status === "fully_paid" || rec.status === "external_completed") {
      creditClosed += 1;
    }
  }

  const poInFy = poList.filter(
    (p) => !p.deletedAt && p.poDate >= startMs && p.poDate < endMs
  ).length;

  const availableFys = listFinancialYearsFromDates(
    [...dbFys.map((y) => getFinancialYearRange(y).startMs), ...creditRecords.map((c) => c.saleDate)],
    true
  );

  const archivedRecaps: FyRecapSnapshot[] = [];
  for (const closedFy of availableFys.filter((y) => y < getCurrentFinancialYear())) {
    scheduleFyRecapPrepare(userId, ueid, closedFy, {
      parties: listInsightsByKind(userId, "party", closedFy, 80),
      pins: listInsightsByKind(userId, "pin", closedFy, 80),
      movements: await listMovementDistancesForFy(userId, closedFy, 800),
      cashPaid: aggregateCash(userId, closedFy),
      creditRecords,
      poCount: poList.filter(
        (p) => !p.deletedAt && getFinancialYearForDate(p.poDate) === closedFy
      ).length,
      letterheadCount: letterheadDocs.filter((d) => d.pdfUri || d.saved).length,
      pdfsGeneratedCount,
      recordsCount: await countUserDiaryRecords(userId, { fyStartYear: closedFy }),
    });
    const snap = await loadFyRecapSnapshot(userId, closedFy);
    if (snap) archivedRecaps.push(snap);
  }

  return {
    selectedFy: fy,
    fyLabel: formatFinancialYearLabel(fy),
    availableFys,
    recordsCount: recordsInFy,
    pdfsGeneratedCount,
    parties: mapParties(partyRows),
    pins: mapPins(
      pinRows,
      new Set(
        creditRecords
          .filter((r) => !r.deletedAt)
          .map((r) => normalizePartyKey(r.customerName))
      )
    ),
    customers: mapCustomers(creditRecords, fy),
    cashPaid: aggregateCash(userId, fy),
    distance: {
      weekKm,
      monthKm,
      fyKm,
      allTimeKm,
      topRoutes: topRoutes(movements, 5),
      topDestinationPins: topDestinationPins(movements, 5),
    },
    creditActiveCount: creditActive,
    creditClosedCount: creditClosed,
    creditPendingBalance: Math.round(pendingBalance),
    purchaseOrderCount: poInFy,
    archivedRecaps,
    currentRecap: null,
  };
}

