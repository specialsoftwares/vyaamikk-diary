import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";

import {
  loadIdentityCardTrustStats,
  type IdentityCardTrustStats,
} from "@/services/dashboard/identityCardTrustStats";

const EMPTY: IdentityCardTrustStats = {
  recordsCount: 0,
  pdfsGeneratedCount: 0,
  activeDraftsCount: 0,
  mapPinsCount: 0,
  creditRecordsCount: 0,
  activeEmiCount: 0,
  approxDistanceKm: 0,
};

export function useIdentityCardTrustStats(
  userId: string | null | undefined,
  pdfsGeneratedCount: number
): IdentityCardTrustStats {
  const [stats, setStats] = useState<IdentityCardTrustStats>(EMPTY);

  const refresh = useCallback(async () => {
    if (!userId) {
      setStats(EMPTY);
      return;
    }
    try {
      const next = await loadIdentityCardTrustStats(userId, pdfsGeneratedCount);
      setStats(next);
    } catch {
      setStats({ ...EMPTY, pdfsGeneratedCount });
    }
  }, [userId, pdfsGeneratedCount]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return stats;
}
