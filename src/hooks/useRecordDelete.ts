import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";

import { useAppFeedback } from "@/feedback/AppFeedback";
import { useT } from "@/i18n";
import { userFacingMessage } from "@/domain/errors";
import { deleteUserContent } from "@/services/records/userContentDelete";
import { useAuth } from "@/state/auth";
import type {
  UserDeleteConfirmTier,
  UserDeleteRequest,
} from "@/services/records/userContentDeleteTypes";

function confirmCopy(
  tier: UserDeleteConfirmTier,
  t: (k: string) => string
): { title: string; body: string } {
  if (tier === "draft") {
    return {
      title: t("swipeDelete.confirm.draftTitle"),
      body: t("swipeDelete.confirm.draftBody"),
    };
  }
  return {
    title: t("swipeDelete.confirm.recordTitle"),
    body: `${t("swipeDelete.confirm.recordBody")}\n\n${t("swipeDelete.confirm.recordSharedPdf")}`,
  };
}

function pendingKey(req: UserDeleteRequest): string {
  return `${req.entityType}:${req.recordId}`;
}

export function useRecordDelete(userId: string | null) {
  const t = useT();
  const { user } = useAuth();
  const feedback = useAppFeedback();
  const pendingRef = useRef<Set<string>>(new Set());
  const [, bump] = useState(0);

  const isDeleting = useCallback((req: UserDeleteRequest) => {
    return pendingRef.current.has(pendingKey(req));
  }, []);

  const requestDelete = useCallback(
    (request: UserDeleteRequest, onSuccess?: () => void | Promise<void>) => {
      if (!userId) return;
      const key = pendingKey(request);
      if (pendingRef.current.has(key)) return;

      const tier = request.confirmTier ?? (request.entityType === "form_draft" ? "draft" : "record");
      const { title, body } = confirmCopy(tier, t);

      Alert.alert(title, body, [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              pendingRef.current.add(key);
              bump((n) => n + 1);
              try {
                const result = await deleteUserContent(userId, request, user?.ueid ?? "");
                const msg = result.syncPending
                  ? t("swipeDelete.deletedSyncPending")
                  : t("swipeDelete.deleted");
                feedback.showSuccess(msg);
                await onSuccess?.();
              } catch (e) {
                feedback.showError(userFacingMessage(e) || t("errors.deleteFailed"));
              } finally {
                pendingRef.current.delete(key);
                bump((n) => n + 1);
              }
            })();
          },
        },
      ]);
    },
    [userId, user?.ueid, t, feedback]
  );

  return { requestDelete, isDeleting };
}
