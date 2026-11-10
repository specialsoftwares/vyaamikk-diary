import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { DraftListRow } from "@/components/drafts/DraftListRow";
import { SwipeToDeleteRow } from "@/components/records/SwipeToDeleteRow";
import {
  Header,
  LastRefreshedHint,
  Screen,
  EmptyState,
} from "@/components/ui";
import {
  InitialListSkeleton,
  OfflineDeviceNotice,
  ScreenErrorPanel,
  SlowNetworkStatus,
  SCREEN_EXISTING_SLOW_MS,
  listPhase,
  showsEmpty,
  useOwnedRequest,
  useOwnedSnapshot,
} from "@/components/screenState";
import { currentSessionCommitEpoch } from "@/services/auth/authSessionFence";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { formDraftsRepository, type FormDraftRecord } from "@/repositories/formDraftsRepository";
import { buildDraftTitle } from "@/services/drafts/draftTitle";
import { hrefForDraft } from "@/services/drafts/draftRoutes";
import { SkeletonDraftRow } from "@/components/ui/skeleton/SkeletonPresets";
import { useAuth } from "@/state/auth";
import { useSync } from "@/state/sync";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
import { useSmartBack } from "@/navigation";

type FilterKey = "all" | FormDraftRecord["draftKind"];

export default function DraftsScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const { status: syncStatus } = useSync();
  const [filter, setFilter] = useState<FilterKey>("all");
  const { load, run } = useOwnedRequest<FormDraftRecord[]>(user?.uid ?? null);
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

  const loadDrafts = useCallback(async () => {
    await run((uid) => formDraftsRepository.listActiveUserDrafts(uid));
  }, [run]);

  const { refreshNote, onRefresh, refreshControl } = useAppRefresh({
    onReload: loadDrafts,
    externalRefreshing: load.loading,
  });

  useFocusEffect(
    useCallback(() => {
      void loadDrafts();
    }, [loadDrafts])
  );

  const ownedDrafts = useOwnedSnapshot({
    signedInUid: user?.uid ?? null,
    epoch: currentSessionCommitEpoch(),
    generation: load.claim?.generation ?? null,
    loading: load.loading,
    failed: Boolean(load.error),
    value: load.value ?? [],
    valueClaim: load.valueClaim,
  });
  const rows = ownedDrafts.accepted && ownedDrafts.value ? ownedDrafts.value : [];
  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((d) => d.draftKind === filter);
  }, [rows, filter]);
  const phase = listPhase({
    loading: load.loading,
    failed: Boolean(load.error),
    count: rows.length,
    owned: ownedDrafts.current,
    pending: ownedDrafts.pending,
  });
  const offline = syncStatus === "offline";

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
      {offline && rows.length > 0 ? <OfflineDeviceNotice offline hasRows /> : null}
      <SlowNetworkStatus active={load.loading && rows.length > 0} slowAfterMs={SCREEN_EXISTING_SLOW_MS} />
      {phase === "loading" ? (
        <InitialListSkeleton count={7} Item={SkeletonDraftRow} />
      ) : phase === "error" ? (
        <>
          {offline ? <OfflineDeviceNotice offline hasRows={false} /> : null}
          <ScreenErrorPanel error={load.error ?? "unknown"} onRetry={() => void loadDrafts()} />
        </>
      ) : showsEmpty(phase) ? (
        <EmptyState
          title={t("executive.inlineEmpty.noDrafts")}
          message={t("drafts.empty")}
          iconName="file-edit-outline"
          accentKey="work"
          actionLabel={t("common.back")}
          onAction={goBack}
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
                onDeletePress={() => requestDelete(req, loadDrafts)}
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
