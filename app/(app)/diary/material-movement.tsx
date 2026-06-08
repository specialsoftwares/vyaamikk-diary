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
import type { BusinessEntry } from "@/domain/businessEntry";
import {
  MATERIAL_MOVEMENT_ENTRY_TYPES,
  type MaterialMovementKind,
  entryMatchesMovementFilter,
  movementKindLabelKey,
} from "@/domain/materialMovement";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { useAuth } from "@/state/auth";
import { useDiaryList } from "@/state/useDiaryList";
import { useT } from "@/i18n";
import { spacing, useThemedStyles } from "@/theme";

type FilterKind = MaterialMovementKind | "all";

const FILTER_OPTIONS: FilterKind[] = ["all", "sent_transport", "received", "return"];

export default function MaterialMovementListScreen() {
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
    const movement = allEntries.filter((e) =>
      (MATERIAL_MOVEMENT_ENTRY_TYPES as readonly string[]).includes(e.entryType)
    );
    if (filter === "all") return movement;
    return movement.filter((e) => entryMatchesMovementFilter(e, { kind: filter }));
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
            rowKey={`movement-${item.id}`}
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
        <Header title={t("savedRecords.catMaterialMovement")} showBack />
        {refreshNote ? <LastRefreshedHint message={refreshNote} /> : null}
        {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      </View>
      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((k) => (
          <Pill
            key={k}
            label={t(k === "all" ? "materialMovement.filterAll" : movementKindLabelKey(k))}
            active={filter === k}
            onPress={() => setFilter(k)}
            accentKey="material"
          />
        ))}
      </View>
      {loading && entries.length === 0 ? (
        <SkeletonList count={4} />
      ) : entries.length === 0 ? (
        <EmptyState
          title={t("materialMovement.emptyTitle")}
          message={t("materialMovement.emptyBody")}
        />
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
