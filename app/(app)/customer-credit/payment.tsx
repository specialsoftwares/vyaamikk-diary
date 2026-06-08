/**
 * Record a payment received against a Customer Credit / EMI record.
 *
 * On save the payment is appended to the ledger (tracked in edit history) and a
 * Payment Receipt PDF is offered for sharing. Payment / due date must be on or
 * after the product sale / invoice date; future instalment dates are allowed.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
import {
  computeCreditSummary,
  isDukaanPaymentDateAllowed,
  maxDukaanPaymentDate,
  minDukaanPaymentDate,
  normalizeCreditCalendarDay,
  type CreditPaymentMode,
  type CustomerCreditRecord,
} from "@/domain/customerCredit";
import { getCustomerCreditRepository } from "@/services/customerCredit";
import { syncCreditReminder } from "@/services/customerCredit/reminders";
import { buildCreditPdfHtml } from "@/services/customerCredit/pdfContext";
import { pdfService } from "@/services/pdf/pdfService";
import { saveCustomerCreditPayment } from "@/services/customerCredit/savePayment";
import { logSaveDiagnostic } from "@/services/records/saveDiagnostics";
import { SaveStillInProgressError } from "@/services/records/saveLockTypes";
import {
  createSaveIdempotencyContext,
  generateClientRecordId,
  type SaveIdempotencyContext,
} from "@/services/records/saveIdempotency";
import { stableRecordId } from "@/services/records/stableRecordId";

function toNumber(value: string): number {
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function CustomerCreditPaymentScreen() {
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
  const [dateError, setDateError] = useState<string | null>(null);
  const saveLockRef = useRef(false);
  const clientPaymentIdRef = useRef(generateClientRecordId("pay"));
  const idempotencyRef = useRef<SaveIdempotencyContext | null>(null);
  const [showDate, setShowDate] = useState(false);

  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState<number>(() => normalizeCreditCalendarDay(Date.now()));
  const [mode, setMode] = useState<CreditPaymentMode>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

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
        logSaveDiagnostic({
          phase: "start",
          recordKind: "customer_credit_payment",
          userId: user.uid,
          remoteId: String(id),
          message: "parent_record_refetch_start",
        });
        const rec = await getCustomerCreditRepository().getById(user.uid, String(id));
        if (alive) {
          setRecord(rec);
          if (rec) {
            const minMs = minDukaanPaymentDate(rec.saleDate, rec.createdAt);
            setPaidDate((prev) => {
              const normalized = normalizeCreditCalendarDay(prev);
              return normalized < minMs ? minMs : normalized;
            });
          }
        }
        logSaveDiagnostic({
          phase: "complete",
          recordKind: "customer_credit_payment",
          userId: user.uid,
          remoteId: String(id),
          message: rec ? "parent_record_refetch_done" : "parent_record_refetch_done:missing",
        });
      } catch (e) {
        if (alive) setError(userFacingMessage(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, id]);

  useEffect(() => {
    if (!user || !id) return;
    idempotencyRef.current = createSaveIdempotencyContext({
      userId: user.uid,
      recordKind: "customer_credit_payment",
      clientRecordId: clientPaymentIdRef.current,
      scopeKey: String(id),
    });
  }, [user, id]);

  const paymentMinMs = useMemo(
    () => (record ? minDukaanPaymentDate(record.saleDate, record.createdAt) : null),
    [record]
  );
  const paymentMaxMs = useMemo(
    () => (record ? maxDukaanPaymentDate(record.saleDate) : null),
    [record]
  );
  const paymentPickerDate = useMemo(() => {
    if (paymentMinMs == null) return new Date(paidDate);
    const clamped = Math.min(
      Math.max(normalizeCreditCalendarDay(paidDate), paymentMinMs),
      paymentMaxMs ?? normalizeCreditCalendarDay(paidDate)
    );
    return new Date(clamped);
  }, [paidDate, paymentMinMs, paymentMaxMs]);

  const fmtMoney = useCallback(
    (v: number) => {
      try {
        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 2,
        }).format(v);
      } catch {
        return `₹${v.toFixed(2)}`;
      }
    },
    [locale]
  );

  const modeOptions: SelectOption[] = [
    { value: "cash", label: t("customerCredit.payCash") },
    { value: "upi", label: t("customerCredit.payUpi") },
    { value: "card", label: t("customerCredit.payCard") },
    { value: "bank_transfer", label: t("customerCredit.payBank") },
    { value: "finance_company", label: t("customerCredit.payFinanceCompany") },
    { value: "cheque", label: t("customerCredit.payCheque") },
    { value: "other", label: t("customerCredit.payOther") },
  ];

  const onSubmit = useCallback(async () => {
    if (!user || !record) return;
    if (submitting || saveLockRef.current) return;
    const amt = toNumber(amount);
    if (amt <= 0) return setSubmitError(t("customerCredit.errPaymentAmount"));
    if (!isDukaanPaymentDateAllowed(paidDate, record.saleDate, record.createdAt)) {
      setDateError(t("customerCredit.errPaymentBeforeSale"));
      return setSubmitError(t("customerCredit.errPaymentBeforeSale"));
    }
    setDateError(null);

    setSubmitError(null);
    saveLockRef.current = true;
    setSubmitting(true);
    let succeeded = false;
    const idempotency = idempotencyRef.current;
    const paymentId = stableRecordId(clientPaymentIdRef.current, "pay");
    try {
      if (!idempotency) throw new Error("Payment idempotency missing.");
      logSaveDiagnostic({
        phase: "start",
        recordKind: "customer_credit_payment",
        userId: user.uid,
        remoteId: record.id,
        clientRecordId: clientPaymentIdRef.current,
        idempotencyKey: idempotency.idempotencyKey,
        message: "payment_save_start",
      });

      const updated = await saveCustomerCreditPayment(
        user.uid,
        record.id,
        {
          amount: amt,
          paidDate: normalizeCreditCalendarDay(paidDate),
          mode,
          reference: reference.trim() || null,
          note: note.trim() || null,
          clientPaymentId: clientPaymentIdRef.current,
        },
        idempotency
      );

      void syncCreditReminder(user.uid, updated, t);

      succeeded = true;
      logSaveDiagnostic({
        phase: "complete",
        recordKind: "customer_credit_payment",
        userId: user.uid,
        remoteId: record.id,
        message: "navigation_after_payment",
      });
      router.back();

      const payment =
        updated.payments.find((p) => p.id === paymentId) ??
        updated.payments[updated.payments.length - 1] ??
        null;
      void (async () => {
        try {
          const html = await buildCreditPdfHtml({
            record: updated,
            variant: "receipt",
            user,
            t,
            locale,
            uiLang: lang,
            payment,
          });
          await pdfService.generateAndShare({
            html,
            fileNameHint: `${updated.recordNumber}-receipt`,
          });
        } catch {
          // share dismissed / non-fatal — payment is already saved
        } finally {
          logSaveDiagnostic({
            phase: "complete",
            recordKind: "customer_credit_payment",
            userId: user.uid,
            remoteId: record.id,
            message: "pdf_closed",
          });
        }
      })();
    } catch (e) {
      if (e instanceof SaveStillInProgressError) {
        setSubmitError(t("customerCredit.errSaveInProgress"));
        return;
      }
      setSubmitError(userFacingMessage(e) || t("customerCredit.errPaymentSave"));
    } finally {
      setSubmitting(false);
      saveLockRef.current = false;
      logSaveDiagnostic({
        phase: "complete",
        recordKind: "customer_credit_payment",
        userId: user?.uid,
        remoteId: record?.id,
        message: succeeded ? "ui_state_reset_success" : "ui_state_reset",
      });
    }
  }, [
    user,
    record,
    amount,
    paidDate,
    mode,
    reference,
    note,
    t,
    locale,
    lang,
    router,
    submitting,
  ]);

  if (loading) {
    return (
      <Screen>
        <Header title={t("customerCredit.recordPayment")} showBack />
        <Loader fullscreen message={t("common.loading")} />
      </Screen>
    );
  }
  if (error || !record) {
    return (
      <Screen>
        <Header title={t("customerCredit.recordPayment")} showBack />
        <Banner tone="danger" message={error ?? t("customerCredit.notFound")} />
      </Screen>
    );
  }

  const summary = computeCreditSummary(record);
  const saleAnchorMissing = !(record.saleDate > 0);

  return (
    <Screen scroll form>
      <Header variant="executive" title={t("customerCredit.recordPayment")} showBack />
      <Text style={styles.lead}>
        {record.recordNumber} · {record.customerName}
      </Text>

      {submitError ? (
        <View style={styles.banner}>
          <Banner tone="danger" message={submitError} />
        </View>
      ) : null}

      <FormSection title={t("customerCredit.paymentDetails")}>
        <TextField
          label={t("customerCredit.fieldPaymentAmount")}
          required
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          maxLength={14}
        />
        <View>
          <LocaleUiText style={styles.fieldLabel}>
            {t("customerCredit.fieldPaymentDueDate")}
          </LocaleUiText>
          <Pressable onPress={() => setShowDate(true)} style={styles.dateRow}>
            <Text style={styles.dateValue}>{formatShortDate(paidDate)}</Text>
            <LocaleUiText style={styles.dateChange}>{t("diary.reminder.pickDate")}</LocaleUiText>
          </Pressable>
          <LocaleUiText style={styles.infoNote}>
            {saleAnchorMissing
              ? t("customerCredit.paymentDateHintFallback")
              : t("customerCredit.paymentDateHint")}
          </LocaleUiText>
          {dateError ? (
            <LocaleUiText style={[styles.infoNote, { color: "#B91C1C" }]}>
              {dateError}
            </LocaleUiText>
          ) : null}
          {showDate && paymentMinMs != null ? (
            <DateTimePicker
              mode="date"
              value={paymentPickerDate}
              minimumDate={new Date(paymentMinMs)}
              maximumDate={paymentMaxMs != null ? new Date(paymentMaxMs) : undefined}
              onChange={(event, selected) => {
                if (event.type === "dismissed" || !selected) {
                  setShowDate(false);
                  return;
                }
                setShowDate(false);
                const normalized = normalizeCreditCalendarDay(selected.getTime());
                const clamped = Math.min(
                  Math.max(normalized, paymentMinMs),
                  paymentMaxMs ?? normalized
                );
                setPaidDate(clamped);
                if (
                  record &&
                  !isDukaanPaymentDateAllowed(clamped, record.saleDate, record.createdAt)
                ) {
                  setDateError(t("customerCredit.errPaymentBeforeSale"));
                } else {
                  setDateError(null);
                }
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
        <TextField
          label={t("customerCredit.fieldPaymentNote")}
          value={note}
          onChangeText={setNote}
          maxLength={200}
        />
        <View style={styles.balanceRow}>
          <LocaleUiText style={styles.balanceLabel}>{t("customerCredit.currentBalance")}</LocaleUiText>
          <Text style={styles.balanceValue}>{fmtMoney(summary.balance)}</Text>
        </View>
      </FormSection>

      <View style={styles.actions}>
        <Button
          label={submitting ? t("customerCredit.saving") : t("customerCredit.savePaymentShare")}
          loading={submitting}
          onPress={onSubmit}
        />
      </View>
    </Screen>
  );
}
