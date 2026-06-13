/**
 * Customer Credit / EMI record detail.
 *
 * Shows the money summary, EMI schedule (with per-instalment status), the
 * payment ledger, and actions: record payment, edit, generate/share the five
 * PDF documents, change close/settlement status, and delete (most-recent only).
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { Banner,
  Button,
  Card,
  Header,
  Loader,
  Screen, LocaleUiText } from "@/components/ui";
import { useAuth } from "@/state/auth";
import { useI18n, useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";
import { userFacingMessage } from "@/domain/errors";
import { useAppFeedback } from "@/feedback/AppFeedback";
import { deleteRecordPermanently } from "@/services/records/permanentDeletion";
import { shareDukaanText } from "@/services/share/shareTextService";
import { isShareUserCancelled } from "@/utils/shareDismissed";
import { formatShortDate } from "@/utils/date";
import { formatAmount } from "@/utils/formatters/formatAmount";
import {
  computeCreditSummary,
  isReceivable,
  modeUsesExternalFinance,
  modeUsesSchedule,
  shouldUseClosureFlow,
  type CustomerCreditRecord,
  type CustomerCreditStatus,
  type InstallmentStatus,
} from "@/domain/customerCredit";
import { getCustomerCreditRepository, recordTitle } from "@/services/customerCredit";
import { cancelCreditReminder, syncCreditReminder } from "@/services/customerCredit/reminders";
import { buildCreditPdfHtml } from "@/services/customerCredit/pdfContext";
import type { CustomerCreditPdfVariant } from "@/services/pdf/customerCreditPdfService";
import { pdfService } from "@/services/pdf/pdfService";

function instalmentStatusKey(s: InstallmentStatus): string {
  switch (s) {
    case "paid":
      return "customerCredit.pdf.stPaid";
    case "partial":
      return "customerCredit.pdf.stPartial";
    case "overdue":
      return "customerCredit.pdf.stOverdue";
    case "due_today":
      return "customerCredit.pdf.stDueToday";
    default:
      return "customerCredit.pdf.stUpcoming";
  }
}

export default function CustomerCreditDetailScreen() {
  const t = useT();
  const { lang } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const feedback = useAppFeedback();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const locale = lang === "hi" ? "hi-IN" : "en-IN";

  const [record, setRecord] = useState<CustomerCreditRecord | null>(null);
  const [maxSerial, setMaxSerial] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasLoadedOnce = useRef(false);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      headerWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
      banner: { marginBottom: spacing.md },
      body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
      card: { gap: spacing.xs },
      title: { ...typography.titleSm, color: c.text },
      sub: { ...typography.caption, color: c.textMuted },
      kv: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
      k: { ...typography.body, color: c.textMuted },
      v: { ...typography.body, color: c.text },
      balanceV: { ...typography.titleSm, color: c.primary },
      sectionTitle: { ...typography.captionStrong, color: c.textMuted, marginBottom: spacing.xs },
      schedRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
      },
      schedLeft: { ...typography.body, color: c.text },
      schedAmt: { ...typography.body, color: c.text },
      pill: { paddingVertical: 1, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: c.surfaceMuted },
      pillText: { ...typography.micro, color: c.textMuted },
      ledgerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
      },
      actions: { gap: spacing.sm, marginTop: spacing.sm },
      actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    })
  );

  const load = useCallback(async () => {
    if (!user || !id) return;
    if (!hasLoadedOnce.current) setLoading(true);
    setError(null);
    try {
      const repo = getCustomerCreditRepository();
      const [rec, top] = await Promise.all([
        repo.getById(user.uid, String(id)),
        repo.list(user.uid, { limit: 1 }),
      ]);
      setRecord(rec);
      setMaxSerial(top[0]?.serial ?? 0);
      hasLoadedOnce.current = true;
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const fmtMoney = useCallback((value: number) => formatAmount(value), []);

  const summary = useMemo(
    () => (record ? computeCreditSummary(record) : null),
    [record]
  );

  const onShareText = useCallback(async () => {
    if (!record) return;
    try {
      await shareDukaanText(record, { t });
    } catch (e) {
      if (!isShareUserCancelled(e)) {
        setActionError(userFacingMessage(e));
      }
    }
  }, [record, t]);

  const onGenerate = useCallback(
    async (variant: CustomerCreditPdfVariant) => {
      if (!user || !record) return;
      setActionError(null);
      setBusy(true);
      try {
        const html = await buildCreditPdfHtml({ record, variant, user, t, locale, uiLang: lang });
        const pdf = await pdfService.generate({
          html,
          fileNameHint: `${record.recordNumber}-${variant}`,
        });
        if (variant === "sale_record" || variant === "statement") {
          try {
            await getCustomerCreditRepository().update(user.uid, {
              id: record.id,
              pdfUri: pdf.uri,
            });
          } catch {
            // non-fatal
          }
        }
        try {
          await pdfService.share(pdf);
        } catch {
          // dismissed
        }
      } catch (e) {
        setActionError(userFacingMessage(e) || t("customerCredit.errGenerate"));
      } finally {
        setBusy(false);
      }
    },
    [user, record, t, locale, lang]
  );

  const onSetStatus = useCallback(
    (status: CustomerCreditStatus, confirmKey: string) => {
      if (!user || !record) return;
      Alert.alert(t("customerCredit.statusChangeTitle"), t(confirmKey), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.confirm"),
          onPress: async () => {
            setBusy(true);
            setActionError(null);
            try {
              const updated = await getCustomerCreditRepository().setStatus(
                user.uid,
                record.id,
                status
              );
              void syncCreditReminder(user.uid, updated, t);
              await load();
            } catch (e) {
              setActionError(userFacingMessage(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ]);
    },
    [user, record, t, load]
  );

  const onDelete = useCallback(() => {
    if (!user || !record) return;
    Alert.alert(t("customerCredit.deleteConfirmTitle"), t("customerCredit.deleteConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await cancelCreditReminder(record);
            const result = await deleteRecordPermanently({
              entityType: "customer_credit",
              recordId: record.id,
              userId: user.uid,
              ueid: user.ueid,
            });
            const msg = result.syncPending
              ? t("swipeDelete.deletedSyncPending")
              : t("swipeDelete.deleted");
            feedback.showSuccess(msg);
            router.back();
          } catch (e) {
            setActionError(userFacingMessage(e));
            setBusy(false);
          }
        },
      },
    ]);
  }, [user, record, t, router, feedback]);

  const onChangeStatus = useCallback(() => {
    if (!record) return;
    Alert.alert(t("customerCredit.statusChangeTitle"), undefined, [
      {
        text: t("customerCredit.statusFullyPaid"),
        onPress: () => {
          if (shouldUseClosureFlow(record)) {
            router.push({
              pathname: "/(app)/customer-credit/close",
              params: { id: record.id },
            });
          } else {
            onSetStatus("fully_paid", "customerCredit.confirmFullyPaid");
          }
        },
      },
      {
        text: t("customerCredit.statusWrittenOff"),
        onPress: () => onSetStatus("written_off", "customerCredit.confirmWrittenOff"),
      },
      {
        text: t("customerCredit.statusExternalDone"),
        onPress: () => onSetStatus("external_completed", "customerCredit.confirmExternalDone"),
      },
      {
        text: t("customerCredit.statusCancelled"),
        style: "destructive",
        onPress: () => onSetStatus("cancelled", "customerCredit.confirmCancelled"),
      },
      ...(record.status !== "active"
        ? [
            {
              text: t("customerCredit.reopen"),
              onPress: () => onSetStatus("active", "customerCredit.confirmReopen"),
            },
          ]
        : []),
      { text: t("common.cancel"), style: "cancel" as const },
    ]);
  }, [record, t, onSetStatus]);

  if (loading) {
    return (
      <Screen>
        <Header title={t("customerCredit.detailTitle")} showBack />
        <Loader fullscreen message={t("common.loading")} />
      </Screen>
    );
  }
  if (error || !record || !summary) {
    return (
      <Screen>
        <Header title={t("customerCredit.detailTitle")} showBack />
        <View style={styles.headerWrap}>
          <Banner tone="danger" message={error ?? t("customerCredit.notFound")} />
        </View>
      </Screen>
    );
  }

  const canDelete = record.serial === maxSerial;
  const receivable = isReceivable(record) && summary.balance > 0;
  const hasSchedule = modeUsesSchedule(record.mode) && summary.installments.length > 0;
  const isFinance = modeUsesExternalFinance(record.mode);

  return (
    <Screen padded={false} dismissKeyboardOnTap={false}>
      <View style={styles.headerWrap}>
        <Header title={record.recordNumber} subtitle={recordTitle(record)} showBack />
        {actionError ? (
          <View style={styles.banner}>
            <Banner tone="danger" message={actionError} />
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Summary */}
        <Card style={styles.card} elevated={false}>
          <LocaleUiText style={styles.title}>{t("customerCredit.summaryTitle")}</LocaleUiText>
          <View style={styles.kv}>
            <LocaleUiText style={styles.k}>{t("customerCredit.fieldSaleDate")}</LocaleUiText>
            <Text style={styles.v}>{formatShortDate(record.saleDate)}</Text>
          </View>
          <View style={styles.kv}>
            <LocaleUiText style={styles.k}>{t("customerCredit.saleTotal")}</LocaleUiText>
            <Text style={styles.v}>{fmtMoney(record.saleAmount)}</Text>
          </View>
          {record.downPayment ? (
            <View style={styles.kv}>
              <LocaleUiText style={styles.k}>{t("customerCredit.fieldDownPayment")}</LocaleUiText>
              <Text style={styles.v}>{fmtMoney(record.downPayment)}</Text>
            </View>
          ) : null}
          <View style={styles.kv}>
            <LocaleUiText style={styles.k}>{t("customerCredit.totalReceived")}</LocaleUiText>
            <Text style={styles.v}>{fmtMoney(summary.totalPaid)}</Text>
          </View>
          <View style={styles.kv}>
            <LocaleUiText style={styles.k}>{t("customerCredit.balance")}</LocaleUiText>
            <Text style={styles.balanceV}>{fmtMoney(summary.balance)}</Text>
          </View>
          <Text style={styles.sub}>
            {t("customerCredit.statusLabel")}: {t(statusLabelKey(record.status))}
            {receivable && summary.nextDueDate
              ? ` · ${t("customerCredit.nextDueMeta", { date: formatShortDate(summary.nextDueDate) })}`
              : ""}
          </Text>
        </Card>

        {/* Finance note */}
        {isFinance && record.financerName ? (
          <Card style={styles.card} elevated={false}>
            <LocaleUiText style={styles.sectionTitle}>{t("customerCredit.sectionFinance")}</LocaleUiText>
            <View style={styles.kv}>
              <LocaleUiText style={styles.k}>{t("customerCredit.fieldFinancer")}</LocaleUiText>
              <Text style={styles.v}>{record.financerName}</Text>
            </View>
            {record.financeRefNumber ? (
              <View style={styles.kv}>
                <LocaleUiText style={styles.k}>{t("customerCredit.fieldFinanceRef")}</LocaleUiText>
                <Text style={styles.v}>{record.financeRefNumber}</Text>
              </View>
            ) : null}
            {!record.shopFollowUpRequired ? (
              <LocaleUiText style={styles.sub}>{t("customerCredit.financeBoundaryNote")}</LocaleUiText>
            ) : null}
          </Card>
        ) : null}

        {/* Schedule */}
        {hasSchedule ? (
          <Card style={styles.card} elevated={false}>
            <LocaleUiText style={styles.sectionTitle}>{t("customerCredit.pdf.titleSchedule")}</LocaleUiText>
            {summary.installments.map((it) => (
              <View key={it.seq} style={styles.schedRow}>
                <Text style={styles.schedLeft}>
                  {it.seq}. {formatShortDate(it.dueDate)}
                </Text>
                <Text style={styles.schedAmt}>{fmtMoney(it.amount)}</Text>
                <View style={styles.pill}>
                  <LocaleUiText style={styles.pillText}>{t(instalmentStatusKey(it.status))}</LocaleUiText>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Ledger */}
        {record.payments.length > 0 ? (
          <Card style={styles.card} elevated={false}>
            <LocaleUiText style={styles.sectionTitle}>{t("customerCredit.pdf.ledger")}</LocaleUiText>
            {[...record.payments]
              .sort((a, b) => a.paidDate - b.paidDate)
              .map((p) => (
                <View key={p.id} style={styles.ledgerRow}>
                  <Text style={styles.k}>
                    {formatShortDate(p.paidDate)} · {p.mode}
                  </Text>
                  <Text style={styles.v}>{fmtMoney(p.amount)}</Text>
                </View>
              ))}
          </Card>
        ) : null}

        {record.closure ? (
          <Card style={styles.card} elevated={false}>
            <LocaleUiText style={styles.sectionTitle}>{t("customerCredit.pdf.closureTitle")}</LocaleUiText>
            <LocaleUiText style={styles.sub}>{t("customerCredit.pdf.closureNote")}</LocaleUiText>
            <View style={styles.kv}>
              <LocaleUiText style={styles.k}>{t("customerCredit.pdf.closureFinalDate")}</LocaleUiText>
              <Text style={styles.v}>{formatShortDate(record.closure.finalPaymentDate)}</Text>
            </View>
            <View style={styles.kv}>
              <LocaleUiText style={styles.k}>{t("customerCredit.pdf.closureFinalAmount")}</LocaleUiText>
              <Text style={styles.v}>{fmtMoney(record.closure.finalPaymentAmount)}</Text>
            </View>
            <View style={styles.kv}>
              <LocaleUiText style={styles.k}>{t("customerCredit.pdf.closurePaidBy")}</LocaleUiText>
              <Text style={styles.v}>
                {record.closure.paidBy === "customer"
                  ? t("customerCredit.closurePaidByCustomer")
                  : [record.closure.payerName, record.closure.payerRelation]
                      .filter(Boolean)
                      .join(" · ") || t("customerCredit.closurePaidByOther")}
              </Text>
            </View>
            {record.closure.paymentMode ? (
              <View style={styles.kv}>
                <LocaleUiText style={styles.k}>{t("customerCredit.fieldPaymentMode")}</LocaleUiText>
                <Text style={styles.v}>{record.closure.paymentMode}</Text>
              </View>
            ) : null}
            {record.closure.closedAt ? (
              <View style={styles.kv}>
                <LocaleUiText style={styles.k}>{t("customerCredit.pdf.closureClosedOn")}</LocaleUiText>
                <Text style={styles.v}>{formatShortDate(record.closure.closedAt)}</Text>
              </View>
            ) : null}
            {record.closure.adjustment && record.closure.adjustment !== "exact" ? (
              <View style={styles.kv}>
                <LocaleUiText style={styles.k}>{t("customerCredit.closureDifference")}</LocaleUiText>
                <Text style={styles.v}>
                  {record.closure.adjustment === "discount_waiver"
                    ? t("customerCredit.closureAdjWaiver")
                    : record.closure.adjustment === "round_off"
                      ? t("customerCredit.closureAdjRound")
                      : t("customerCredit.closureAdjExtra")}
                </Text>
              </View>
            ) : null}
            {record.closure.closingRemarks?.trim() ? (
              <Text style={styles.sub}>{record.closure.closingRemarks.trim()}</Text>
            ) : null}
          </Card>
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            label={t("common.shareText")}
            variant="secondary"
            onPress={() => void onShareText()}
            disabled={busy}
          />
          {record.status === "active" ? (
            <Button
              label={t("customerCredit.recordPayment")}
              onPress={() =>
                router.push({ pathname: "/(app)/customer-credit/payment", params: { id: record.id } })
              }
              disabled={busy}
            />
          ) : null}
          <View style={styles.actionsRow}>
            <Button
              label={t("customerCredit.pdfSaleRecord")}
              variant="secondary"
              fullWidth={false}
              onPress={() => onGenerate("sale_record")}
              loading={busy}
            />
            {hasSchedule ? (
              <Button
                label={t("customerCredit.pdfSchedule")}
                variant="secondary"
                fullWidth={false}
                onPress={() => onGenerate("emi_schedule")}
                disabled={busy}
              />
            ) : null}
            <Button
              label={t("customerCredit.pdfStatement")}
              variant="secondary"
              fullWidth={false}
              onPress={() => onGenerate("statement")}
              disabled={busy}
            />
            {isFinance ? (
              <Button
                label={t("customerCredit.pdfFinance")}
                variant="secondary"
                fullWidth={false}
                onPress={() => onGenerate("external_finance")}
                disabled={busy}
              />
            ) : null}
          </View>
          <View style={styles.actionsRow}>
            <Button
              label={t("common.edit")}
              variant="secondary"
              fullWidth={false}
              onPress={() =>
                router.push({ pathname: "/(app)/customer-credit/form", params: { id: record.id } })
              }
              disabled={busy}
            />
            <Button
              label={t("customerCredit.changeStatus")}
              variant="ghost"
              fullWidth={false}
              onPress={onChangeStatus}
              disabled={busy}
            />
            {canDelete ? (
              <Button
                label={t("common.delete")}
                variant="ghost"
                fullWidth={false}
                onPress={onDelete}
                disabled={busy}
              />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function statusLabelKey(status: CustomerCreditStatus): string {
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
