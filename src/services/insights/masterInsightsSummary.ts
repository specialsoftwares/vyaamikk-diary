import { computeCreditSummary, isReceivable } from "@/domain/customerCredit";
import type { MovementDistanceRecord } from "@/domain/movementInsight";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import { countUserDiaryRecords } from "@/services/dashboard/diaryRecordCounts";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";
import { getCustomerCreditRepository } from "@/services/customerCredit";
import { masterDataRepository } from "@/services/masterData";
import { listMovementDistances, totalApproxDistanceKm } from "@/services/insights/movementInsightRepository";

export interface RouteFrequency {
  routeLabel: string;
  count: number;
  approxDistanceKm: number | null;
}

export interface MasterInsightsSummary {
  recordsCount: number;
  pdfsGeneratedCount: number;
  activeDraftsCount: number;
  mapPinsCount: number;
  creditRecordsCount: number;
  activeEmiCount: number;
  pendingBalanceTotal: number;
  totalApproxDistanceKm: number;
  topRoutes: RouteFrequency[];
  topLocations: Array<{ label: string; count: number }>;
  frequentParties: Array<{ label: string; count: number }>;
  frequentTransporters: Array<{ label: string; count: number }>;
}

function topRoutes(movements: MovementDistanceRecord[], limit: number): RouteFrequency[] {
  const map = new Map<string, RouteFrequency>();
  for (const m of movements) {
    const key = m.routeLabel ?? `${m.fromPin} → ${m.toPin}`;
    const prev = map.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      map.set(key, {
        routeLabel: key,
        count: 1,
        approxDistanceKm: m.approxDistanceKm,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

function topByField(
  suggestions: Array<{ displayValue: string; usageCount: number }>,
  limit: number
) {
  return suggestions
    .slice()
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, limit)
    .map((s) => ({ label: s.displayValue, count: s.usageCount ?? 1 }));
}

let summaryCache: { userId: string; at: number; data: MasterInsightsSummary } | null = null;
const CACHE_MS = 45_000;

export function invalidateMasterInsightsCache(): void {
  summaryCache = null;
}

export async function loadMasterInsightsSummary(
  userId: string,
  ueid: string,
  pdfsGeneratedCount: number
): Promise<MasterInsightsSummary> {
  const now = Date.now();
  if (
    summaryCache &&
    summaryCache.userId === userId &&
    now - summaryCache.at < CACHE_MS
  ) {
    return { ...summaryCache.data, pdfsGeneratedCount };
  }

  const scope = { userId, ueid };
  const [recordsCount, activeDraftsCount, mapPinsCount, movements, creditRecords, parties, transporters, locations] =
    await Promise.all([
      countUserDiaryRecords(userId),
      formDraftsRepository.countActiveUserDrafts(userId),
      localEntriesRepository.countMapPinsForUser(userId),
      listMovementDistances(userId, 800),
      getCustomerCreditRepository()
        .list(userId, { limit: 500 })
        .catch(() => []),
      masterDataRepository.listTopByField(scope, "partyName", 8).catch(() => []),
      masterDataRepository.listTopByField(scope, "transporterName", 5).catch(() => []),
      masterDataRepository.listTopByField(scope, "deliveryLocation", 5).catch(() => []),
    ]);

  const totalKm = await totalApproxDistanceKm(userId);
  let activeEmi = 0;
  let pendingBalance = 0;
  for (const rec of creditRecords) {
    if (rec.deletedAt) continue;
    if (isReceivable(rec)) {
      activeEmi += 1;
      pendingBalance += computeCreditSummary(rec).balance;
    }
  }

  const data: MasterInsightsSummary = {
    recordsCount,
    pdfsGeneratedCount,
    activeDraftsCount,
    mapPinsCount,
    creditRecordsCount: creditRecords.filter((r) => !r.deletedAt).length,
    activeEmiCount: activeEmi,
    pendingBalanceTotal: Math.round(pendingBalance * 100) / 100,
    totalApproxDistanceKm: totalKm,
    topRoutes: topRoutes(movements, 5),
    topLocations: topByField(locations, 5),
    frequentParties: topByField(parties, 5),
    frequentTransporters: topByField(transporters, 5),
  };

  summaryCache = { userId, at: now, data };
  return data;
}
