import { useCallback, useEffect, useState } from "react";
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
import { useT } from "@/i18n";

export function useBusinessInsightsDashboard(
  userId: string | null | undefined,
  ueid: string | null | undefined,
  selectedFy?: number
) {
  const t = useT();
  const [data, setData] = useState<BusinessInsightsDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId || !ueid) {
      setLoading(false);
      return;
    }
    setLoading(true);
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
      setData(next);
      scheduleInsightRebuild(userId, ueid);
    } finally {
      setLoading(false);
    }
  }, [userId, ueid, selectedFy, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, reload: load };
}
