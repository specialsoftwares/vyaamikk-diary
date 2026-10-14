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
import { maskedInsightData } from "@/services/insights/insightAccountGuard";
import { useSync } from "@/state/sync";
import { createLogger } from "@/utils/logger";
import { useT } from "@/i18n";

const log = createLogger("hooks/businessInsights");

export function useBusinessInsightsDashboard(
  userId: string | null | undefined,
  ueid: string | null | undefined,
  selectedFy?: number
) {
  const t = useT();
  const { status, pendingCount } = useSync();
  const offline = status === "offline";
  const [snapshot, setSnapshot] = useState<{ userId: string; data: BusinessInsightsDashboard } | null>(null);
  const [failure, setFailure] = useState<{ userId: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);
  const data = maskedInsightData(snapshot?.userId, userId, ueid, snapshot?.data ?? null);
  const error = failure && userId && ueid && failure.userId === userId ? failure.message : null;

  const load = useCallback(async () => {
    if (!userId || !ueid) {
      setSnapshot(null);
      setFailure(null);
      setLoading(false);
      return;
    }

    const requestUserId = userId;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setFailure(null);

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
        selectedFy,
        { offline }
      );
      if (requestId !== requestIdRef.current) return;
      setSnapshot({ userId: requestUserId, data: next });
      scheduleInsightRebuild(requestUserId, ueid);
    } catch {
      if (requestId !== requestIdRef.current) return;
      log.warn("dashboard load failed");
      setSnapshot(null);
      setFailure({ userId: requestUserId, message: t("businessInsights.loadError") });
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [userId, ueid, selectedFy, t, offline]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const syncStamp = `${status}:${pendingCount}:${userId ?? ""}`;
  const seenSync = useRef<string | null>(null);
  useEffect(() => {
    if (seenSync.current === null) {
      seenSync.current = syncStamp;
      return;
    }
    if (seenSync.current === syncStamp) return;
    seenSync.current = syncStamp;
    if (!userId || !ueid) return;
    void load();
  }, [syncStamp, userId, ueid, load]);

  const pendingOtherAccount = Boolean(userId && ueid) && snapshot?.userId !== userId && !error;
  return { data, loading: loading || pendingOtherAccount, error, reload: load };
}
