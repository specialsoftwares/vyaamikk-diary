/**
 * Purchase Orders hub / history.
 *
 * Lists every PO (newest serial first), with actions: regenerate & share PDF,
 * edit, cancel (status only), and delete (restricted to the most-recent PO so
 * the serial sequence is never disturbed casually). A "New purchase order"
 * button creates one.
 */

import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Platform, StyleSheet, Text, View } from "react-native";
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
  screenStateCopy,
  showsEmpty,
  useOwnedRequest,
  useOwnedSnapshot,
} from "@/components/screenState";
import { presentPublicError } from "@/domain/publicErrors";
import { currentSessionCommitEpoch } from "@/services/auth/authSessionFence";
import { useAuth } from "@/state/auth";
import { useSync } from "@/state/sync";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { useStuckBusyRecovery } from "@/hooks/useStuckBusyRecovery";
import { useI18n, useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";
import { useAppFeedback } from "@/feedback/AppFeedback";
import { deleteRecordPermanently } from "@/services/records/permanentDeletion";
import { formatShortDate } from "@/utils/date";
import { formatAmount } from "@/utils/formatters/formatAmount";
import { requestComposerPickerReturn } from "@/navigation";
import type { PurchaseOrder } from "@/domain/purchaseOrder";
import { getPurchaseOrderRepository } from "@/services/purchaseOrder";
import { pdfService } from "@/services/pdf/pdfService";
import {
  buildPurchaseOrderHtml,
  purchaseOrderPdfLabels,
} from "@/services/pdf/purchaseOrderPdfService";
import { readProfileLogoDataUri } from "@/services/profileLogo/storage";

export default function PurchaseOrderListScreen() {
  const t = useT();
  const { lang } = useI18n();
  const copy = screenStateCopy(lang);
  const router = useRouter();
  const { user } = useAuth();
  const { status: syncStatus } = useSync();
  const insets = useSafeAreaInsets();
  const pdfLocale = lang === "hi" ? "hi-IN" : "en-IN";
  const { fromPicker } = useLocalSearchParams<{ fromPicker?: string }>();

  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const feedback = useAppFeedback();
  const { load, run } = useOwnedRequest<PurchaseOrder[]>(user?.uid ?? null);
  // Recover `busyId` if the iOS share-sheet promise never settles.
  const shareRecovery = useStuckBusyRecovery(
    useCallback(() => setBusyId(null), [])
  );

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      headerWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
      banner: { marginBottom: spacing.md },
      newBtn: { marginBottom: spacing.md },
      listContent: { gap: spacing.md, paddingHorizontal: spacing.lg },
      row: { gap: spacing.xs },
      rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
      poNumber: { ...typography.titleSm, color: c.text },
      total: { ...typography.titleSm, color: c.primary },
      vendor: { ...typography.body, color: c.text },
      meta: { ...typography.caption, color: c.textMuted },
      cancelledPill: {
        alignSelf: "flex-start",
        backgroundColor: "#FEE2E2",
        paddingVertical: 2,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        marginTop: spacing.xs,
      },
      cancelledText: { ...typography.micro, color: c.danger },
      actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
    })
  );

  const loadOrders = useCallback(async () => {
    await run((uid) => getPurchaseOrderRepository().list(uid));
  }, [run]);

  const { refreshNote, refreshControl } = useAppRefresh({
    onReload: loadOrders,
  });

  useFocusEffect(
    useCallback(() => {
      void loadOrders();
    }, [loadOrders])
  );

  const ownedOrders = useOwnedSnapshot({
    signedInUid: user?.uid ?? null,
    epoch: currentSessionCommitEpoch(),
    generation: load.claim?.generation ?? null,
    loading: load.loading,
    failed: Boolean(load.error),
    value: load.value ?? [],
    valueClaim: load.valueClaim,
  });
  const orders = ownedOrders.accepted && ownedOrders.value ? ownedOrders.value : [];
  const phase = listPhase({
    loading: load.loading,
    failed: Boolean(load.error),
    count: orders.length,
    owned: ownedOrders.current,
    pending: ownedOrders.pending,
  });
  const offline = syncStatus === "offline";

  // Highest serial = the only PO eligible for hard delete.
  const maxSerial = useMemo(
    () => orders.reduce((m, p) => Math.max(m, p.serial), 0),
    [orders]
  );

  const fmtMoney = useCallback((value: number) => formatAmount(value), []);

  const onRegenerate = useCallback(
    async (po: PurchaseOrder) => {
      if (!user) return;
      setActionError(null);
      setBusyId(po.id);
      shareRecovery.markPending();
      try {
        let logoDataUri: string | null = null;
        if (po.useLogo && user.profileLogo?.localUri) {
          try {
            logoDataUri = await readProfileLogoDataUri(user.profileLogo);
          } catch {
            logoDataUri = null;
          }
        }
        const html = buildPurchaseOrderHtml({
          po,
          locale: pdfLocale,
          labels: purchaseOrderPdfLabels(t),
          logoDataUri,
        });
        const pdf = await pdfService.generate({ html, fileNameHint: po.poNumber });
        try {
          await getPurchaseOrderRepository().update(user.uid, { id: po.id, pdfUri: pdf.uri });
        } catch {
          // non-fatal
        }
        try {
          await pdfService.share(pdf);
        } catch {
          // dismissed
        }
      } catch (e) {
        setActionError(presentPublicError(e));
      } finally {
        shareRecovery.clearPending();
        setBusyId(null);
      }
    },
    [user, pdfLocale, t, shareRecovery]
  );

  const onCancel = useCallback(
    (po: PurchaseOrder) => {
      if (!user) return;
      Alert.alert(t("purchaseOrder.cancelConfirmTitle"), t("purchaseOrder.cancelConfirmBody"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("purchaseOrder.cancelAction"),
          style: "destructive",
          onPress: async () => {
            setBusyId(po.id);
            try {
              await getPurchaseOrderRepository().cancel(user.uid, po.id);
              await loadOrders();
            } catch (e) {
              setActionError(presentPublicError(e));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [user, t, loadOrders]
  );

  const onDelete = useCallback(
    (po: PurchaseOrder) => {
      if (!user) return;
      Alert.alert(t("purchaseOrder.deleteConfirmTitle"), t("purchaseOrder.deleteConfirmBody"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            setBusyId(po.id);
            try {
              const result = await deleteRecordPermanently({
                entityType: "purchase_order",
                recordId: po.id,
                userId: user.uid,
                ueid: user.ueid,
              });
              const msg = result.syncPending
                ? t("swipeDelete.deletedSyncPending")
                : t("swipeDelete.deleted");
              feedback.showSuccess(msg);
              await loadOrders();
            } catch (e) {
              setActionError(presentPublicError(e));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [user, t, loadOrders, feedback]
  );

  const goNew = useCallback(() => {
    router.push("/(app)/purchase-order/form");
  }, [router]);

  const goBack = useCallback(() => {
    if (fromPicker === "1") requestComposerPickerReturn("picker");
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/(tabs)/saved-records");
  }, [fromPicker, router]);

  const renderItem = useCallback(
    ({ item }: { item: PurchaseOrder }) => {
      const cancelled = item.status === "cancelled";
      const isLatest = item.serial === maxSerial;
      return (
        <Card style={styles.row} elevated={false}>
          <View style={styles.rowTop}>
            <Text style={styles.poNumber}>{item.poNumber}</Text>
            <Text style={styles.total}>{fmtMoney(item.total)}</Text>
          </View>
          <Text style={styles.vendor} numberOfLines={1}>
            {item.vendorName}
          </Text>
          <Text style={styles.meta}>
            {t("purchaseOrder.fieldDate")}: {formatShortDate(item.poDate)}
            {item.version > 1 && item.lastEditedAt
              ? ` · ${t("purchaseOrder.modifiedMeta", { date: formatShortDate(item.lastEditedAt) })}`
              : ""}
          </Text>
          {cancelled ? (
            <View style={styles.cancelledPill}>
              <LocaleUiText style={styles.cancelledText}>{t("purchaseOrder.statusCancelled")}</LocaleUiText>
            </View>
          ) : null}
          <View style={styles.actions}>
            <Button
              label={t("purchaseOrder.regenerate")}
              size="md"
              fullWidth={false}
              variant="secondary"
              onPress={() => onRegenerate(item)}
              loading={busyId === item.id}
            />
            {!cancelled ? (
              <Button
                label={t("common.edit")}
                size="md"
                fullWidth={false}
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: "/(app)/purchase-order/form", params: { id: item.id } })
                }
                disabled={busyId === item.id}
              />
            ) : null}
            {!cancelled ? (
              <Button
                label={t("purchaseOrder.cancelAction")}
                size="md"
                fullWidth={false}
                variant="ghost"
                onPress={() => onCancel(item)}
                disabled={busyId === item.id}
              />
            ) : null}
            {isLatest ? (
              <Button
                label={t("common.delete")}
                size="md"
                fullWidth={false}
                variant="ghost"
                onPress={() => onDelete(item)}
                disabled={busyId === item.id}
              />
            ) : null}
          </View>
        </Card>
      );
    },
    [styles, t, fmtMoney, maxSerial, busyId, onRegenerate, onCancel, onDelete, router]
  );

  const listPadding = useMemo(
    () => [styles.listContent, { paddingBottom: insets.bottom + spacing.xxl }],
    [styles.listContent, insets.bottom]
  );

  return (
    <Screen padded={false} dismissKeyboardOnTap={false}>
      <View style={styles.headerWrap}>
        <Header
          title={t("purchaseOrder.listTitle")}
          subtitle={t("purchaseOrder.listSubtitle")}
          showBack
          onBackPress={goBack}
        />
        {actionError ? (
          <View style={styles.banner}>
            <Banner tone="danger" message={actionError} />
          </View>
        ) : null}
        <Button label={t("purchaseOrder.newAction")} onPress={goNew} style={styles.newBtn} />
        <LastRefreshedHint message={refreshNote} />
        {offline && orders.length > 0 ? <OfflineDeviceNotice offline hasRows /> : null}
        <SlowNetworkStatus active={load.loading && orders.length > 0} />
      </View>

      {phase === "loading" ? (
        <InitialListSkeleton count={6} />
      ) : phase === "error" ? (
        <>
          {offline ? <OfflineDeviceNotice offline hasRows={false} /> : null}
          <ScreenErrorPanel error={load.error ?? "unknown"} onRetry={() => void loadOrders()} />
        </>
      ) : phase === "hidden" ? (
        <LocaleUiText style={{ padding: 24, textAlign: "center" }}>{copy.signedOut}</LocaleUiText>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(d) => d.id}
          renderItem={renderItem}
          refreshControl={refreshControl}
          initialNumToRender={10}
          removeClippedSubviews={Platform.OS === "android"}
          contentContainerStyle={listPadding}
          ListEmptyComponent={
            showsEmpty(phase) ? (
            <EmptyState
              title={t("purchaseOrder.emptyTitle")}
              message={t("purchaseOrder.emptyMessage")}
              actionLabel={t("purchaseOrder.newAction")}
              onAction={goNew}
            />
            ) : null
          }
        />
      )}
    </Screen>
  );
}
