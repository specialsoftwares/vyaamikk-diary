/**
 * Formal fully-paid closure for shop-managed Customer Credit / EMI records.
 * Captures final payment, payer identity, balance adjustments, and optional proof.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Banner,
  Button,
  FormSection,
  Header,
  Loader,
  Screen,
  SelectField,
  TextField,
  type SelectOption, LocaleUiText } from "@/components/ui";
import { useAuth } from "@/state/auth";
import { useI18n, useT } from "@/i18n";
import { formDateRowStyle, formFieldLabelStyle } from "@/theme/formLayer";
import { spacing, typography, useTheme, useThemedStyles } from "@/theme";
import { userFacingMessage } from "@/domain/errors";
import { formatShortDate } from "@/utils/date";
import { formatAmount } from "@/utils/formatters/formatAmount";
import {
  computeCreditSummary,
  isPaymentDateAllowed,
  shouldUseClosureFlow,
  type BalanceClosureAdjustment,
  type CreditClosureMetadata,
  type CreditPaidBy,
  type CreditPaymentMode,
  type CustomerCreditRecord,
} from "@/domain/customerCredit";
import { getCustomerCreditRepository } from "@/services/customerCredit";
import { syncCreditReminder } from "@/services/customerCredit/reminders";
import { buildCreditPdfHtml } from "@/services/customerCredit/pdfContext";
import { pdfService } from "@/services/pdf/pdfService";
import { invalidateGlobalSearchIndex } from "@/services/search/globalSearchRepository";
import { invalidateMasterInsightsCache } from "@/services/insights/masterInsightsSummary";
import { saveCustomerCreditClosure } from "@/services/customerCredit/saveClosure";
import { SaveStillInProgressError } from "@/services/records/saveLockTypes";
import {
  createSaveIdempotencyContext,
  generateClientRecordId,
  type SaveIdempotencyContext,
} from "@/services/records/saveIdempotency";

const MOBILE_RE = /^[6-9]\d{9}$/;

function toNumber(value: string): number {
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function CustomerCreditCloseScreen() {
  const t = useT();
  const { lang } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const locale = lang === "hi" ? "hi-IN" : "en-IN";
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";

  const [record, setRecord] = useState<CustomerCreditRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const saveLockRef = useRef(false);
  const clientMutationIdRef = useRef(generateClientRecordId("ccclose"));
  const idempotencyRef = useRef<SaveIdempotencyContext | null>(null);
  const [showDate, setShowDate] = useState(false);

  const [finalAmount, setFinalAmount] = useState("");
  const [paidDate, setPaidDate] = useState(Date.now());
  const [mode, setMode] = useState<CreditPaymentMode>("cash");
  const [reference, setReference] = useState("");
  const [paidBy, setPaidBy] = useState<CreditPaidBy>("customer");
  const [payerName, setPayerName] = useState("");
  const [payerRelation, setPayerRelation] = useState("");
  const [payerMobile, setPayerMobile] = useState("");
  const [remarks, setRemarks] = useState("");
  const [adjustment, setAdjustment] = useState<BalanceClosureAdjustment>("exact");
  const [adjustmentNote, setAdjustmentNote] = useState("");

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      lead: { ...typography.body, color: c.textMuted, marginBottom: spacing.md },
      banner: { marginBottom: spacing.md },
      fieldLabel: formFieldLabelStyle(c),
      infoNote: { ...typography.caption, color: c.textSubtle, marginTop: 2 },
      dateRow: formDateRowStyle(isDark, c),
      dateValue: { ...typography.body, color: c.text },
      dateChange: { ...typography.caption, color: c.primary },
      balanceRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: spacing.sm,
      },
      balanceLabel: { ...typography.body, color: c.textMuted },
      balanceValue: { ...typography.titleSm, color: c.primary },
      actions: { gap: spacing.md, marginTop: spacing.lg },
    })
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user || !id) return;
      try {
        const rec = await getCustomerCreditRepository().getById(user.uid, String(id));
        if (!alive) return;
        if (!rec || !shouldUseClosureFlow(rec)) {
          setError(t("customerCredit.closureNotAllowed"));
          setRecord(rec);
        } else {
          setRecord(rec);
          const summary = computeCreditSummary(rec);
          setFinalAmount(summary.balance > 0 ? String(summary.balance) : "");
        }
      } catch (e) {
        if (alive) setError(userFacingMessage(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, id, t]);

  useEffect(() => {
    if (!user || !id) return;
    idempotencyRef.current = createSaveIdempotencyContext({
      userId: user.uid,
      recordKind: "customer_credit_closure",
      clientRecordId: clientMutationIdRef.current,
      scopeKey: String(id),
    });
  }, [user, id]);

  const summary = useMemo(
    () => (record ? computeCreditSummary(record) : null),
    [record]
  );

  const fmtMoney = useCallback((v: number) => formatAmount(v), []);

  const modeOptions: SelectOption[] = [
    { value: "cash", label: t("customerCredit.payCash") },
    { value: "upi", label: t("customerCredit.payUpi") },
    { value: "card", label: t("customerCredit.payCard") },
    { value: "bank_transfer", label: t("customerCredit.payBank") },
    { value: "cheque", label: t("customerCredit.payCheque") },
    { value: "other", label: t("customerCredit.payOther") },
  ];

  const paidByOptions: SelectOption[] = [
    { value: "customer", label: t("customerCredit.closurePaidByCustomer") },
    { value: "family", label: t("customerCredit.closurePaidByFamily") },
    { value: "business_rep", label: t("customerCredit.closurePaidByRep") },
    { value: "other", label: t("customerCredit.closurePaidByOther") },
  ];

  const adjustmentOptions: SelectOption[] = [
    { value: "exact", label: t("customerCredit.closureAdjExact") },
    { value: "discount_waiver", label: t("customerCredit.closureAdjWaiver") },
    { value: "round_off", label: t("customerCredit.closureAdjRound") },
    { value: "extra_charge", label: t("customerCredit.closureAdjExtra") },
  ];

  const amountNum = toNumber(finalAmount);
  const balance = summary?.balance ?? 0;
  const diff = Math.round((amountNum - balance) * 100) / 100;
  const needsAdjustmentPick = Math.abs(diff) > 0.01;

  const onSubmit = useCallback(async () => {
    if (!user || !record || !summary) return;
    if (submitting || saveLockRef.current) return;
    if (amountNum <= 0) return setSubmitError(t("customerCredit.errPaymentAmount"));
    if (!isPaymentDateAllowed(paidDate)) return setSubmitError(t("customerCredit.errPaymentDate"));

    if (amountNum < balance - 0.01 && adjustment !== "discount_waiver") {
      return setSubmitError(t("customerCredit.closureErrUnderpay"));
    }
    if (amountNum > balance + 0.01) {
      if (adjustment !== "extra_charge" && !adjustmentNote.trim()) {
        return setSubmitError(t("customerCredit.closureErrOverpay"));
      }
    }

    if (paidBy !== "customer") {
      if (!payerName.trim()) return setSubmitError(t("customerCredit.closureErrPayerName"));
      if (payerMobile.trim() && !MOBILE_RE.test(payerMobile.trim())) {
        return setSubmitError(t("customerCredit.errMobile"));
      }
    }

    const recordedBy =
      user.displayName?.trim() || user.businessName?.trim() || t("customerCredit.closureRecordedByYou");

    const closure: CreditClosureMetadata = {
      finalPaymentDate: paidDate,
      finalPaymentAmount: amountNum,
      paymentMode: mode,
      paymentReference: reference.trim() || null,
      paidBy,
      payerName: paidBy !== "customer" ? payerName.trim() : null,
      payerRelation: paidBy !== "customer" ? payerRelation.trim() || null : null,
      payerMobile: paidBy !== "customer" && payerMobile.trim() ? `+91${payerMobile.trim()}` : null,
      recordedBy,
      closingRemarks: remarks.trim() || null,
      balanceAtClosure: balance,
      adjustment: needsAdjustmentPick ? adjustment : "exact",
      adjustmentAmount: needsAdjustmentPick ? Math.abs(diff) : null,
      adjustmentNote: adjustmentNote.trim() || null,
      closedAt: Date.now(),
    };

    setSubmitError(null);
    saveLockRef.current = true;
    setSubmitting(true);
    const idempotency = idempotencyRef.current;
    try {
      if (!idempotency) throw new Error("Closure idempotency missing.");
      const updated = await saveCustomerCreditClosure(
        user.uid,
        record.id,
        closure,
        idempotency,
        clientMutationIdRef.current
      );
      void syncCreditReminder(user.uid, updated, t);
      invalidateGlobalSearchIndex();
      invalidateMasterInsightsCache();
      router.replace({
        pathname: "/(app)/customer-credit/[id]",
        params: { id: record.id },
      });
      void (async () => {
        try {
          const html = await buildCreditPdfHtml({
            record: updated,
            variant: "statement",
            user,
            t,
            locale,
            uiLang: lang,
          });
          const pdf = await pdfService.generate({
            html,
            fileNameHint: `${updated.recordNumber}-closed`,
          });
          await getCustomerCreditRepository().update(user.uid, {
            id: updated.id,
            pdfUri: pdf.uri,
          });
          void pdfService.share(pdf).catch(() => undefined);
        } catch {
          // pdf optional — closure already saved
        }
      })();
    } catch (e) {
      if (e instanceof SaveStillInProgressError) {
        setSubmitError(t("customerCredit.errSaveInProgress"));
        return;
      }
      setSubmitError(userFacingMessage(e) || t("customerCredit.errGenerate"));
    } finally {
      setSubmitting(false);
      saveLockRef.current = false;
    }
  }, [
    user,
    record,
    summary,
    submitting,
    amountNum,
    balance,
    paidDate,
    mode,
    reference,
    paidBy,
    payerName,
    payerRelation,
    payerMobile,
    remarks,
    adjustment,
    adjustmentNote,
    needsAdjustmentPick,
    diff,
    t,
    locale,
    router,
  ]);

  if (loading) {
    return (
      <Screen>
        <Header title={t("customerCredit.closureTitle")} showBack />
        <Loader fullscreen message={t("common.loading")} />
      </Screen>
    );
  }
  if (error || !record) {
    return (
      <Screen>
        <Header title={t("customerCredit.closureTitle")} showBack />
        <Banner tone="danger" message={error ?? t("customerCredit.notFound")} />
      </Screen>
    );
  }

  return (
    <Screen scroll form>
      <Header variant="executive" title={t("customerCredit.closureTitle")} showBack />
      <Text style={styles.lead}>
        {record.recordNumber} · {record.customerName}
      </Text>
      <LocaleUiText style={styles.infoNote}>{t("customerCredit.closureDisclaimer")}</LocaleUiText>

      {submitError ? (
        <View style={styles.banner}>
          <Banner tone="danger" message={submitError} />
        </View>
      ) : null}

      <FormSection title={t("customerCredit.closureSectionPayment")}>
        <View style={styles.balanceRow}>
          <LocaleUiText style={styles.balanceLabel}>{t("customerCredit.currentBalance")}</LocaleUiText>
          <Text style={styles.balanceValue}>{fmtMoney(balance)}</Text>
        </View>
        <TextField
          label={t("customerCredit.closureFinalAmount")}
          required
          value={finalAmount}
          onChangeText={setFinalAmount}
          keyboardType="decimal-pad"
          maxLength={14}
        />
        {needsAdjustmentPick ? (
          <>
            <SelectField
              label={t("customerCredit.closureDifference")}
              value={adjustment}
              options={adjustmentOptions}
              onChange={(v) => setAdjustment(v as BalanceClosureAdjustment)}
            />
            <TextField
              label={t("customerCredit.closureAdjNote")}
              value={adjustmentNote}
              onChangeText={setAdjustmentNote}
              maxLength={200}
            />
          </>
        ) : null}
        <View>
          <LocaleUiText style={styles.fieldLabel}>{t("customerCredit.closureFinalDate")}</LocaleUiText>
          <Pressable onPress={() => setShowDate(true)} style={styles.dateRow}>
            <Text style={styles.dateValue}>{formatShortDate(paidDate)}</Text>
            <LocaleUiText style={styles.dateChange}>{t("diary.reminder.pickDate")}</LocaleUiText>
          </Pressable>
          {showDate ? (
            <DateTimePicker
              mode="date"
              value={new Date(paidDate)}
              maximumDate={new Date()}
              onChange={(event, selected) => {
                setShowDate(false);
                if (event.type === "dismissed" || !selected) return;
                setPaidDate(selected.getTime());
              }}
            />
          ) : null}
        </View>
        <SelectField
          label={t("customerCredit.fieldPaymentMode")}
          value={mode}
          options={modeOptions}
          onChange={(v) => setMode(v as CreditPaymentMode)}
        />
        <TextField
          label={t("customerCredit.fieldPaymentReference")}
          value={reference}
          onChangeText={setReference}
          maxLength={60}
        />
      </FormSection>

      <FormSection title={t("customerCredit.closureSectionPayer")}>
        <SelectField
          label={t("customerCredit.closurePaidBy")}
          value={paidBy}
          options={paidByOptions}
          onChange={(v) => setPaidBy(v as CreditPaidBy)}
        />
        {paidBy !== "customer" ? (
          <>
            <TextField
              label={t("customerCredit.closurePayerName")}
              required
              value={payerName}
              onChangeText={setPayerName}
              maxLength={80}
            />
            <TextField
              label={t("customerCredit.closurePayerRelation")}
              value={payerRelation}
              onChangeText={setPayerRelation}
              maxLength={60}
            />
            <TextField
              label={t("customerCredit.closurePayerMobile")}
              value={payerMobile}
              onChangeText={(v) => setPayerMobile(v.replace(/[^0-9]/g, "").slice(0, 10))}
              keyboardType="number-pad"
              maxLength={10}
            />
          </>
        ) : null}
        <TextField
          label={t("customerCredit.closureRemarks")}
          value={remarks}
          onChangeText={setRemarks}
          multiline
          maxLength={300}
        />
      </FormSection>

      <View style={styles.actions}>
        <Button
          label={submitting ? t("customerCredit.saving") : t("customerCredit.closureConfirm")}
          loading={submitting}
          onPress={onSubmit}
        />
      </View>
    </Screen>
  );
}
