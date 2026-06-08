import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Banner,
  Button,
  EmptyState,
  ErrorState,
  Header,
  LastRefreshedHint,
  Screen,
  SkeletonDashboardPreview,
  SkeletonList,
  SkeletonLoadingPanel,
  TextField, LocaleUiText } from "@/components/ui";
import { EntryRow } from "@/components/diary/EntryRow";
import { EntryTypeFilter, type DiaryEntryFilterType } from "@/components/diary/EntryTypeFilter";
import { SwipeToDeleteRow } from "@/components/records/SwipeToDeleteRow";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { useAuth } from "@/state/auth";
import { useDiaryList } from "@/state/useDiaryList";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles, useThemeColors } from "@/theme";
import type { BusinessEntryType } from "@/domain/businessEntry";
import { isComposerEntryType } from "@/domain/composerOptions";
import { MATERIAL_MOVEMENT_ENTRY_TYPES } from "@/domain/materialMovement";
import { requestComposerPickerReturn } from "@/navigation";

const DIARY_PAGE_INITIAL = 80;
const DIARY_PAGE_INCREMENT = 50;

export default function DiaryHistoryScreen() {
  const t = useT();
  const router = useRouter();
  const { filter, type: typeParam } = useLocalSearchParams<{
    filter?: string;
    type?: string;
  }>();
  const { user } = useAuth();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      headerWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
      search: { marginTop: spacing.sm },
      filterRow: { marginTop: spacing.md, marginBottom: spacing.md },
      listContent: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl,
        gap: spacing.md,
      },
      rowWrap: { marginBottom: 0 },
      activeFilters: { marginBottom: spacing.sm },
      loadMoreWrap: { paddingVertical: spacing.lg, alignItems: "center" },
      loadMoreHint: { ...typography.caption, color: c.textMuted, marginTop: spacing.sm },
    })
  );
  const [search, setSearch] = useState("");
  const [entryTypeFilter, setEntryTypeFilter] = useState<DiaryEntryFilterType>(() => {
    if (!typeParam) return null;
    if (typeParam === "material_movement") return "material_movement";
    return isComposerEntryType(typeParam) ? (typeParam as BusinessEntryType) : null;
  });
  const entryType =
    entryTypeFilter === "material_movement" ? null : entryTypeFilter;
  const [listLimit, setListLimit] = useState(DIARY_PAGE_INITIAL);

  const upcomingOnly = filter === "upcoming";
  const options = useMemo(
    () => ({
      search,
      entryType,
      upcomingOnly: upcomingOnly || undefined,
      limit: listLimit,
    }),
    [search, entryType, upcomingOnly, listLimit]
  );
  const { entries, loading, refreshing, error, refresh, reload } = useDiaryList(
    user?.uid ?? null,
    options
  );
  const { refreshNote, onRefresh, refreshControl } = useAppRefresh({
    onReload: refresh,
    externalRefreshing: refreshing,
  });
  const { requestDelete, isDeleting } = useRecordDelete(user?.uid ?? null);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  useEffect(() => {
    setListLimit(DIARY_PAGE_INITIAL);
  }, [search, entryTypeFilter, upcomingOnly]);

  const displayedEntries = useMemo(() => {
    if (entryTypeFilter !== "material_movement") return entries;
    return entries.filter((e) =>
      (MATERIAL_MOVEMENT_ENTRY_TYPES as readonly string[]).includes(e.entryType)
    );
  }, [entries, entryTypeFilter]);

  const hasMore = displayedEntries.length >= listLimit;
  const loadMore = useCallback(() => {
    if (!hasMore || loading || refreshing) return;
    setListLimit((n) => n + DIARY_PAGE_INCREMENT);
  }, [hasMore, loading, refreshing]);

  const subtitle = upcomingOnly
    ? t("diary.historySubtitleUpcoming", { count: displayedEntries.length })
    : displayedEntries.length === 0
      ? t("diary.historySubtitleNone")
      : t("diary.historySubtitleCount", { count: displayedEntries.length });

  const openEntry = useCallback(
    (id: string) => {
      router.push({ pathname: "/(app)/diary/[id]", params: { id, from: "diary" } });
    },
    [router]
  );

  // "+ New" lands the user directly in the correct creation context: the matching
  // composer form when this list is scoped to a single type, otherwise the picker.
  const goNew = useCallback(() => {
    if (entryTypeFilter === "material_movement") {
      router.push({ pathname: "/(app)/composer/movement", params: { from: "diary" } });
      return;
    }
    if (entryType) {
      router.push({
        pathname: "/(app)/composer/[type]",
        params: { type: entryType, from: "diary" },
      });
      return;
    }
    requestComposerPickerReturn("picker");
    router.push("/(app)/(tabs)/you");
  }, [entryType, entryTypeFilter, router]);

  const renderItem = useCallback(
    ({ item }: { item: (typeof entries)[number] }) => {
      const req = {
        entityType: "diary_entry" as const,
        recordId: item.id,
        title: item.title,
        confirmTier: "record" as const,
      };
      return (
        <View style={styles.rowWrap}>
          <SwipeToDeleteRow
            rowKey={`entry-${item.id}`}
            recordId={item.id}
            entityType="diary_entry"
            title={item.title}
            onDeletePress={() => requestDelete(req, reload)}
            deleteInProgress={isDeleting(req)}
          >
            <EntryRow entry={item} onPress={() => openEntry(item.id)} />
          </SwipeToDeleteRow>
        </View>
      );
    },
    [openEntry, styles.rowWrap, requestDelete, reload, isDeleting]
  );

  const listPadding = useMemo(
    () => [styles.listContent, { paddingBottom: insets.bottom + spacing.xxl }],
    [styles.listContent, insets.bottom]
  );

  return (
    <Screen padded={false} dismissKeyboardOnTap={false}>
      <View style={styles.headerWrap}>
        <Header
          title={t("diary.historyTitle")}
          subtitle={subtitle}
          showBack
          backFrom="you"
          rightSlot={
            <Button
              label={t("common.new")}
              fullWidth={false}
              size="md"
              onPress={goNew}
            />
          }
        />

        <TextField
          placeholder={t("diary.searchPlaceholder")}
          value={search}
          onChangeText={setSearch}
          containerStyle={styles.search}
          autoCorrect={false}
        />

        <View style={styles.filterRow}>
          <EntryTypeFilter value={entryTypeFilter} onChange={setEntryTypeFilter} />
        </View>

        <Banner tone="info" message={t("diary.proPacksBanner")} />
        <Pressable
          onPress={() => router.push("/(app)/professional-pack/history")}
          style={{ marginTop: spacing.sm, marginBottom: spacing.md }}
        >
          <LocaleUiText style={{ color: colors.primary, fontWeight: "600" }}>
            {t("diary.proPacksLink")}
          </LocaleUiText>
        </Pressable>
        <LastRefreshedHint message={refreshNote} />
      </View>

      {loading && entries.length === 0 ? (
        <SkeletonLoadingPanel loading slowMessage={t("skeleton.stillLoading")}>
          <SkeletonList count={8} Item={SkeletonDashboardPreview} />
        </SkeletonLoadingPanel>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <FlatList
          data={displayedEntries}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === "android"}
          contentContainerStyle={listPadding}
          refreshControl={refreshControl}
          ListEmptyComponent={
            <EmptyState
              title={search || entryTypeFilter ? t("diary.noMatches") : t("diary.emptyTitle")}
              message={
                search
                  ? t("diary.noMatchesMessage")
                  : entryType
                    ? t("diary.emptyMessage")
                    : t("diary.emptyMessage")
              }
              actionLabel={
                search ? t("diary.clearFilters") : t("you.addEntry")
              }
              onAction={() => {
                if (search) {
                  setSearch("");
                  setEntryTypeFilter(null);
                  return;
                }
                goNew();
              }}
            />
          }
          ListHeaderComponent={
            search.length > 0 || entryTypeFilter ? (
              <View style={styles.activeFilters}>
                <Banner
                  tone="info"
                  message={
                    [
                      search.length > 0 ? t("diary.activeFilterSearch", { query: search }) : null,
                      entryTypeFilter
                        ? t("diary.activeFilterType", {
                            label:
                              entryTypeFilter === "material_movement"
                                ? t("composer.options.materialMovement")
                                : t(`composer.types.${entryTypeFilter}`),
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" • ") +
                    ` • ${t("diary.activeFilterResults", { count: displayedEntries.length })}`
                  }
                />
              </View>
            ) : null
          }
          ListFooterComponent={
            hasMore ? (
              <View style={styles.loadMoreWrap}>
                <Button
                  label={t("diary.loadMore")}
                  variant="secondary"
                  size="md"
                  onPress={loadMore}
                  loading={loading || refreshing}
                />
                <LocaleUiText style={styles.loadMoreHint}>
                  {t("diary.showingCount", { count: displayedEntries.length })}
                </LocaleUiText>
              </View>
            ) : displayedEntries.length > 0 ? (
              <View style={styles.loadMoreWrap}>
                <LocaleUiText style={styles.loadMoreHint}>
                  {t("diary.showingCount", { count: displayedEntries.length })}
                </LocaleUiText>
              </View>
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.35}
        />
      )}
    </Screen>
  );
}

