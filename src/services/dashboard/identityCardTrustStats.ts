import { isReceivable } from "@/domain/customerCredit";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import { countUserDiaryRecords } from "@/services/dashboard/diaryRecordCounts";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";
import { getCustomerCreditRepository } from "@/services/customerCredit";
import { totalApproxDistanceKm } from "@/services/insights/movementInsightRepository";
import { getCurrentFinancialYear } from "@/utils/financialYear";

export interface IdentityCardTrustStats {
  recordsCount: number;
  pdfsGeneratedCount: number;
  activeDraftsCount: number;
  mapPinsCount: number;
  creditRecordsCount: number;
  activeEmiCount: number;
  approxDistanceKm: number;
}

/** Local-only counts for identity card back (no network). */
export async function loadIdentityCardTrustStats(
  userId: string,
  pdfsGeneratedCount: number
): Promise<IdentityCardTrustStats> {
  const [recordsCount, activeDraftsCount, mapPinsCount, approxDistanceKm, creditRecords] =
    await Promise.all([
      countUserDiaryRecords(userId),
      formDraftsRepository.countActiveUserDrafts(userId),
      localEntriesRepository.countMapPinsForUser(userId),
      totalApproxDistanceKm(userId, { financialYear: getCurrentFinancialYear() }),
      getCustomerCreditRepository()
        .list(userId, { limit: 500 })
        .catch(() => []),
    ]);
  let activeEmi = 0;
  let creditCount = 0;
  for (const r of creditRecords) {
    if (r.deletedAt) continue;
    creditCount += 1;
    if (isReceivable(r)) activeEmi += 1;
  }
  return {
    recordsCount,
    pdfsGeneratedCount,
    activeDraftsCount,
    mapPinsCount,
    creditRecordsCount: creditCount,
    activeEmiCount: activeEmi,
    approxDistanceKm,
  };
}
