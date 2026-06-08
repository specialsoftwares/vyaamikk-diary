import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Control, UseFormGetValues, UseFormSetValue } from "react-hook-form";
import { Controller } from "react-hook-form";

import type { ComposerFieldBindings } from "@/components/composer/BusinessComposerForm";
import { ComposerDateField } from "@/components/composer/ComposerDateField";
import { PostalLocationSection } from "@/components/composer/PostalLocationSection";
import { ComposerSmartTextField } from "@/components/composer/ComposerSmartTextField";
import { masterKeyForFormField } from "@/services/masterData";
import { IndigoChoiceChip, IndigoChoiceChipRow, TextField, LocaleUiText } from "@/components/ui";
import { formSectionTitleStyle } from "@/theme/formLayer";
import type { CcCopyInstruction, FreightType } from "@/domain/businessEntry";
import { spacing, typography, useThemedStyles } from "@/theme";
import { useT } from "@/i18n";
const FREIGHT_TYPES: FreightType[] = ["to_pay", "paid", "tbb", "other"];
const CC_OPTIONS: CcCopyInstruction[] = ["attach", "not_attached", "not_applicable"];

interface OutwardFreightFieldsProps {
  control: Control<Record<string, unknown>>;
  fields: ComposerFieldBindings;
  setValue: UseFormSetValue<Record<string, unknown>>;
  getValues: UseFormGetValues<Record<string, unknown>>;
  linkedDispatchId?: string | null;
  freightDateBounds?: { minimumDate: Date; maximumDate: Date };
}

export function OutwardFreightFields({
  control,
  fields,
  setValue,
  getValues,
  linkedDispatchId,
  freightDateBounds,
}: OutwardFreightFieldsProps) {
  const t = useT();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      hint: { ...typography.caption, color: c.textMuted, marginBottom: spacing.md },
      linkBanner: {
        backgroundColor: c.primaryLight,
        padding: spacing.md,
        borderRadius: 12,
        marginBottom: spacing.md,
      },
      linkText: { ...typography.caption, color: c.primaryDark },
      section: {
        ...formSectionTitleStyle(c),
        marginTop: spacing.sm,
        marginBottom: spacing.xs,
      },
    })
  );

  const field = (name: string, label: string, opts?: { multiline?: boolean; keyboard?: "numeric" }) => {
    const masterKey = masterKeyForFormField(name);
    const useSmart = masterKey && !opts?.multiline;
    const Input = useSmart ? ComposerSmartTextField : TextField;
    return fields.wrap(
      name,
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, value } }) => (
          <Input
            {...(useSmart ? { name, fieldKey: masterKey } : {})}
            label={label}
            value={value == null ? "" : String(value)}
            onChangeText={onChange}
            multiline={opts?.multiline}
            keyboardType={opts?.keyboard === "numeric" ? "numeric" : "default"}
            containerStyle={{ marginBottom: spacing.sm }}
            error={fields.errorFor(name)}
          />
        )}
      />
    );
  };

  return (
    <View>
      {linkedDispatchId ? (
        <View style={styles.linkBanner}>
          <LocaleUiText style={styles.linkText}>{t("composer.freightLinkedDispatch")}</LocaleUiText>
        </View>
      ) : null}
      <LocaleUiText style={styles.hint}>{t("composer.freightDisclaimer")}</LocaleUiText>
      {field("dispatchTitle", t("composer.dispatchTitleOptional"))}
      {field("billNumber", t("composer.billNumber"))}
      {fields.wrap(
        "billDate",
        <ComposerDateField
          control={control}
          name="billDate"
          label={t("composer.freightDateOptional")}
          errorMessage={fields.errorFor("billDate")}
          minimumDate={freightDateBounds?.minimumDate}
          maximumDate={freightDateBounds?.maximumDate}
        />
      )}
      {field("lrGrNumber", t("composer.lrGrNumberOptional"))}

      <PostalLocationSection
        prefix="dispatchFrom"
        pinLabel={t("postal.fromPinOptional")}
        manualLocationLabel={t("postal.manualFrom")}
        control={control}
        setValue={setValue}
        getValues={getValues}
        fields={fields}
        legacyLocationField="dispatchFromLocation"
      />
      <PostalLocationSection
        prefix="deliveryTo"
        pinLabel={t("postal.toPin")}
        manualLocationLabel={t("postal.manualTo")}
        control={control}
        setValue={setValue}
        getValues={getValues}
        fields={fields}
        legacyLocationField="deliveryLocation"
        required
      />

      {field("totalBoxes", t("composer.totalBoxes"), { keyboard: "numeric" })}
      {field("totalWeight", t("composer.totalWeight"), { keyboard: "numeric" })}
      {field("weightUnit", t("composer.weightUnitOptional"))}
      <LocaleUiText style={styles.section}>{t("composer.freightType")}</LocaleUiText>
      {fields.wrap(
        "freightType",
        <Controller
          control={control}
          name="freightType"
          render={({ field: { value, onChange } }) => (
            <IndigoChoiceChipRow style={{ marginBottom: spacing.md }}>
              {FREIGHT_TYPES.map((ft) => (
                <IndigoChoiceChip
                  key={ft}
                  label={t(`composer.freightTypes.${ft}`)}
                  selected={value === ft}
                  onPress={() => onChange(ft)}
                />
              ))}
            </IndigoChoiceChipRow>
          )}
        />
      )}
      {field("transporterName", t("composer.transporterOptional"))}
      {field("vehicleNumber", t("composer.vehicleNumberOptional"))}
      <LocaleUiText style={styles.section}>{t("composer.ccCopySection")}</LocaleUiText>
      {fields.wrap(
        "ccCopyInstruction",
        <Controller
          control={control}
          name="ccCopyInstruction"
          render={({ field: { value, onChange } }) => (
            <IndigoChoiceChipRow style={{ marginBottom: spacing.md }}>
              {CC_OPTIONS.map((cc) => (
                <IndigoChoiceChip
                  key={cc}
                  label={t(`composer.ccCopy.${cc}`)}
                  selected={value === cc}
                  onPress={() => onChange(cc)}
                />
              ))}
            </IndigoChoiceChipRow>
          )}
        />
      )}
      {field("clarificationContactName", t("composer.clarificationName"))}
      {field("clarificationContactMobile", t("composer.clarificationMobile"), {
        keyboard: "numeric",
      })}
      {field("remarks", t("composer.remarksOptional"), { multiline: true })}
      {field("notes", t("composer.fieldNotesOptional"), { multiline: true })}
    </View>
  );
}
