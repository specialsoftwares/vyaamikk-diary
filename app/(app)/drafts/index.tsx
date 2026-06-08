import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { DraftListRow } from "@/components/drafts/DraftListRow";
import { SwipeToDeleteRow } from "@/components/records/SwipeToDeleteRow";
import {
  Header,
  LastRefreshedHint,
  Screen,
  EmptyState,
  SkeletonDraftRow,
  SkeletonList,
  SkeletonLoadingPanel,
} from "@/components/ui";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { formDraftsRepository, type FormDraftRecord } from "@/repositories/formDraftsRepository";
import { buildDraftTitle } from "@/services/drafts/draftTitle";
import { hrefForDraft } from "@/services/drafts/draftRoutes";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
import { useSmartBack } from "@/navigation";

type FilterKey = "all" | FormDraftRecord["draftKind"];

export default function DraftsScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<FormDraftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const { goBack } = useSmartBack({ from: "you" });
  const { requestDelete, isDeleting } = useRecordDelete(user?.uid ?? null);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
      chip: {
        paddingVertical: 6,
        paddingHorizontal: spacing.md,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: c.divider,
        backgroundColor: c.surfaceMuted,
      },
      chipOn: { borderColor: c.primary, backgroundColor: c.primaryLight },
      chipText: { ...typography.captionStrong, color: c.text },
      chipTextOn: { color: c.primaryDark },
    })
  );

  const load = useCallback(
    async (mode: "mount" | "refresh" = "mount") => {
      if (!user) return;
      if (mode === "refresh" && hasLoadedOnceRef.current) {
        setRefreshing(true);
      } else if (!hasLoadedOnceRef.current) {
        setLoading(true);
      }
      try {
        const list = await formDraftsRepository.listActiveUserDrafts(user.uid);
        setDrafts(list);
        hasLoadedOnceRef.current = true;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  const { refreshNote, onRefresh, refreshControl } = useAppRefresh({
    onReload: () => load("refresh"),
    externalRefreshing: refreshing,
  });

  useFocusEffect(
    useCallback(() => {
      void load("mount");
    }, [load])
  );

  const filtered = useMemo(() => {
    if (filter === "all") return drafts;
    return drafts.filter((d) => d.draftKind === filter);
  }, [drafts, filter]);

  const filterChips: { key: FilterKey; label: string }[] = [
    { key: "all", label: t("drafts.filterAll") },
    { key: "composer", label: t("drafts.filterRecords") },
    { key: "letterhead", label: t("drafts.filterLetterhead") },
    { key: "professional_pack", label: t("drafts.filterProPack") },
  ];

  return (
    <Screen padded>
      <Header
        variant="executive"
        title={t("drafts.pageTitle")}
        showBack
        backFrom="you"
        onBackPress={goBack}
      />
      <View style={styles.filters}>
        {filterChips.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setFilter(c.key)}
            style={[styles.chip, filter === c.key ? styles.chipOn : null]}
          >
            <Text style={[styles.chipText, filter === c.key ? styles.chipTextOn : null]}>
              {c.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <LastRefreshedHint message={refreshNote} />
      {loading && drafts.length === 0 ? (
        <SkeletonLoadingPanel loading slowMessage={t("skeleton.stillLoading")}>
          <SkeletonList count={7} Item={SkeletonDraftRow} gap={0} />
        </SkeletonLoadingPanel>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={t("executive.inlineEmpty.noDrafts")}
          message={t("drafts.empty")}
          iconName="file-edit-outline"
          accentKey="work"
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={refreshControl}
          renderItem={({ item }) => {
            const req = {
              entityType: "form_draft" as const,
              recordId: item.id,
              title: buildDraftTitle(item, t),
              confirmTier: "draft" as const,
            };
            return (
              <SwipeToDeleteRow
                rowKey={`draft-${item.id}`}
                recordId={item.id}
                entityType="form_draft"
                title={req.title}
                onDeletePress={() => requestDelete(req, load)}
                deleteInProgress={isDeleting(req)}
              >
                <DraftListRow
                  draft={item}
                  onPress={() => router.push(hrefForDraft(item))}
                />
              </SwipeToDeleteRow>
            );
          }}
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
        />
      )}
    </Screen>
  );
}
