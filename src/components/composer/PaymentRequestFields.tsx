import React, { useCallback, useEffect, useRef, useState } from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import type { Control, UseFormGetValues, UseFormSetValue } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";

import type { ComposerFieldBindings } from "@/components/composer/BusinessComposerForm";
import { PostalLocationSection } from "@/components/composer/PostalLocationSection";
import { ComposerDateField } from "@/components/composer/ComposerDateField";
import { ComposerSmartTextField } from "@/components/composer/ComposerSmartTextField";
import { masterKeyForFormField } from "@/services/masterData";
import { FormField } from "@/components/ui/FormField";
import { IndigoChoiceChip, IndigoChoiceChipRow } from "@/components/ui/IndigoChoiceChip";
import { premiumElevation } from "@/components/ui/premiumTokens";
import { radius, spacing, typography, useTheme, useThemedStyles } from "@/theme";
import { useT, useI18n } from "@/i18n";
import { buildAutoPaymentRequestNote } from "@/utils/businessEntry/paymentRequestNote";
import {
  formatPaymentPeriodHelper,
  isPaymentPeriodInvalid,
} from "@/utils/businessEntry/paymentPeriod";
import { normalizeIfscInput } from "@/utils/businessEntry/paymentBankDetails";
import { parseINRInput } from "@/utils/money/inr";
import { formatINRWithWords, inrWordsLocaleFromLang } from "@/utils/money/inrWords";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface PaymentRequestFieldsProps {
  control: Control<Record<string, unknown>>;
  fields: ComposerFieldBindings;
  setValue: UseFormSetValue<Record<string, unknown>>;
  getValues: UseFormGetValues<Record<string, unknown>>;
  supportingDateBounds?: { minimumDate: Date; maximumDate: Date };
}

const BANK_FIELD_KEYS = [
  "bankAccountHolder",
  "bankName",
  "bankAccountNumber",
  "bankIfsc",
  "bankUpiId",
  "bankPaymentInstruction",
] as const;

export function PaymentRequestFields({
  control,
  fields,
  setValue,
  getValues,
  supportingDateBounds,
}: PaymentRequestFieldsProps) {
  const t = useT();
  const { lang } = useI18n();
  const amountLocale = inrWordsLocaleFromLang(lang);
  const [showPartyLocation, setShowPartyLocation] = useState(false);
  const lastAutoNoteRef = useRef<string | null>(null);
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      hint: { ...typography.caption, color: c.textMuted, marginBottom: spacing.md },
      toggleRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
      toggle: {
        paddingVertical: 8,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: c.divider,
        backgroundColor: c.surfaceMuted,
      },
      toggleOn: { borderColor: c.primary, backgroundColor: c.primaryLight },
      toggleText: { ...typography.captionStrong, color: c.text },
      toggleTextOn: { color: c.primaryDark },
      bankPanel: {
        marginTop: spacing.md,
        marginBottom: spacing.sm,
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: c.surfaceElevated,
        borderWidth: 1,
        borderColor: c.divider,
        gap: spacing.md,
        ...premiumElevation(isDark, c, "soft"),
      },
      bankHeading: { ...typography.bodyStrong, color: c.text },
      bankHelper: {
        ...typography.caption,
        color: c.textMuted,
        lineHeight: 18,
        marginBottom: spacing.xs,
      },
      amountPreview: {
        ...typography.captionStrong,
        color: c.primaryDark,
        marginTop: -spacing.xs,
        marginBottom: spacing.md,
      },
      noteLabelRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.sm,
        marginBottom: spacing.xs,
      },
      noteLabel: { ...typography.captionStrong, color: c.textMuted, flex: 1 },
      regenTab: {
        paddingVertical: 4,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.sm,
        backgroundColor: c.primaryLight,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.primary,
      },
      regenTabDisabled: { opacity: 0.4 },
      regenTabText: { ...typography.captionStrong, color: c.primaryDark, fontSize: 11 },
      periodHelper: {
        ...typography.captionStrong,
        color: c.primaryDark,
        marginTop: -spacing.xs,
        marginBottom: spacing.sm,
      },
      periodError: {
        ...typography.caption,
        color: c.danger,
        marginTop: -spacing.xs,
        marginBottom: spacing.sm,
      },
      periodToggleRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.sm,
        marginBottom: spacing.md,
      },
      periodToggleLabel: { ...typography.caption, color: c.textMuted, flex: 1 },
    })
  );

  const partyName = useWatch({ control, name: "partyName" });
  const invoiceNumber = useWatch({ control, name: "invoiceNumber" });
  const pendingAmount = useWatch({ control, name: "pendingAmount" });
  const requestNote = useWatch({ control, name: "requestNote" });
  const includeBank = useWatch({ control, name: "includeBankDetailsInPdf" });
  const includePaymentPeriod = useWatch({ control, name: "includePaymentPeriodInPdf" });
  const invoiceDate = useWatch({ control, name: "invoiceDate" });
  const dueDate = useWatch({ control, name: "dueDate" });
  const periodLocale = lang === "hi" ? "hi" : "en";
  const invoiceMs =
    invoiceDate == null || invoiceDate === "" ? null : Number(invoiceDate);
  const dueMs = dueDate == null || dueDate === "" ? null : Number(dueDate);
  const periodInvalid =
    invoiceMs != null && dueMs != null && isPaymentPeriodInvalid(invoiceMs, dueMs);
  const periodHelper =
    !periodInvalid && invoiceMs != null && dueMs != null
      ? formatPaymentPeriodHelper(invoiceMs, dueMs, periodLocale)
      : null;

  const parsedPending = parseINRInput(pendingAmount);

  const canRegenerateRequestNote =
    String(partyName ?? "").trim().length > 0 &&
    String(invoiceNumber ?? "").trim().length > 0 &&
    parsedPending != null;

  const regenerateRequestNote = useCallback(() => {
    const party = String(partyName ?? "").trim();
    const inv = String(invoiceNumber ?? "").trim();
    if (!party || !inv || parsedPending == null) return;
    const next = buildAutoPaymentRequestNote({
      partyName: party,
      invoiceNumber: inv,
      pendingAmount: parsedPending,
      locale: amountLocale,
    });
    lastAutoNoteRef.current = next;
    setValue("requestNote", next, { shouldDirty: true });
  }, [partyName, invoiceNumber, parsedPending, amountLocale, setValue]);

  useEffect(() => {
    const party = String(partyName ?? "").trim();
    const inv = String(invoiceNumber ?? "").trim();
    if (!party || !inv || parsedPending == null) return;

    const next = buildAutoPaymentRequestNote({
      partyName: party,
      invoiceNumber: inv,
      pendingAmount: parsedPending,
      locale: amountLocale,
    });
    const current = String(requestNote ?? "").trim();
    if (current !== "" && current !== lastAutoNoteRef.current) return;

    lastAutoNoteRef.current = next;
    setValue("requestNote", next, { shouldDirty: true });
  }, [partyName, invoiceNumber, parsedPending, requestNote, setValue, amountLocale]);

  useEffect(() => {
    if (includeBank) return;
    for (const key of BANK_FIELD_KEYS) {
      setValue(key, key === "bankPaymentInstruction" ? "" : "");
    }
  }, [includeBank, setValue]);

  useEffect(() => {
    if (periodInvalid || invoiceMs == null || dueMs == null) {
      if (includePaymentPeriod) {
        setValue("includePaymentPeriodInPdf", false);
      }
    }
  }, [periodInvalid, invoiceMs, dueMs, includePaymentPeriod, setValue]);

  const animateBankPanel = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const field = (
    name: string,
    label: string,
    opts?: {
      multiline?: boolean;
      keyboard?: "numeric" | "default";
      placeholder?: string;
      autoCapitalize?: "none" | "words" | "characters";
      onChangeText?: (text: string) => string;
    }
  ) => {
    const masterKey = masterKeyForFormField(name);
    const useSmart = masterKey && !opts?.multiline;
    const FieldComponent = useSmart ? ComposerSmartTextField : FormField;
    return fields.wrap(
      name,
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, value } }) => (
          <FieldComponent
            {...(useSmart ? { name, fieldKey: masterKey } : {})}
            label={label}
            placeholder={opts?.placeholder}
            value={value == null ? "" : String(value)}
            onChangeText={(text: string) => {
              const next = opts?.onChangeText ? opts.onChangeText(text) : text;
              onChange(next);
            }}
            multiline={opts?.multiline}
            keyboardType={opts?.keyboard === "numeric" ? "number-pad" : "default"}
            autoCapitalize={opts?.autoCapitalize ?? "sentences"}
            autoCorrect={false}
            error={fields.errorFor(name)}
          />
        )}
      />
    );
  };

  return (
    <View>
      <LocaleUiText style={styles.hint}>{t("composer.paymentRequestDisclaimer")}</LocaleUiText>
      {field("partyName", t("composer.partyName"), {
        placeholder: t("composer.partyNamePlaceholder"),
      })}
      {field("invoiceNumber", t("composer.invoiceNumber"), {
        placeholder: t("composer.invoiceNumberPlaceholder"),
      })}
      {field("pendingAmount", t("composer.pendingAmount"), {
        keyboard: "numeric",
        placeholder: t("composer.pendingAmountPlaceholder"),
      })}
      {parsedPending != null ? (
        <Text style={styles.amountPreview}>
          {t("composer.amountPreview", {
            amount: formatINRWithWords(parsedPending, amountLocale),
          })}
        </Text>
      ) : null}
      {fields.wrap(
        "invoiceDate",
        <ComposerDateField
          control={control}
          name="invoiceDate"
          label={t("composer.invoiceDateOptional")}
          errorMessage={fields.errorFor("invoiceDate")}
          minimumDate={supportingDateBounds?.minimumDate}
          maximumDate={supportingDateBounds?.maximumDate}
        />
      )}
      {fields.wrap(
        "dueDate",
        <ComposerDateField
          control={control}
          name="dueDate"
          label={t("composer.dueDateOptional")}
          errorMessage={fields.errorFor("dueDate")}
          minimumDate={supportingDateBounds?.minimumDate}
          maximumDate={supportingDateBounds?.maximumDate}
        />
      )}
      {periodInvalid ? (
        <LocaleUiText style={styles.periodError}>{t("composer.paymentPeriodDueBeforeInvoice")}</LocaleUiText>
      ) : periodHelper ? (
        <Text style={styles.periodHelper}>{periodHelper}</Text>
      ) : null}
      {invoiceMs != null && dueMs != null && !periodInvalid ? (
        fields.wrap(
          "includePaymentPeriodInPdf",
          <View style={styles.periodToggleRow}>
            <LocaleUiText style={styles.periodToggleLabel}>
              {t("composer.includePaymentPeriodOnPdf")}
            </LocaleUiText>
            <Controller
              control={control}
              name="includePaymentPeriodInPdf"
              render={({ field: { value, onChange } }) => (
                <IndigoChoiceChipRow>
                  <IndigoChoiceChip
                    label={t("common.no")}
                    selected={value === false}
                    onPress={() => onChange(false)}
                  />
                  <IndigoChoiceChip
                    label={t("common.yes")}
                    selected={value === true}
                    onPress={() => onChange(true)}
                  />
                </IndigoChoiceChipRow>
              )}
            />
          </View>
        )
      ) : null}
      {field("contactPerson", t("composer.contactPersonOptional"), {
        placeholder: t("composer.contactPersonPlaceholder"),
      })}
      {fields.wrap(
        "requestNote",
        <View>
          <View style={styles.noteLabelRow}>
            <LocaleUiText style={styles.noteLabel}>{t("composer.requestNoteEditable")}</LocaleUiText>
            <Pressable
              onPress={regenerateRequestNote}
              disabled={!canRegenerateRequestNote}
              style={[styles.regenTab, !canRegenerateRequestNote && styles.regenTabDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t("composer.regenerateRequestNoteA11y")}
            >
              <LocaleUiText style={styles.regenTabText}>{t("composer.regenerateRequestNote")}</LocaleUiText>
            </Pressable>
          </View>
          <Controller
            control={control}
            name="requestNote"
            render={({ field: { onChange, value } }) => (
              <FormField
                value={value == null ? "" : String(value)}
                onChangeText={onChange}
                multiline
                placeholder={t("composer.requestNotePlaceholder")}
                autoCorrect={false}
                error={fields.errorFor("requestNote")}
                {...fields.fieldFocusProps("requestNote")}
              />
            )}
          />
        </View>
      )}

      <LocaleUiText style={[styles.hint, { marginTop: spacing.md }]}>
        {t("composer.addBankDetailsQuestion")}
      </LocaleUiText>
      {fields.wrap(
        "includeBankDetailsInPdf",
        <Controller
          control={control}
          name="includeBankDetailsInPdf"
          render={({ field: { value, onChange } }) => (
            <IndigoChoiceChipRow style={{ marginBottom: spacing.sm }}>
              <IndigoChoiceChip
                label={t("common.no")}
                selected={value === false}
                onPress={() => {
                  animateBankPanel();
                  onChange(false);
                }}
              />
              <IndigoChoiceChip
                label={t("common.yes")}
                selected={value === true}
                onPress={() => {
                  animateBankPanel();
                  onChange(true);
                }}
              />
            </IndigoChoiceChipRow>
          )}
        />
      )}

      {includeBank ? (
        <View style={styles.bankPanel}>
          <LocaleUiText style={styles.bankHeading}>{t("composer.bankDetailsHeading")}</LocaleUiText>
          <LocaleUiText style={styles.bankHelper}>{t("composer.bankDetailsHelper")}</LocaleUiText>
          {field("bankAccountHolder", t("composer.bankAccountHolder"), {
            placeholder: t("composer.bankAccountHolderPlaceholder"),
            autoCapitalize: "words",
          })}
          {field("bankName", t("composer.bankName"), {
            placeholder: t("composer.bankNamePlaceholder"),
            autoCapitalize: "words",
          })}
          {field("bankAccountNumber", t("composer.bankAccountNumber"), {
            keyboard: "numeric",
            placeholder: t("composer.bankAccountNumberPlaceholder"),
            onChangeText: (text) => text.replace(/\D/g, ""),
          })}
          {field("bankIfsc", t("composer.bankIfsc"), {
            placeholder: t("composer.bankIfscPlaceholder"),
            autoCapitalize: "characters",
            onChangeText: normalizeIfscInput,
          })}
          {field("bankUpiId", t("composer.bankUpiOptional"), {
            placeholder: t("composer.bankUpiPlaceholder"),
            autoCapitalize: "none",
          })}
          {field("bankPaymentInstruction", t("composer.bankPaymentInstructionOptional"), {
            multiline: true,
            placeholder: t("composer.bankPaymentInstructionPlaceholder"),
          })}
        </View>
      ) : null}

      <IndigoChoiceChip
        label={t("postal.paymentPartyToggle")}
        selected={showPartyLocation}
        onPress={() => {
          animateBankPanel();
          setShowPartyLocation((v) => !v);
        }}
        style={{ marginTop: spacing.md }}
      />
      {showPartyLocation ? (
        <PostalLocationSection
          prefix="party"
          pinLabel={t("postal.partyPinOptional")}
          manualLocationLabel={t("postal.manualPartyLocation")}
          control={control}
          setValue={setValue}
          getValues={getValues}
          fields={fields}
        />
      ) : null}
    </View>
  );
}
