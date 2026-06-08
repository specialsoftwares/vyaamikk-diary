import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Control, UseFormGetValues, UseFormSetValue } from "react-hook-form";
import { Controller } from "react-hook-form";

import type { ComposerFieldBindings } from "@/components/composer/BusinessComposerForm";
import { PostalLocationSection } from "@/components/composer/PostalLocationSection";
import { ComposerSmartTextField } from "@/components/composer/ComposerSmartTextField";
import { masterKeyForFormField } from "@/services/masterData";
import { IndigoChoiceChip, IndigoChoiceChipRow, TextField, LocaleUiText } from "@/components/ui";
import { formSectionTitleStyle } from "@/theme/formLayer";
import type { CcCopyInstruction, FreightType } from "@/domain/businessEntry";
import { normalizeEwayBillInput } from "@/utils/businessEntry/ewayBill";
import { spacing, typography, useThemedStyles } from "@/theme";
import { useT } from "@/i18n";

const FREIGHT_TYPES: FreightType[] = ["to_pay", "paid", "tbb", "other"];
const CC_OPTIONS: CcCopyInstruction[] = ["attach", "not_attached", "not_applicable"];

interface OutwardMovementFieldsProps {
  control: Control<Record<string, unknown>>;
  fields: ComposerFieldBindings;
  setValue: UseFormSetValue<Record<string, unknown>>;
  getValues: UseFormGetValues<Record<string, unknown>>;
  linkedDispatchId?: string | null;
  movementDateBounds?: { minimumDate: Date; maximumDate: Date };
  policyDateField: (
    name: string,
    label: string,
    policyId: import("@/services/recordDatePolicy").RecordDatePolicyId,
    hint?: string
  ) => React.ReactNode;
}

export function OutwardMovementFields({
  control,
  fields,
  setValue,
  getValues,
  linkedDispatchId,
  movementDateBounds,
  policyDateField,
}: OutwardMovementFieldsProps) {
  const t = useT();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      section: {
        ...formSectionTitleStyle(c),
        marginTop: spacing.md,
        marginBottom: spacing.xs,
      },
      sectionFirst: {
        ...formSectionTitleStyle(c),
        marginBottom: spacing.xs,
      },
      hint: { ...typography.caption, color: c.textMuted, marginBottom: spacing.sm },
      linkBanner: {
        backgroundColor: c.primaryLight,
        padding: spacing.md,
        borderRadius: 12,
        marginBottom: spacing.md,
      },
      linkText: { ...typography.caption, color: c.primaryDark },
    })
  );

  const field = (
    name: string,
    label: string,
    opts?: { multiline?: boolean; keyboard?: "numeric"; hint?: string }
  ) => {
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
            hint={opts?.hint}
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

      <LocaleUiText style={styles.sectionFirst}>{t("materialMovement.sections.basics")}</LocaleUiText>
      {policyDateField(
        "entryDate",
        t("composer.movementDate"),
        "event_past_15",
        t("datePolicy.hints.materialEvent")
      )}
      {field("partyName", t("composer.partyOrConsignee"))}
      <PostalLocationSection
        prefix="dispatchFrom"
        pinLabel={t("postal.fromPin")}
        manualLocationLabel={t("postal.manualFrom")}
        control={control}
        setValue={setValue}
        getValues={getValues}
        fields={fields}
        legacyLocationField="dispatchLocation"
        required
      />
      <PostalLocationSection
        prefix="deliveryTo"
        pinLabel={t("postal.toPin")}
        manualLocationLabel={t("postal.manualTo")}
        control={control}
        setValue={setValue}
        getValues={getValues}
        fields={fields}
        legacyLocationField="destination"
        required
      />
      {field("billChallanNumber", t("composer.invoiceChallan"))}
      {fields.wrap(
        "ewayBillNumber",
        <Controller
          control={control}
          name="ewayBillNumber"
          render={({ field: { onChange, value } }) => (
            <TextField
              label={t("materialMovement.ewayBillLabel")}
              hint={t("materialMovement.ewayBillHelper")}
              value={value == null ? "" : String(value)}
              onChangeText={(text) => onChange(normalizeEwayBillInput(text))}
              keyboardType="number-pad"
              maxLength={12}
              containerStyle={{ marginBottom: spacing.sm }}
              error={fields.errorFor("ewayBillNumber")}
            />
          )}
        />
      )}
      {field("referenceNote", t("materialMovement.referenceNote"), { multiline: true })}

      <LocaleUiText style={styles.section}>{t("materialMovement.sections.goods")}</LocaleUiText>
      <LocaleUiText style={styles.hint}>{t("materialMovement.goodsHint")}</LocaleUiText>
      {field("materialName", t("composer.materialName"))}
      {field("materialDescription", t("materialMovement.itemDescription"))}
      {field("quantity", t("composer.quantity"), { keyboard: "numeric" })}
      {field("unit", t("composer.unit"))}
      {field("totalBoxes", t("composer.totalBoxes"), { keyboard: "numeric" })}
      {field("totalWeight", t("composer.totalWeight"), { keyboard: "numeric" })}
      {field("weightUnit", t("composer.weightUnitOptional"))}

      <LocaleUiText style={styles.section}>{t("materialMovement.sections.transport")}</LocaleUiText>
      {field("transporterName", t("composer.transporterOptional"))}
      {field("lrGrNumber", t("composer.lrGrNumberOptional"))}
      {field("vehicleNumber", t("composer.vehicleNumberOptional"))}
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
      {field("freightAmount", t("materialMovement.freightAmount"), { keyboard: "numeric" })}
      {field("clarificationContactName", t("composer.clarificationNameOptional"))}
      {field("clarificationContactMobile", t("composer.clarificationMobileOptional"), {
        keyboard: "numeric",
      })}
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
      {field("remarks", t("composer.remarksOptional"), { multiline: true })}
      {field("notes", t("composer.fieldNotesOptional"), { multiline: true })}
    </View>
  );
}
