/**
 * Customer Credit & EMI hub / history.
 *
 * Lists every record (newest serial first) with balance + status. Tapping a row
 * opens the detail screen (ledger, schedule, actions). A "New" button creates
 * one. Record-keeping only — no lending / recovery workflow.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Header,
  LastRefreshedHint,
  Loader,
  Screen, LocaleUiText } from "@/components/ui";
import { useAuth } from "@/state/auth";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";
import { userFacingMessage } from "@/domain/errors";
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
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { fromPicker } = useLocalSearchParams<{ fromPicker?: string }>();

  const [records, setRecords] = useState<CustomerCreditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);

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

  const load = useCallback(
    async (mode: "mount" | "refresh" = "mount") => {
      if (!user) return;
      if (!hasLoadedOnce.current) setLoading(true);
      setError(null);
      try {
        const list = await getCustomerCreditRepository().list(user.uid);
        setRecords(list);
        hasLoadedOnce.current = true;
      } catch (e) {
        setError(userFacingMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  const { refreshNote, refreshControl } = useAppRefresh({ onReload: () => load("refresh") });

  useFocusEffect(
    useCallback(() => {
      void load("mount");
    }, [load])
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
        {error ? (
          <View style={styles.banner}>
            <Banner tone="danger" message={error} />
          </View>
        ) : null}
        <Button label={t("customerCredit.newAction")} onPress={goNew} style={styles.newBtn} />
        <LastRefreshedHint message={refreshNote} />
      </View>

      {loading && records.length === 0 ? (
        <Loader fullscreen message={t("common.loading")} />
      ) : error && records.length === 0 ? (
        <ErrorState message={error} onRetry={() => void load("mount")} />
      ) : (
        <FlatList
          data={records}
          keyExtractor={(d) => d.id}
          renderItem={renderItem}
          refreshControl={refreshControl}
          initialNumToRender={10}
          removeClippedSubviews={Platform.OS === "android"}
          contentContainerStyle={listPadding}
          ListEmptyComponent={
            <EmptyState
              title={t("customerCredit.emptyTitle")}
              message={t("customerCredit.emptyMessage")}
              actionLabel={t("customerCredit.newAction")}
              onAction={goNew}
            />
          }
        />
      )}
    </Screen>
  );
}
