import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlobalSearchResultRow } from "@/components/search/GlobalSearchResultRow";
import { SwipeToDeleteRow } from "@/components/records/SwipeToDeleteRow";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import { userDeleteFromSearchResult } from "@/services/records/deleteTargets";
import { SearchFilterChips } from "@/components/search/SearchFilterChips";
import { EmptyState, Header, Screen, SkeletonList, SkeletonLoadingPanel, LocaleUiText } from "@/components/ui";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import {
  invalidateGlobalSearchIndex,
  navigateToSearchResult,
  type GlobalSearchFilter,
  type GlobalSearchResult,
} from "@/services/search";
import { getRecentSearches } from "@/services/search/recentSearches";
import { radius, spacing, typography, useTheme, useThemedStyles } from "@/theme";

type Section = { title: string; data: GlobalSearchResult[] };

export default function GlobalSearchScreen() {
  const t = useT();
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const {
    query,
    setQuery,
    filter,
    setFilter,
    results,
    recentRecords,
    indexLoading,
    indexError,
    searching,
    showRecent,
    showEmpty,
    showResults,
    reloadIndex,
    commitSearch,
  } = useGlobalSearch(user?.uid ?? null);
  const { requestDelete, isDeleting } = useRecordDelete(user?.uid ?? null);

  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      invalidateGlobalSearchIndex();
      void reloadIndex();
      void getRecentSearches().then(setRecentQueries);
      if (typeof q === "string" && q.trim()) setQuery(q.trim());
    }, [reloadIndex, q, setQuery])
  );

  const filterLabel = useCallback(
    (f: GlobalSearchFilter) => t(`globalSearch.filters.${f}`),
    [t]
  );

  const categoryLabel = useCallback(
    (r: GlobalSearchResult) => t(r.categoryLabelKey),
    [t]
  );

  const sections: Section[] = useMemo(() => {
    const map = new Map<string, GlobalSearchResult[]>();
    for (const r of results) {
      const label = categoryLabel(r);
      const list = map.get(label) ?? [];
      list.push(r);
      map.set(label, list);
    }
    return [...map.entries()].map(([title, data]) => ({ title, data }));
  }, [results, categoryLabel]);

  const onSelect = useCallback(
    async (result: GlobalSearchResult) => {
      await commitSearch();
      navigateToSearchResult(router, result, user?.uid);
    },
    [commitSearch, router]
  );

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      headerWrap: { paddingHorizontal: spacing.lg },
      searchBox: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        marginTop: spacing.sm,
        marginBottom: spacing.md,
        paddingHorizontal: spacing.md,
        minHeight: 48,
        borderRadius: radius.xl,
        backgroundColor: c.surfaceMuted,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
      },
      searchInput: {
        flex: 1,
        ...typography.body,
        color: c.text,
        paddingVertical: spacing.sm,
      },
      clearBtn: { padding: spacing.xs },
      filterWrap: { paddingHorizontal: spacing.lg },
      sectionHeader: {
        ...typography.captionStrong,
        color: c.textMuted,
        marginTop: spacing.md,
        marginBottom: spacing.xs,
      },
      rowGap: { marginBottom: spacing.sm },
      recentChip: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
        backgroundColor: c.surfaceMuted,
        marginRight: spacing.xs,
        marginBottom: spacing.xs,
      },
      recentChipText: { ...typography.caption, color: c.text },
      recentLabel: {
        ...typography.captionStrong,
        color: c.textMuted,
        marginBottom: spacing.xs,
      },
      hint: {
        ...typography.caption,
        color: c.textSubtle,
        marginTop: spacing.sm,
      },
      listContent: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl + insets.bottom,
      },
    })
  );

  const showSearchSkeleton =
    indexLoading || (searching && query.trim().length >= 2);

  const listHeader = (
    <View>
      <View style={styles.filterWrap}>
        <SearchFilterChips value={filter} onChange={setFilter} label={filterLabel} />
      </View>
      {showRecent && recentQueries.length > 0 ? (
        <View style={{ marginBottom: spacing.sm }}>
          <LocaleUiText style={styles.recentLabel}>{t("globalSearch.recentQueries")}</LocaleUiText>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {recentQueries.map((q) => (
              <Pressable key={q} style={styles.recentChip} onPress={() => setQuery(q)}>
                <Text style={styles.recentChipText}>{q}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {showRecent && !indexLoading ? (
        <LocaleUiText style={styles.recentLabel}>{t("globalSearch.recentRecords")}</LocaleUiText>
      ) : null}
      {query.trim().length > 0 && query.trim().length < 2 ? (
        <LocaleUiText style={styles.hint}>{t("globalSearch.minChars")}</LocaleUiText>
      ) : null}
    </View>
  );

  const recentSections: Section[] = useMemo(
    () => [{ title: t("globalSearch.recentRecords"), data: recentRecords }],
    [recentRecords, t]
  );

  return (
    <Screen>
      <View style={styles.headerWrap}>
        <Header
          title={t("globalSearch.title")}
          showBack
          onBackPress={() => router.back()}
        />
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={22} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t("globalSearch.placeholder")}
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel={t("globalSearch.inputLabel")}
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery("")}
              style={styles.clearBtn}
              accessibilityLabel={t("globalSearch.clear")}
            >
              <MaterialCommunityIcons name="close-circle" size={22} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {indexError ? (
        <LocaleUiText style={[styles.hint, { color: colors.danger, paddingHorizontal: spacing.lg }]}>
          {t(indexError)}
        </LocaleUiText>
      ) : null}
      {showEmpty ? (
        <EmptyState
          title={t("globalSearch.emptyTitle")}
          message={t("globalSearch.emptyMessage")}
        />
      ) : (
        <SectionList
          sections={
            showSearchSkeleton
              ? []
              : showResults
                ? sections
                : showRecent
                  ? recentSections
                  : []
          }
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) =>
            showResults || section.data.length > 0 ? (
              <Text style={styles.sectionHeader}>{section.title}</Text>
            ) : null
          }
          renderItem={({ item }) => {
            const deleteReq = userDeleteFromSearchResult(item);
            const onDeleted = async () => {
              invalidateGlobalSearchIndex();
              await reloadIndex();
            };
            const row = (
              <GlobalSearchResultRow
                result={item}
                categoryLabel={categoryLabel(item)}
                onPress={() => void onSelect(item)}
              />
            );
            return (
              <View style={styles.rowGap}>
                {deleteReq ? (
                  <SwipeToDeleteRow
                    rowKey={`search-${item.id}`}
                    recordId={deleteReq.recordId}
                    entityType={deleteReq.entityType}
                    title={deleteReq.title}
                    onDeletePress={() => requestDelete(deleteReq, onDeleted)}
                    deleteInProgress={isDeleting(deleteReq)}
                  >
                    {row}
                  </SwipeToDeleteRow>
                ) : (
                  row
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            showSearchSkeleton ? (
              <SkeletonLoadingPanel
                loading
                slowMessage={t("skeleton.stillLoading")}
              >
                <SkeletonList count={6} />
              </SkeletonLoadingPanel>
            ) : !indexLoading && showRecent ? (
              <LocaleUiText style={styles.hint}>{t("globalSearch.startTyping")}</LocaleUiText>
            ) : null
          }
        />
      )}
    </Screen>
  );
}
