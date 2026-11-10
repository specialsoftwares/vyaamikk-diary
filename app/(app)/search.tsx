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
import { Header, Screen, LocaleUiText } from "@/components/ui";
import {
  OfflineDeviceNotice,
  SCREEN_EXISTING_SLOW_MS,
  SearchOutcome,
  SlowNetworkStatus,
  listPhase,
  resolveSearchPresentation,
  screenStateCopy,
  showsEmpty,
  useOwnedSnapshot,
  useRequestOwner,
  requestSessionsMatch,
  type RequestClaim,
} from "@/components/screenState";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { currentSessionCommitEpoch } from "@/services/auth/authSessionFence";
import { useAuth } from "@/state/auth";
import { useSync } from "@/state/sync";
import { useI18n, useT } from "@/i18n";
import {
  invalidateGlobalSearchIndex,
  isQuerySearchable,
  navigateToSearchResult,
  type GlobalSearchFilter,
  type GlobalSearchResult,
} from "@/services/search";
import { readRecentSearches } from "@/services/search/recentSearches";
import { startRecentSearchRead } from "@/services/search/recentSearchReadOwnership";
import { radius, spacing, typography, useTheme, useThemedStyles } from "@/theme";

type Section = { title: string; data: GlobalSearchResult[] };

export default function GlobalSearchScreen() {
  const t = useT();
  const { lang } = useI18n();
  const copy = screenStateCopy(lang);
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const { user } = useAuth();
  const { status: syncStatus } = useSync();
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
    indexClaim,
    requestClaim,
    libraryCount,
    searching,
    showRecent,
    reloadIndex,
    commitSearch,
  } = useGlobalSearch(user?.uid ?? null);
  const { requestDelete, isDeleting } = useRecordDelete(user?.uid ?? null);

  const [recentRead, setRecentRead] = useState<{
    claim: RequestClaim;
    queries: string[];
    failed: boolean;
  } | null>(null);
  const { capture: captureRecent, owns: ownsRecent } = useRequestOwner(user?.uid ?? null);
  const sessionEpoch = currentSessionCommitEpoch();
  // Render ownership changes immediately, before the next focus effect runs.
  const currentRecent = requestSessionsMatch(
    user?.uid ? { uid: user.uid, epoch: sessionEpoch } : null,
    recentRead?.claim
  ) ? recentRead : null;
  const recentQueries = currentRecent?.queries ?? [];
  const recentFailure = currentRecent?.failed ?? false;

  useFocusEffect(
    useCallback(() => {
      invalidateGlobalSearchIndex();
      void reloadIndex();
      const claim = captureRecent();
      setRecentRead(null);
      const pending = claim ? startRecentSearchRead({
        claim,
        owns: ownsRecent,
        read: readRecentSearches,
        publish: (read, owner) => {
          setRecentRead({ claim: owner,
            queries: read.state === "ready" ? read.queries : [],
            failed: read.state !== "ready" });
        },
        fail: (owner) => {
          setRecentRead({ claim: owner, queries: [], failed: true });
        },
      }) : null;
      if (typeof q === "string" && q.trim()) setQuery(q.trim());
      return () => pending?.dispose();
    }, [reloadIndex, q, setQuery, user?.uid, sessionEpoch, captureRecent, ownsRecent])
  );

  const filterLabel = useCallback(
    (f: GlobalSearchFilter) => t(`globalSearch.filters.${f}`),
    [t]
  );

  const categoryLabel = useCallback(
    (r: GlobalSearchResult) => t(r.categoryLabelKey),
    [t]
  );

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

  const ownedSearch = useOwnedSnapshot({
    signedInUid: user?.uid ?? null,
    epoch: currentSessionCommitEpoch(),
    generation: requestClaim?.generation ?? null,
    loading: indexLoading,
    failed: Boolean(indexError),
    value: { recent: recentRecords, results, libraryCount },
    valueClaim: indexClaim,
  });
  const visibleSearch = ownedSearch.accepted && ownedSearch.value ? ownedSearch.value : null;
  const visibleLibraryCount = visibleSearch?.libraryCount ?? 0;
  const matchCount = isQuerySearchable(query) ? (visibleSearch ? visibleSearch.results.length : 0) : 0;
  const offline = syncStatus === "offline";
  const keepVisibleRows = visibleLibraryCount > 0 || matchCount > 0;
  const presentation = resolveSearchPresentation({
    query,
    queryActive: isQuerySearchable(query),
    matchCount,
    libraryCount: visibleLibraryCount,
    loading: ((showSearchSkeleton || ownedSearch.pending) && !keepVisibleRows),
    failed: Boolean(indexError) && !keepVisibleRows && !ownedSearch.pending,
  });
  const showEmptyLibrary = showsEmpty(
    listPhase({
      loading: presentation === "loading",
      failed: presentation === "failure",
      count: visibleLibraryCount,
      owned: ownedSearch.current,
      pending: ownedSearch.pending,
    })
  );

  const displaySections: Section[] = useMemo(() => {
    const source = isQuerySearchable(query)
      ? (visibleSearch?.results ?? [])
      : (visibleSearch?.recent ?? []);
    if (!isQuerySearchable(query)) {
      return [{ title: t("globalSearch.recentRecords"), data: source }];
    }
    const map = new Map<string, GlobalSearchResult[]>();
    for (const item of source) {
      const label = categoryLabel(item);
      const list = map.get(label) ?? [];
      list.push(item);
      map.set(label, list);
    }
    return [...map.entries()].map(([title, data]) => ({ title, data }));
  }, [query, visibleSearch, categoryLabel, t]);

  const listHeader = (
    <View>
      <View style={styles.filterWrap}>
        <SearchFilterChips value={filter} onChange={setFilter} label={filterLabel} />
      </View>
      {showRecent && recentFailure ? (
        <LocaleUiText style={styles.recentLabel}>{t("globalSearch.recentUnavailable")}</LocaleUiText>
      ) : null}
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
      {offline && keepVisibleRows ? <OfflineDeviceNotice offline hasRows /> : null}
      <SlowNetworkStatus
        active={showSearchSkeleton && keepVisibleRows}
        slowAfterMs={SCREEN_EXISTING_SLOW_MS}
      />
      {!user ? (
        <LocaleUiText style={[styles.hint, { paddingHorizontal: spacing.lg }]}>{copy.signedOut}</LocaleUiText>
      ) : presentation === "loading" ||
        presentation === "failure" ||
        presentation === "no_match" ||
        (presentation === "empty_library" && showEmptyLibrary) ? (
        <SearchOutcome
          presentation={presentation}
          onClear={() => setQuery("")}
          onRetry={() => void reloadIndex()}
          onBack={() => router.back()}
        />
      ) : (
        <SectionList
          sections={presentation === "results" || presentation === "idle" ? displaySections : []}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) =>
            section.data.length > 0 ? (
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
            presentation === "idle" && showRecent ? (
              <LocaleUiText style={styles.hint}>{t("globalSearch.startTyping")}</LocaleUiText>
            ) : null
          }
        />
      )}
    </Screen>
  );
}
