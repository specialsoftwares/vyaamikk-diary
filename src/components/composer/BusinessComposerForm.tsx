import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";

import { ComposerSmartTextField } from "@/components/composer/ComposerSmartTextField";
import { Banner,
  Button,
  IndigoChoiceChip,
  IndigoChoiceChipRow,
  PremiumCard,
  TextField, LocaleUiText } from "@/components/ui";
import { masterKeyForFormField } from "@/services/masterData";
import { OutwardMovementFields } from "@/components/composer/OutwardMovementFields";
import { outwardMovementDefaultValues } from "@/utils/businessEntry/outwardMovement";
import { PaymentRequestFields } from "@/components/composer/PaymentRequestFields";
import { PostalLocationSection } from "@/components/composer/PostalLocationSection";
import { postalFormDefaults } from "@/utils/location/postalForm";
import { ComposerDateField } from "@/components/composer/ComposerDateField";
import { ComposerRecordedOnField } from "@/components/composer/ComposerRecordedOnField";
import { ReminderFields } from "@/components/composer/ReminderFields";
import {
  CashPaidPhotoField,
  type CashPaidPhotoFieldState,
} from "@/components/composer/CashPaidPhotoField";
import type { BusinessEntryType } from "@/domain/businessEntry";
import { spacing, typography, useThemedStyles } from "@/theme";
import { useT, useI18n } from "@/i18n";
import { todayStartMs } from "@/utils/date";
import { cashPaidDatePickerDates } from "@/utils/businessEntry/cashPaidDate";
import { parseINRInput } from "@/utils/money/inr";
import { normalizeEwayBillInput } from "@/utils/businessEntry/ewayBill";
import { formatINRWithWords, inrWordsLocaleFromLang } from "@/utils/money/inrWords";
import { firstComposerFieldError } from "@/utils/businessEntry/composerFieldOrder";
import { useFormFieldNavigation, useFormFocus } from "@/components/inputSafety/FormFocusManager";
import { COMPOSER_NAV_FIELD_ORDER } from "@/utils/formFieldNavigation/fieldNavOrders";
import {
  getSchemaForType,
  type DatePolicySchemaOptions,
} from "@/utils/businessEntry/validation";
import {
  getRecordDatePickerBounds,
  paymentRequestCreatedDateMs,
  type RecordDatePolicyId,
} from "@/services/recordDatePolicy";
import { useKeyboardAwareFieldScroll } from "@/hooks/useKeyboardAwareFieldScroll";
import { translateFormMessage } from "@/utils/i18n/translateFormMessage";
import type { EntryReminder } from "@/domain/types";

export interface ComposerFieldBindings {
  errorFor: (name: string) => string | undefined;
  /** Merge into TextField / smart inputs for keyboard scroll-on-focus. */
  fieldFocusProps: (name: string) => { onFocus: (e: unknown) => void };
  wrap: (name: string, node: React.ReactNode) => React.ReactNode;
}

function defaultFollowUpReminder(): EntryReminder {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return { at: d.getTime(), note: "", notificationId: null };
}

interface BusinessComposerFormProps {
  entryType: BusinessEntryType;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  saving: boolean;
  error?: string | null;
  initialValues?: Record<string, unknown>;
  linkedDispatchId?: string | null;
  scrollRef?: RefObject<ScrollView | null>;
  /** Debounced local autosave (SQLite) — screens wire useFormAutosave. */
  onValuesChange?: (values: Record<string, unknown>) => void;
  /** Edit mode: preserve legacy business dates when unchanged. */
  datePolicyOptions?: DatePolicySchemaOptions;
  /** @deprecated Prefer `datePolicyOptions.existingCashPaidDateMs`. */
  existingCashPaidDateMs?: number | null;
  /** Edit mode: show non-editable system `createdAt`. */
  recordCreatedAtMs?: number | null;
  /** Optional receipt photo for Cash Paid — handled on save in composer screen. */
  cashPaidPhoto?: {
    existingUri: string | null;
    state: CashPaidPhotoFieldState;
    onChange: (next: CashPaidPhotoFieldState) => void;
  };
}

export function BusinessComposerForm({
  entryType,
  onSubmit,
  saving,
  error,
  initialValues,
  linkedDispatchId,
  scrollRef,
  onValuesChange,
  datePolicyOptions,
  existingCashPaidDateMs,
  recordCreatedAtMs,
  cashPaidPhoto,
}: BusinessComposerFormProps) {
  const t = useT();
  const { lang } = useI18n();
  const amountLocale = inrWordsLocaleFromLang(lang);
  const [validationBanner, setValidationBanner] = useState<string | null>(null);
  const formRootRef = useRef<View>(null);
  const mergedDatePolicyOptions = useMemo<DatePolicySchemaOptions | undefined>(
    () => ({
      ...datePolicyOptions,
      existingCashPaidDateMs:
        datePolicyOptions?.existingCashPaidDateMs ?? existingCashPaidDateMs ?? undefined,
      recordCreatedAtMs: recordCreatedAtMs ?? todayStartMs(),
    }),
    [datePolicyOptions, existingCashPaidDateMs, recordCreatedAtMs]
  );

  const schema = useMemo(
    () => getSchemaForType(entryType, mergedDatePolicyOptions),
    [entryType, mergedDatePolicyOptions]
  );

  const pickerBounds = useCallback(
    (policyId: RecordDatePolicyId) => {
      if (policyId === "material_receipt_7d") {
        const anchor = recordCreatedAtMs ?? todayStartMs();
        return getRecordDatePickerBounds(policyId, new Date(anchor), {
          recordEntryAnchorMs: anchor,
        });
      }
      return getRecordDatePickerBounds(policyId);
    },
    [recordCreatedAtMs]
  );

  const cashDateBounds = useMemo(
    () => (entryType === "business_cash_given" ? cashPaidDatePickerDates() : null),
    [entryType]
  );

  const reminderDateBounds = useMemo(
    () => pickerBounds("reminder_future_3m"),
    [pickerBounds]
  );

  const freightBounds = useMemo(() => pickerBounds("freight_event"), [pickerBounds]);
  const supportingPastBounds = useMemo(
    () => pickerBounds("supporting_past_optional"),
    [pickerBounds]
  );
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      form: { gap: spacing.lg + 2 },
      hint: { ...typography.caption, color: c.textMuted },
      amountPreview: {
        ...typography.captionStrong,
        color: c.primaryDark,
        marginTop: -spacing.xs,
        marginBottom: spacing.md,
      },
    })
  );

  const defaultValues = useMemo(() => {
    const base: Record<string, unknown> = {
      title: "",
      entryDate: todayStartMs(),
      notes: null,
      reminder: null,
    };
    switch (entryType) {
      case "work_update_issue":
        return { ...base, workDone: "", issueProblem: "", sitePlace: "", followUpRequired: false };
      case "staff_matter":
        return { ...base, staffName: "", matterDetails: "", matterType: "other_note" };
      case "business_cash_given":
        return {
          ...base,
          amount: "",
          givenToName: "",
          receiverMobile: "",
          count500: "",
          count200: "",
          count100: "",
          count50: "",
          purpose: "",
          paymentDate: todayStartMs(),
        };
      case "material_dispatched":
      case "outward_freight_details":
        return {
          ...base,
          ...outwardMovementDefaultValues(linkedDispatchId),
          ...postalFormDefaults("dispatchFrom"),
          ...postalFormDefaults("deliveryTo"),
        };
      case "material_received":
        return {
          ...base,
          supplierName: "",
          materialName: "",
          quantity: "",
          unit: "",
          qualityStatus: "ok",
          issueNote: "",
          receivedLocation: "",
          dispatchFromLocation: "",
          ewayBillNumber: "",
          ...postalFormDefaults("dispatchFrom"),
          ...postalFormDefaults("receivedAt"),
          ...postalFormDefaults("party"),
        };
      case "payment_request":
        return {
          ...base,
          entryDate: paymentRequestCreatedDateMs(),
          partyName: "",
          invoiceNumber: "",
          pendingAmount: "",
          invoiceDate: null,
          dueDate: null,
          contactPerson: "",
          requestNote: "",
          includeBankDetailsInPdf: false,
          includePaymentPeriodInPdf: false,
          bankAccountHolder: "",
          bankName: "",
          bankAccountNumber: "",
          bankIfsc: "",
          bankUpiId: "",
          bankPaymentInstruction: "",
          ...postalFormDefaults("party"),
        };
      case "material_return":
        return {
          ...base,
          partyName: "",
          materialName: "",
          quantity: "",
          unit: "",
          returnReason: "",
          fromLocation: "",
          toLocation: "",
          ...postalFormDefaults("dispatchFrom"),
          ...postalFormDefaults("deliveryTo"),
        };
      default:
        return base;
    }
  }, [entryType, linkedDispatchId]);

  const mergedDefaults = useMemo(
    () => ({ ...defaultValues, ...initialValues }),
    [defaultValues, initialValues]
  );

  const { control, handleSubmit, formState: { errors }, setValue, watch, getValues, reset } =
    useForm<Record<string, unknown>>({
      defaultValues: mergedDefaults,
      resolver: schema ? (zodResolver(schema) as never) : undefined,
      mode: "onChange",
    });

  useEffect(() => {
    reset(mergedDefaults);
  }, [mergedDefaults, reset]);

  useEffect(() => {
    if (entryType === "payment_request" && !recordCreatedAtMs) {
      setValue("entryDate", paymentRequestCreatedDateMs(), { shouldValidate: false });
    }
  }, [entryType, setValue, recordCreatedAtMs]);

  useEffect(() => {
    if (!onValuesChange) return;
    const sub = watch((values) => {
      onValuesChange(values as Record<string, unknown>);
    });
    return () => sub.unsubscribe();
  }, [watch, onValuesChange]);

  const cashAmountRaw = useWatch({
    control,
    name: "amount",
    disabled: entryType !== "business_cash_given",
  });
  const parsedCashAmount =
    entryType === "business_cash_given" ? parseINRInput(cashAmountRaw) : null;

  const { registerAnchor, scrollToField, focusHandlersForField } = useKeyboardAwareFieldScroll({
    scrollRef,
    contentRef: formRootRef,
    enabled: Boolean(scrollRef),
  });

  const composerNavOrder = COMPOSER_NAV_FIELD_ORDER[entryType] ?? [];
  useFormFieldNavigation(composerNavOrder);
  const formFocus = useFormFocus();

  const fieldBindings = useMemo<ComposerFieldBindings>(
    () => ({
      errorFor: (name) => {
        const err = errors[name];
        if (!err || typeof err !== "object" || !("message" in err)) return undefined;
        const raw = String((err as { message?: unknown }).message ?? "");
        return translateFormMessage(t, raw);
      },
      fieldFocusProps: (name) => focusHandlersForField(name),
      wrap: (name, node) => (
        <View key={`wrap-${name}`} ref={(r) => registerAnchor(name, r)}>
          {node}
        </View>
      ),
    }),
    [errors, registerAnchor, focusHandlersForField, t]
  );

  const onInvalid = useCallback(
    (invalidErrors: typeof errors) => {
      const first = firstComposerFieldError(entryType, invalidErrors);
      if (first) {
        const bannerMsg = translateFormMessage(t, first.message);
        setValidationBanner(bannerMsg);
        requestAnimationFrame(() => {
          scrollToField(first.name, { reveal: true });
          formFocus?.focusField(first.name);
        });
      } else {
        setValidationBanner(t("composer.fixFields"));
      }
    },
    [entryType, scrollToField, formFocus, t, getValues, existingCashPaidDateMs]
  );

  const followUpRequired = useWatch({ control, name: "followUpRequired" });
  const qualityStatus = useWatch({ control, name: "qualityStatus" });
  const requestEntryDate = useWatch({ control, name: "entryDate" });

  const policyDateField = (
    name: string,
    label: string,
    policyId: RecordDatePolicyId,
    hint?: string
  ) => {
    const bounds = pickerBounds(policyId);
    return fieldBindings.wrap(
      name,
      <View>
        <ComposerDateField
          control={control}
          name={name}
          label={label}
          errors={errors}
          errorMessage={fieldBindings.errorFor(name)}
          minimumDate={bounds?.minimumDate}
          maximumDate={bounds?.maximumDate}
        />
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    );
  };

  const field = (name: string, label: string, opts?: { multiline?: boolean; keyboard?: "numeric" }) => {
    const masterKey = masterKeyForFormField(name);
    const useSmart = masterKey && !opts?.multiline;
    const focusProps = fieldBindings.fieldFocusProps(name);
    return fieldBindings.wrap(
      name,
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, value } }) =>
          useSmart ? (
            <ComposerSmartTextField
              name={name}
              fieldKey={masterKey}
              label={label}
              value={value == null ? "" : String(value)}
              onChangeText={onChange}
              keyboardType={opts?.keyboard === "numeric" ? "numeric" : "default"}
              error={fieldBindings.errorFor(name)}
              multiline={opts?.multiline}
              {...focusProps}
            />
          ) : (
            <TextField
              navFieldKey={name}
              label={label}
              value={value == null ? "" : String(value)}
              onChangeText={onChange}
              multiline={opts?.multiline}
              keyboardType={opts?.keyboard === "numeric" ? "numeric" : "default"}
              error={fieldBindings.errorFor(name)}
              {...focusProps}
            />
          )
        }
      />
    );
  };

  const renderFields = () => {
    switch (entryType) {
      case "work_update_issue":
        return (
          <>
            {policyDateField(
              "entryDate",
              t("composer.eventDate"),
              "event_past_15",
              t("datePolicy.hints.eventPast15")
            )}
            {field("workDone", t("composer.workDone"), { multiline: true })}
            {field("issueProblem", t("composer.followUpNote"), { multiline: true })}
            {field("sitePlace", t("composer.sitePlace"))}
            <Controller
              control={control}
              name="followUpRequired"
              render={({ field: { value, onChange } }) => (
                <IndigoChoiceChip
                  label={t("composer.followUpRequired")}
                  selected={Boolean(value)}
                  onPress={() => onChange(!value)}
                />
              )}
            />
            {followUpRequired ? (
              <ReminderFields
                control={control}
                errors={errors}
                required
                minimumDate={reminderDateBounds?.minimumDate}
                maximumDate={reminderDateBounds?.maximumDate}
              />
            ) : null}
          </>
        );
      case "staff_matter":
        return (
          <>
            <LocaleUiText style={styles.hint}>{t("composer.staffFormLead")}</LocaleUiText>
            {recordCreatedAtMs ? (
              <ComposerRecordedOnField recordedAtMs={recordCreatedAtMs} />
            ) : (
              <LocaleUiText style={styles.hint}>{t("composer.recordedOnPending")}</LocaleUiText>
            )}
            {policyDateField(
              "entryDate",
              t("composer.staffEventDate"),
              "event_past_15",
              t("composer.staffEventDateHint")
            )}
            {field("staffName", t("composer.staffName"))}
            {field("matterDetails", t("composer.matterDetails"), { multiline: true })}
          </>
        );
      case "business_cash_given":
        return (
          <>
            <LocaleUiText style={styles.hint}>{t("composer.cashOnlyHint")}</LocaleUiText>
            {recordCreatedAtMs ? (
              <ComposerRecordedOnField recordedAtMs={recordCreatedAtMs} />
            ) : (
              <LocaleUiText style={styles.hint}>{t("composer.recordedOnPending")}</LocaleUiText>
            )}
            {fieldBindings.wrap(
              "paymentDate",
              <ComposerDateField
                control={control}
                name="paymentDate"
                label={t("composer.cashPaidDate")}
                errors={errors}
                errorMessage={fieldBindings.errorFor("paymentDate")}
                minimumDate={cashDateBounds?.minimumDate}
                maximumDate={cashDateBounds?.maximumDate}
              />
            )}
            <LocaleUiText style={styles.hint}>{t("composer.cashPaidDateHint")}</LocaleUiText>
            {fieldBindings.wrap(
              "amount",
              <Controller
                control={control}
                name="amount"
                render={({ field: { onChange, value } }) => (
                  <TextField
                    label={t("composer.amount")}
                    value={value == null ? "" : String(value)}
                    onChangeText={onChange}
                    keyboardType="numeric"
                    error={fieldBindings.errorFor("amount")}
                  />
                )}
              />
            )}
            {parsedCashAmount != null ? (
              <Text style={styles.amountPreview}>
                {t("composer.amountPreview", {
                  amount: formatINRWithWords(parsedCashAmount, amountLocale),
                })}
              </Text>
            ) : null}
            {fieldBindings.wrap(
              "givenToName",
              <Controller
                control={control}
                name="givenToName"
                render={({ field: { onChange, value } }) => (
                  <ComposerSmartTextField
                    name="givenToName"
                    label={t("composer.givenToName")}
                    value={value == null ? "" : String(value)}
                    onChangeText={onChange}
                    error={fieldBindings.errorFor("givenToName")}
                  />
                )}
              />
            )}
            {fieldBindings.wrap(
              "receiverMobile",
              <Controller
                control={control}
                name="receiverMobile"
                render={({ field: { onChange, value } }) => (
                  <TextField
                    label={t("cashPaid.receiverMobile.label")}
                    placeholder={t("cashPaid.receiverMobile.placeholder")}
                    value={value == null ? "" : String(value)}
                    onChangeText={onChange}
                    keyboardType="phone-pad"
                    error={fieldBindings.errorFor("receiverMobile")}
                  />
                )}
              />
            )}
            <LocaleUiText style={styles.hint}>{t("cashPaid.receiverMobile.helper")}</LocaleUiText>
            {cashPaidPhoto ? (
              <CashPaidPhotoField
                existingUri={cashPaidPhoto.existingUri}
                state={cashPaidPhoto.state}
                onChange={cashPaidPhoto.onChange}
              />
            ) : null}
            {fieldBindings.wrap(
              "purpose",
              <Controller
                control={control}
                name="purpose"
                render={({ field: { onChange, value } }) => (
                  <TextField
                    label={t("composer.purpose")}
                    value={value == null ? "" : String(value)}
                    onChangeText={onChange}
                    multiline
                    error={fieldBindings.errorFor("purpose")}
                  />
                )}
              />
            )}
          </>
        );
      case "material_dispatched":
      case "outward_freight_details":
        return (
          <OutwardMovementFields
            control={control}
            fields={fieldBindings}
            setValue={setValue}
            getValues={getValues}
            linkedDispatchId={linkedDispatchId}
            movementDateBounds={freightBounds ?? undefined}
            policyDateField={policyDateField}
          />
        );
      case "payment_request":
        return (
          <>
            <ComposerRecordedOnField
              recordedAtMs={
                typeof requestEntryDate === "number" && requestEntryDate > 0
                  ? requestEntryDate
                  : paymentRequestCreatedDateMs()
              }
              label={t("composer.paymentRequestDate")}
              hint={t("datePolicy.hints.paymentRequestToday")}
            />
            {recordCreatedAtMs ? (
              <ComposerRecordedOnField recordedAtMs={recordCreatedAtMs} />
            ) : null}
            <PaymentRequestFields
              control={control}
              fields={fieldBindings}
              setValue={setValue}
              getValues={getValues}
              supportingDateBounds={supportingPastBounds ?? undefined}
            />
          </>
        );
      case "material_return":
        return (
          <>
            {policyDateField(
              "entryDate",
              t("composer.movementDate"),
              "event_past_15",
              t("datePolicy.hints.materialEvent")
            )}
            {field("partyName", t("composer.partyOrSupplier"))}
            {field("materialName", t("composer.materialName"))}
            {field("quantity", t("composer.quantity"), { keyboard: "numeric" })}
            {field("unit", t("composer.unit"))}
            {field("returnReason", t("composer.returnReason"), { multiline: true })}
            <PostalLocationSection
              prefix="dispatchFrom"
              pinLabel={t("postal.fromPin")}
              manualLocationLabel={t("postal.manualFrom")}
              control={control}
              setValue={setValue}
              getValues={getValues}
              fields={fieldBindings}
              legacyLocationField="fromLocation"
              required
            />
            <PostalLocationSection
              prefix="deliveryTo"
              pinLabel={t("postal.toPin")}
              manualLocationLabel={t("postal.manualTo")}
              control={control}
              setValue={setValue}
              getValues={getValues}
              fields={fieldBindings}
              legacyLocationField="toLocation"
              required
            />
            {field("lrGrNumber", t("composer.lrGrNumber"))}
            {field("transporter", t("composer.transporter"))}
            {field("vehicleNumber", t("composer.vehicleNumber"))}
            {field("remarks", t("composer.remarks"), { multiline: true })}
          </>
        );
      case "material_received":
        return (
          <>
            {recordCreatedAtMs ? (
              <ComposerRecordedOnField recordedAtMs={recordCreatedAtMs} />
            ) : null}
            {policyDateField(
              "entryDate",
              t("composer.receiptDate"),
              "material_receipt_7d",
              t("datePolicy.hints.materialReceipt7d")
            )}
            {field("supplierName", t("composer.supplierName"))}
            {field("materialName", t("composer.materialName"))}
            {field("quantity", t("composer.quantity"), { keyboard: "numeric" })}
            {field("unit", t("composer.unit"))}
            <PostalLocationSection
              prefix="dispatchFrom"
              pinLabel={t("postal.goodsMovedFromPin")}
              manualLocationLabel={t("postal.manualFrom")}
              control={control}
              setValue={setValue}
              getValues={getValues}
              fields={fieldBindings}
              legacyLocationField="dispatchFromLocation"
              required
            />
            <PostalLocationSection
              prefix="receivedAt"
              pinLabel={t("postal.receivedAtPin")}
              manualLocationLabel={t("postal.manualReceivedAt")}
              control={control}
              setValue={setValue}
              getValues={getValues}
              fields={fieldBindings}
              legacyLocationField="receivedLocation"
              required
            />
            {fieldBindings.wrap(
              "ewayBillNumber",
              <Controller
                control={control}
                name="ewayBillNumber"
                render={({ field: { onChange, value } }) => (
                  <TextField
                    navFieldKey="ewayBillNumber"
                    label={t("materialMovement.ewayBillLabel")}
                    placeholder={t("common.optional")}
                    value={value == null ? "" : String(value)}
                    onChangeText={(text) => onChange(normalizeEwayBillInput(text))}
                    keyboardType="number-pad"
                    maxLength={12}
                    error={fieldBindings.errorFor("ewayBillNumber")}
                  />
                )}
              />
            )}
            <PostalLocationSection
              prefix="party"
              pinLabel={t("postal.supplierPinOptional")}
              control={control}
              setValue={setValue}
              getValues={getValues}
              fields={fieldBindings}
            />
            <IndigoChoiceChipRow>
              <IndigoChoiceChip
                label={t("composer.qualityOk")}
                selected={qualityStatus === "ok"}
                onPress={() => {
                  setValue("qualityStatus", "ok");
                  setValue("issueNote", "");
                }}
              />
              <IndigoChoiceChip
                label={t("composer.qualityIssue")}
                selected={qualityStatus !== "ok"}
                onPress={() => setValue("qualityStatus", "damaged")}
              />
            </IndigoChoiceChipRow>
            {qualityStatus !== "ok"
              ? field("issueNote", t("composer.issueNote"), { multiline: true })
              : null}
          </>
        );
      case "reminder_purchase":
        return (
          <>
            {field("itemMaterial", t("composer.itemMaterial"))}
            <ReminderFields
              control={control}
              errors={errors}
              required
              minimumDate={reminderDateBounds?.minimumDate}
              maximumDate={reminderDateBounds?.maximumDate}
            />
          </>
        );
      case "reminder_email":
        return (
          <>
            {field("purposeSubject", t("composer.purposeSubject"))}
            <ReminderFields
              control={control}
              errors={errors}
              required
              minimumDate={reminderDateBounds?.minimumDate}
              maximumDate={reminderDateBounds?.maximumDate}
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <View ref={formRootRef} style={styles.form}>
      {error ? <Banner tone="danger" message={error} /> : null}
      {validationBanner ? <Banner tone="warning" message={validationBanner} /> : null}
      <PremiumCard elevated={false}>{renderFields()}</PremiumCard>
      <Button
        label={saving ? t("common.loading") : t("common.save")}
        loading={saving}
        disabled={saving}
        onPress={handleSubmit(
          (v) => {
            setValidationBanner(null);
            return onSubmit(v as Record<string, unknown>);
          },
          onInvalid
        )}
      />
    </View>
  );
}
