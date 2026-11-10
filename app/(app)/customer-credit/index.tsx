/**
 * Customer Credit & EMI hub / history.
 *
 * Lists every record (newest serial first) with balance + status. Tapping a row
 * opens the detail screen (ledger, schedule, actions). A "New" button creates
 * one. Record-keeping only — no lending / recovery workflow.
 */

import React, { useCallback, useMemo } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { Banner,
  Button,
  Card,
  EmptyState,
  Header,
  LastRefreshedHint,
  Screen, LocaleUiText } from "@/components/ui";
import {
  InitialListSkeleton,
  OfflineDeviceNotice,
  ScreenErrorPanel,
  SlowNetworkStatus,
  listPhase,
  showsEmpty,
  screenStateCopy,
  useOwnedRequest,
  useOwnedSnapshot,
} from "@/components/screenState";
import { currentSessionCommitEpoch } from "@/services/auth/authSessionFence";
import { useAuth } from "@/state/auth";
import { useSync } from "@/state/sync";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { useI18n, useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";
import { formatShortDate } from "@/utils/date";
import { formatAmount } from "@/utils/formatters/formatAmount";
import { requestComposerPickerReturn } from "@/navigation";
import {
  computeCreditSummary,
  isReceivable,
  type CustomerCreditRecord,
  type CustomerCreditStatus,
} from "@/domain/customerCredit";
import { getCustomerCreditRepository, recordTitle } from "@/services/customerCredit";

function statusKey(status: CustomerCreditStatus): string {
  switch (status) {
    case "fully_paid":
      return "customerCredit.statusFullyPaid";
    case "cancelled":
      return "customerCredit.statusCancelled";
    case "written_off":
      return "customerCredit.statusWrittenOff";
    case "external_completed":
      return "customerCredit.statusExternalDone";
    default:
      return "customerCredit.statusActive";
  }
}

export default function CustomerCreditListScreen() {
  const t = useT();
  const { lang } = useI18n();
  const copy = screenStateCopy(lang);
  const router = useRouter();
  const { user } = useAuth();
  const { status: syncStatus } = useSync();
  const insets = useSafeAreaInsets();
  const { fromPicker } = useLocalSearchParams<{ fromPicker?: string }>();

  const { load, run } = useOwnedRequest<CustomerCreditRecord[]>(user?.uid ?? null);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      headerWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
      newBtn: { marginBottom: spacing.md },
      banner: { marginBottom: spacing.md },
      listContent: { gap: spacing.md, paddingHorizontal: spacing.lg },
      row: { gap: spacing.xs },
      rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
      number: { ...typography.titleSm, color: c.text },
      balance: { ...typography.titleSm, color: c.primary },
      customer: { ...typography.body, color: c.text },
      meta: { ...typography.caption, color: c.textMuted },
      pillRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs, flexWrap: "wrap" },
      pill: {
        alignSelf: "flex-start",
        paddingVertical: 2,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: c.surfaceMuted,
      },
      pillText: { ...typography.micro, color: c.textMuted },
      pillDue: { backgroundColor: "#FEE2E2" },
      pillDueText: { color: c.danger },
    })
  );

  const loadRecords = useCallback(async () => {
    await run((uid) => getCustomerCreditRepository().list(uid));
  }, [run]);

  const { refreshing, refreshNote, refreshControl } = useAppRefresh({ onReload: loadRecords });

  const ownedRecords = useOwnedSnapshot({
    signedInUid: user?.uid ?? null,
    epoch: currentSessionCommitEpoch(),
    generation: load.claim?.generation ?? null,
    loading: load.loading,
    failed: Boolean(load.error),
    value: load.value ?? [],
    valueClaim: load.valueClaim,
  });
  const rows = ownedRecords.accepted && ownedRecords.value ? ownedRecords.value : [];
  const phase = listPhase({
    loading: load.loading,
    failed: Boolean(load.error),
    count: rows.length,
    owned: ownedRecords.current,
    pending: ownedRecords.pending,
  });
  const offline = syncStatus === "offline";

  useFocusEffect(
    useCallback(() => {
      void loadRecords();
    }, [loadRecords])
  );

  const fmtMoney = useCallback(
    (value: number) => formatAmount(value, { maximumFractionDigits: 0 }),
    []
  );

  const goNew = useCallback(() => router.push("/(app)/customer-credit/form"), [router]);

  const goBack = useCallback(() => {
    if (fromPicker === "1") requestComposerPickerReturn("picker");
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/(tabs)/saved-records");
  }, [fromPicker, router]);

  const renderItem = useCallback(
    ({ item }: { item: CustomerCreditRecord }) => {
      const summary = computeCreditSummary(item);
      const receivable = isReceivable(item) && summary.balance > 0;
      const due = receivable && (summary.overdueCount > 0 || summary.dueTodayCount > 0);
      return (
        <Pressable
          onPress={() =>
            router.push({ pathname: "/(app)/customer-credit/[id]", params: { id: item.id } })
          }
          accessibilityRole="button"
        >
          <Card style={styles.row} elevated={false}>
            <View style={styles.rowTop}>
              <Text style={styles.number}>{item.recordNumber}</Text>
              <Text style={styles.balance}>{fmtMoney(summary.balance)}</Text>
            </View>
            <Text style={styles.customer} numberOfLines={1}>
              {recordTitle(item)}
            </Text>
            <Text style={styles.meta}>
              {t("customerCredit.fieldSaleDate")}: {formatShortDate(item.saleDate)}
              {receivable && summary.nextDueDate
                ? ` · ${t("customerCredit.nextDueMeta", { date: formatShortDate(summary.nextDueDate) })}`
                : ""}
            </Text>
            <View style={styles.pillRow}>
              <View style={styles.pill}>
                <LocaleUiText style={styles.pillText}>{t(statusKey(item.status))}</LocaleUiText>
              </View>
              {due ? (
                <View style={[styles.pill, styles.pillDue]}>
                  <LocaleUiText style={[styles.pillText, styles.pillDueText]}>
                    {summary.overdueCount > 0
                      ? t("customerCredit.overduePill", { n: summary.overdueCount })
                      : t("customerCredit.dueTodayPill")}
                  </LocaleUiText>
                </View>
              ) : null}
            </View>
          </Card>
        </Pressable>
      );
    },
    [styles, t, fmtMoney, router]
  );

  const listPadding = useMemo(
    () => [styles.listContent, { paddingBottom: insets.bottom + spacing.xxl }],
    [styles.listContent, insets.bottom]
  );

  return (
    <Screen padded={false} dismissKeyboardOnTap={false}>
      <View style={styles.headerWrap}>
        <Header
          title={t("customerCredit.listTitle")}
          subtitle={t("customerCredit.listSubtitle")}
          showBack
          onBackPress={goBack}
        />
        {load.error && rows.length > 0 ? (
          <View style={styles.banner}>
            <Banner tone="danger" message={load.error} />
          </View>
        ) : null}
        <Button label={t("customerCredit.newAction")} onPress={goNew} style={styles.newBtn} />
        <LastRefreshedHint message={refreshNote} />
        {offline && rows.length > 0 ? <OfflineDeviceNotice offline hasRows /> : null}
        <SlowNetworkStatus active={(refreshing || load.loading) && rows.length > 0} />
      </View>

      {phase === "loading" ? (
        <InitialListSkeleton count={6} />
      ) : phase === "error" ? (
        <>
          {offline ? <OfflineDeviceNotice offline hasRows={false} /> : null}
          <ScreenErrorPanel error={load.error ?? "unknown"} onRetry={() => void loadRecords()} />
        </>
      ) : phase === "hidden" ? (
        <LocaleUiText style={{ padding: 24, textAlign: "center" }}>{copy.signedOut}</LocaleUiText>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(d) => d.id}
          renderItem={renderItem}
          refreshControl={refreshControl}
          initialNumToRender={10}
          removeClippedSubviews={Platform.OS === "android"}
          contentContainerStyle={listPadding}
          ListEmptyComponent={
            showsEmpty(phase) ? (
            <EmptyState
              title={t("customerCredit.emptyTitle")}
              message={t("customerCredit.emptyMessage")}
              actionLabel={t("customerCredit.newAction")}
              onAction={goNew}
            />
            ) : null
          }
        />
      )}
    </Screen>
  );
}
