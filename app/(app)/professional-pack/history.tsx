import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { SwipeToDeleteRow } from "@/components/records/SwipeToDeleteRow";
import { EmptyState, Header, Screen, SmartHeadline, TextField, LocaleUiText } from "@/components/ui";
import {
  InitialListSkeleton,
  OfflineDeviceNotice,
  ScreenErrorPanel,
  SlowNetworkStatus,
  listPhase,
  screenStateCopy,
  showsEmpty,
  useOwnedRequest,
  useOwnedSnapshot,
} from "@/components/screenState";
import { currentSessionCommitEpoch } from "@/services/auth/authSessionFence";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import { useSync } from "@/state/sync";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import { useAuth } from "@/state/auth";
import { useI18n, useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
import { formatEntryDate } from "@/utils/date";
import { getProfessionalPackRepository } from "@/services/professionalPack";
import {
  categoryLabelKey,
  matterLabelKey,
  statusLabelKey,
} from "@/utils/professionalPack/display";

export default function ProfessionalPackHistoryScreen() {
  const t = useT();
  const { lang } = useI18n();
  const copy = screenStateCopy(lang);
  const router = useRouter();
  const { user } = useAuth();
  const { status: syncStatus } = useSync();
  const [search, setSearch] = useState("");
  const { load, run } = useOwnedRequest<ProfessionalServicePack[]>(user?.uid ?? null);
  const { requestDelete, isDeleting } = useRecordDelete(user?.uid ?? null);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      search: { marginBottom: spacing.md },
      row: {
        paddingVertical: spacing.md,
        gap: 4,
        borderBottomWidth: 1,
        borderBottomColor: c.divider,
      },
      title: { ...typography.bodyStrong, color: c.text },
      meta: { ...typography.caption, color: c.textMuted },
      sub: { ...typography.caption, color: c.textSubtle },
    })
  );

  const loadPacks = useCallback(async () => {
    await run((uid) =>
      getProfessionalPackRepository().list(uid, {
        search,
        limit: 200,
      })
    );
  }, [run, search]);

  useFocusEffect(
    useCallback(() => {
      void loadPacks();
    }, [loadPacks])
  );

  const ownedPacks = useOwnedSnapshot({
    signedInUid: user?.uid ?? null,
    epoch: currentSessionCommitEpoch(),
    generation: load.claim?.generation ?? null,
    loading: load.loading,
    failed: Boolean(load.error),
    value: load.value ?? [],
    valueClaim: load.valueClaim,
  });
  const packs = ownedPacks.accepted && ownedPacks.value ? ownedPacks.value : [];
  const phase = listPhase({
    loading: load.loading,
    failed: Boolean(load.error),
    count: packs.length,
    owned: ownedPacks.current,
    pending: ownedPacks.pending,
  });
  const offline = syncStatus === "offline";
  const searching = search.trim().length > 0;

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Header title={t("proPack.historyTitle")} showBack backFrom="you" />
        <SmartHeadline title={t("proPack.historySubtitle")} style={{ marginTop: 0 }} />
        <TextField
          containerStyle={styles.search}
          placeholder={t("proPack.searchPlaceholder")}
          value={search}
          onChangeText={setSearch}
        />
        {offline && packs.length > 0 ? <OfflineDeviceNotice offline hasRows /> : null}
        <SlowNetworkStatus active={load.loading && packs.length > 0} />
      </View>
      {phase === "loading" ? (
        <InitialListSkeleton count={6} />
      ) : phase === "error" ? (
        <>
          {offline ? <OfflineDeviceNotice offline hasRows={false} /> : null}
          <ScreenErrorPanel error={load.error ?? "unknown"} onRetry={() => void loadPacks()} />
        </>
      ) : phase === "hidden" ? (
        <LocaleUiText style={{ padding: 24, textAlign: "center" }}>{copy.signedOut}</LocaleUiText>
      ) : showsEmpty(phase) && searching ? (
        <EmptyState
          title={copy.searchNoMatchTitle}
          message={copy.searchNoMatchBody}
          actionLabel={copy.searchClear}
          onAction={() => setSearch("")}
          iconName="magnify"
        />
      ) : showsEmpty(phase) ? (
        <EmptyState
          title={t("proPack.historyEmptyTitle")}
          message={t("proPack.historyEmptyMessage")}
          actionLabel={t("proPack.title")}
          onAction={() => router.push("/(app)/professional-pack")}
        />
      ) : (
      <FlatList
        data={packs}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl }}
        renderItem={({ item, index }) => {
          const req = {
            entityType: "professional_pack" as const,
            recordId: item.id,
            title: item.title,
            confirmTier: "record" as const,
          };
          const row = (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: "/(app)/professional-pack/[id]",
                  params: { id: item.id },
                })
              }
            >
            <Text style={styles.title}>
              {index + 1}. {item.title}
            </Text>
            <LocaleUiText style={styles.meta}>
              {t(categoryLabelKey(item.professionalCategory))} ·{" "}
              {t(matterLabelKey(item.professionalCategory, item.matterType))} ·{" "}
              {t(statusLabelKey(item.status))}
            </LocaleUiText>
            <Text style={styles.sub}>
              {formatEntryDate(item.matterDate)}
              {item.dueDate ? ` · Due ${formatEntryDate(item.dueDate)}` : ""}
            </Text>
          </Pressable>
          );
          return (
            <SwipeToDeleteRow
              rowKey={`pack-${item.id}`}
              recordId={item.id}
              entityType="professional_pack"
              title={item.title}
              onDeletePress={() => requestDelete(req, loadPacks)}
              deleteInProgress={isDeleting(req)}
            >
              {row}
            </SwipeToDeleteRow>
          );
        }}
      />
      )}
    </Screen>
  );
}
