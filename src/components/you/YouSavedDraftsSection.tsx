import React, { memo, useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { ExecutiveStatusChip } from "@/components/executive";
import { SwipeToDeleteRow } from "@/components/records/SwipeToDeleteRow";
import { DashboardPreviewRow } from "@/components/you/DashboardPreviewRow";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import { SmartHeadline } from "@/components/ui";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";
import type { FormDraftRecord } from "@/repositories/formDraftsRepository";
import { buildDraftMetadataLine, buildDraftTitle } from "@/services/drafts/draftTitle";
import { hrefForDraft } from "@/services/drafts/draftRoutes";
import { formatRelative } from "@/utils/date";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

const PREVIEW_LIMIT = 3;

function YouSavedDraftsSectionInner({ userId }: { userId: string }) {
  const t = useT();
  const router = useRouter();
  const [drafts, setDrafts] = useState<FormDraftRecord[]>([]);
  const [total, setTotal] = useState(0);
  const { requestDelete, isDeleting } = useRecordDelete(userId);

  const load = useCallback(async () => {
    const [list, count] = await Promise.all([
      formDraftsRepository.listActiveUserDrafts(userId, { limit: PREVIEW_LIMIT }),
      formDraftsRepository.countActiveUserDrafts(userId),
    ]);
    setDrafts(list);
    setTotal(count);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      sectionLink: { ...typography.captionStrong, color: c.primary },
      list: { gap: spacing.sm },
      chip: {
        alignSelf: "flex-start",
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
        backgroundColor: c.primaryLight,
        marginBottom: 2,
      },
      chipText: { ...typography.captionStrong, color: c.primaryDark, fontSize: 10 },
    })
  );

  if (total === 0) return null;

  const sectionLink = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8}>
      <Text style={styles.sectionLink}>{label}</Text>
    </Pressable>
  );

  return (
    <View>
      <SmartHeadline
        title={t("drafts.dashboardTitle")}
        subtitle={t("drafts.dashboardSub", { count: total })}
        density="dashboard"
        iconName="file-edit-outline"
        accentKey="work"
        rightSlot={sectionLink(t("drafts.viewAll"), () => router.push("/(app)/drafts"))}
      />
      <View style={styles.list}>
        {drafts.map((draft) => {
          const title = buildDraftTitle(draft, t);
          const req = {
            entityType: "form_draft" as const,
            recordId: draft.id,
            title: buildDraftTitle(draft, t),
            confirmTier: "draft" as const,
          };
          return (
            <SwipeToDeleteRow
              key={draft.id}
              rowKey={`ydraft-${draft.id}`}
              recordId={draft.id}
              entityType="form_draft"
              title={req.title}
              onDeletePress={() => requestDelete(req, load)}
              deleteInProgress={isDeleting(req)}
            >
              <DashboardPreviewRow
                title={title}
                meta={t("drafts.edited", { when: formatRelative(draft.updatedAt) })}
                subtitle={buildDraftMetadataLine(draft, t)}
                iconName="file-edit-outline"
                statusChip={<ExecutiveStatusChip kind="draft" />}
                onPress={() => router.push(hrefForDraft(draft))}
              />
            </SwipeToDeleteRow>
          );
        })}
      </View>
    </View>
  );
}

export const YouSavedDraftsSection = memo(YouSavedDraftsSectionInner);
