import React, { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { EntryRow } from "@/components/diary/EntryRow";
import { SwipeToDeleteRow } from "@/components/records/SwipeToDeleteRow";
import {
  EmptyState,
  ErrorState,
  Header,
  LastRefreshedHint,
  Pill,
  Screen,
  SkeletonList,
} from "@/components/ui";
import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import { entryMatchesWorkTeamFilter } from "@/domain/workTeam";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { useAuth } from "@/state/auth";
import { useDiaryList } from "@/state/useDiaryList";
import { useT } from "@/i18n";
import { spacing, useThemedStyles } from "@/theme";

type FilterKind = BusinessEntryType | "all";

const FILTER_OPTIONS: FilterKind[] = ["all", "work_update_issue", "staff_matter"];

export default function WorkTeamListScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterKind>("all");

  const styles = useThemedStyles(() =>
    StyleSheet.create({
      headerWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
      filterRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
        marginTop: spacing.md,
        marginBottom: spacing.md,
        paddingHorizontal: spacing.lg,
      },
      listContent: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl,
        gap: spacing.md,
      },
      rowWrap: { marginBottom: 0 },
    })
  );

  const { entries: allEntries, loading, refreshing, error, refresh, reload } = useDiaryList(
    user?.uid ?? null,
    { limit: 500 }
  );

  const entries = useMemo(() => {
    const team = allEntries.filter(entryMatchesWorkTeamFilter);
    if (filter === "all") return team;
    return team.filter((e) => e.entryType === filter);
  }, [allEntries, filter]);

  const { refreshNote, onRefresh } = useAppRefresh({
    onReload: refresh,
    externalRefreshing: refreshing,
  });
  const { requestDelete, isDeleting } = useRecordDelete(user?.uid ?? null);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const openEntry = useCallback(
    (id: string) => router.push({ pathname: "/(app)/diary/[id]", params: { id } }),
    [router]
  );

  const filterLabel = (kind: FilterKind) => {
    if (kind === "all") return t("workTeam.filterAll");
    return t(`composer.types.${kind}`);
  };

  const renderItem = useCallback(
    ({ item }: { item: BusinessEntry }) => {
      const deleteReq = {
        entityType: "diary_entry" as const,
        recordId: item.id,
        title: item.title,
        confirmTier: "record" as const,
      };
      return (
        <View style={styles.rowWrap}>
          <SwipeToDeleteRow
            rowKey={`work-team-${item.id}`}
            recordId={item.id}
            entityType="diary_entry"
            title={item.title}
            onDeletePress={() => requestDelete(deleteReq, reload)}
            deleteInProgress={isDeleting(deleteReq)}
          >
            <EntryRow entry={item} onPress={() => openEntry(item.id)} />
          </SwipeToDeleteRow>
        </View>
      );
    },
    [styles.rowWrap, requestDelete, reload, isDeleting, openEntry]
  );

  return (
    <Screen>
      <View style={styles.headerWrap}>
        <Header title={t("savedRecords.catWorkTeam")} showBack />
        {refreshNote ? <LastRefreshedHint message={refreshNote} /> : null}
        {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      </View>
      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((kind) => (
          <Pill
            key={kind}
            label={filterLabel(kind)}
            active={filter === kind}
            onPress={() => setFilter(kind)}
            accentKey="work"
          />
        ))}
      </View>
      {loading && entries.length === 0 ? (
        <SkeletonList count={4} />
      ) : entries.length === 0 ? (
        <EmptyState title={t("workTeam.emptyTitle")} message={t("workTeam.emptyBody")} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      )}
    </Screen>
  );
}
