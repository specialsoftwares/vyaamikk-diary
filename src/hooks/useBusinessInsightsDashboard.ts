import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import {
  loadBusinessInsightsDashboard,
  type BusinessInsightsDashboard,
} from "@/services/insights/businessInsightsDashboard";
import { scheduleInsightRebuild } from "@/services/insights/insightSync";
import {
  buildYouDashboardViewModel,
  YOU_DASHBOARD_ENTRY_LIMIT,
  YOU_LETTERHEAD_SCAN_CAP,
  YOU_PRO_PACK_SCAN_LIMIT,
} from "@/services/dashboard";
import { getDiaryRepository } from "@/services/diary";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";
import { getLetterheadDocumentRepository } from "@/services/letterhead";
import { getProfessionalPackRepository } from "@/services/professionalPack";
import { dedupeDiaryEntries } from "@/services/dashboard/diaryRecordCounts";
import { dedupeProfessionalPacks } from "@/services/professionalPack/dedupe";
import { createLogger } from "@/utils/logger";
import { useT } from "@/i18n";

const log = createLogger("hooks/businessInsights");

export function useBusinessInsightsDashboard(
  userId: string | null | undefined,
  ueid: string | null | undefined,
  selectedFy?: number
) {
  const t = useT();
  const [data, setData] = useState<BusinessInsightsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!userId || !ueid) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const [entries, letterheadDocs, proPacks, draftsCount] = await Promise.all([
        getDiaryRepository()
          .list(userId, { includeDeleted: false, limit: YOU_DASHBOARD_ENTRY_LIMIT })
          .then(dedupeDiaryEntries),
        getLetterheadDocumentRepository()
          .list(userId)
          .then((d) =>
            d
              .filter((doc) => doc.pdfUri || doc.saved)
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, YOU_LETTERHEAD_SCAN_CAP)
          ),
        getProfessionalPackRepository()
          .list(userId, { limit: YOU_PRO_PACK_SCAN_LIMIT })
          .then(dedupeProfessionalPacks)
          .catch(() => []),
        formDraftsRepository.countActiveUserDrafts(userId),
      ]);
      const dash = buildYouDashboardViewModel(entries, letterheadDocs, proPacks, draftsCount, t);
      const next = await loadBusinessInsightsDashboard(
        userId,
        ueid,
        dash.savedPdfTotal,
        selectedFy
      );
      if (requestId !== requestIdRef.current) return;
      setData(next);
      scheduleInsightRebuild(userId, ueid);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      log.warn("dashboard load failed", e);
      setData(null);
      setError(t("businessInsights.loadError"));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [userId, ueid, selectedFy, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return { data, loading, error, reload: load };
}
