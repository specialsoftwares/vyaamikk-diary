import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Control, UseFormGetValues, UseFormSetValue } from "react-hook-form";
import { Controller } from "react-hook-form";

import type { ComposerFieldBindings } from "@/components/composer/BusinessComposerForm";
import { TextField, LocaleUiText } from "@/components/ui";
import { useIndianPincodeField } from "@/hooks/useIndianPincodeField";
import { useT } from "@/i18n";
import type { PostalFieldPrefix } from "@/utils/location/postalForm";
import { postalFormField } from "@/utils/location/postalForm";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

interface PostalLocationSectionProps {
  prefix: PostalFieldPrefix;
  pinLabel: string;
  control: Control<Record<string, unknown>>;
  setValue: UseFormSetValue<Record<string, unknown>>;
  getValues: UseFormGetValues<Record<string, unknown>>;
  fields: ComposerFieldBindings;
  legacyLocationField?: string;
  required?: boolean;
  variant?: "compact" | "full";
  manualLocationLabel?: string;
}

export function PostalLocationSection({
  prefix,
  pinLabel,
  control,
  setValue,
  getValues,
  fields,
  legacyLocationField,
  required = false,
  variant = "compact",
  manualLocationLabel,
}: PostalLocationSectionProps) {
  const t = useT();
  const pinField = postalFormField(prefix, "Pin");
  const pin = useIndianPincodeField({
    prefix,
    control,
    setValue,
    legacyLocationField,
    getValues,
  });

  const [manualMode, setManualMode] = useState(() => {
    const pinVal = String(getValues(pinField) ?? "")
      .replace(/\D/g, "")
      .slice(0, 6);
    const legacy =
      legacyLocationField && getValues(legacyLocationField) != null
        ? String(getValues(legacyLocationField)).trim()
        : "";
    return Boolean(legacy && pinVal.length !== 6);
  });

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { marginTop: spacing.sm },
      chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
      chip: {
        paddingVertical: 6,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: c.surfaceMuted,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
      },
      chipOn: { borderColor: c.primary, backgroundColor: c.primaryLight },
      chipText: { ...typography.caption, color: c.text },
      statusOk: { ...typography.caption, color: c.success, marginBottom: spacing.xs },
      statusWarn: { ...typography.caption, color: c.warning, marginBottom: spacing.xs },
      statusMuted: { ...typography.caption, color: c.textMuted, marginBottom: spacing.xs },
      resolvedLine: { ...typography.caption, color: c.textMuted, marginBottom: spacing.sm, lineHeight: 18 },
      link: { ...typography.captionStrong, color: c.primary, marginTop: spacing.xs, marginBottom: spacing.sm },
      section: { ...typography.captionStrong, color: c.textMuted, marginBottom: spacing.xs },
    })
  );

  const pinInput = fields.wrap(
    pin.pinField,
    <Controller
      control={control}
      name={pin.pinField}
      render={({ field: { onChange, value } }) => (
        <TextField
          navFieldKey={pin.pinField}
          label={pinLabel}
          value={value == null ? "" : String(value)}
          onChangeText={(text) => onChange(text.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          containerStyle={{ marginBottom: spacing.xs }}
          error={
            fields.errorFor(pin.pinField) ?? (pin.isPinInvalid ? t("postal.invalidPin") : undefined)
          }
        />
      )}
    />
  );

  const localityChips =
    pin.localities.length > 1 ? (
      <>
        <LocaleUiText style={styles.statusMuted}>{t("postal.chooseLocality")}</LocaleUiText>
        <View style={styles.chipRow}>
          {pin.localities.map((name) => {
            const selected = String(getValues(pin.localityField) ?? "") === name;
            return (
              <Pressable key={name} onPress={() => pin.selectLocality(name)}>
                <View style={[styles.chip, selected ? styles.chipOn : null]}>
                  <Text style={styles.chipText}>{name}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </>
    ) : null;

  const manualLink = legacyLocationField ? (
    <Pressable onPress={() => setManualMode(true)} hitSlop={8}>
      <LocaleUiText style={styles.link}>{t("postal.enterManually")}</LocaleUiText>
    </Pressable>
  ) : null;

  const pinLookupLink = (
    <Pressable onPress={() => setManualMode(false)} hitSlop={8}>
      <LocaleUiText style={styles.link}>{t("postal.usePinLookup")}</LocaleUiText>
    </Pressable>
  );

  let statusEl: React.ReactNode = null;
  if (!manualMode) {
    if (pin.status === "resolving") {
      statusEl = <LocaleUiText style={styles.statusMuted}>{t("postal.resolving")}</LocaleUiText>;
    } else if (pin.isPinInvalid) {
      statusEl = <LocaleUiText style={styles.statusWarn}>{t("postal.invalidPin")}</LocaleUiText>;
    } else if (pin.status === "success") {
      const display = String(getValues(pin.displayField) ?? "").trim();
      statusEl = display ? (
        <Text style={styles.resolvedLine}>{display}</Text>
      ) : (
        <LocaleUiText style={styles.statusOk}>{t("postal.foundGeneric")}</LocaleUiText>
      );
    } else if (pin.status === "failed" && pin.pinDisplay.length === 6) {
      statusEl = <LocaleUiText style={styles.statusWarn}>{t("postal.lookupFailed")}</LocaleUiText>;
    }
  }

  if (manualMode && legacyLocationField) {
    return (
      <View style={styles.wrap}>
        {fields.wrap(
          legacyLocationField,
          <Controller
            control={control}
            name={legacyLocationField}
            render={({ field: { onChange, value } }) => (
              <TextField
                navFieldKey={legacyLocationField}
                label={
                  manualLocationLabel ??
                  (required ? t("postal.manualLocationRequired") : t("postal.manualLocationOptional"))
                }
                value={value == null ? "" : String(value)}
                onChangeText={onChange}
                multiline
                containerStyle={{ marginBottom: spacing.xs }}
                error={fields.errorFor(legacyLocationField) ?? fields.errorFor(pin.pinField)}
              />
            )}
          />
        )}
        {pinLookupLink}
      </View>
    );
  }

  if (variant === "full") {
    return (
      <View style={styles.wrap}>
        <Text style={styles.section}>{pinLabel}</Text>
        {pinInput}
        {statusEl}
        {localityChips}
        {fields.wrap(
          pin.localityField,
          <Controller
            control={control}
            name={pin.localityField}
            render={({ field: { onChange, value } }) => (
              <TextField
                navFieldKey={pin.localityField}
                label={t("postal.areaPostOffice")}
                value={value == null ? "" : String(value)}
                onChangeText={(text) => {
                  onChange(text);
                  pin.onPlaceOrLocalityEdited();
                }}
                containerStyle={{ marginBottom: spacing.sm }}
              />
            )}
          />
        )}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {fields.wrap(
            pin.districtField,
            <Controller
              control={control}
              name={pin.districtField}
              render={({ field: { onChange, value } }) => (
                <TextField
                  navFieldKey={pin.districtField}
                  label={t("postal.district")}
                  value={value == null ? "" : String(value)}
                  onChangeText={(text) => {
                    onChange(text);
                    pin.onPlaceOrLocalityEdited();
                  }}
                  containerStyle={{ flex: 1, marginBottom: spacing.sm }}
                />
              )}
            />
          )}
          {fields.wrap(
            pin.stateField,
            <Controller
              control={control}
              name={pin.stateField}
              render={({ field: { onChange, value } }) => (
                <TextField
                  navFieldKey={pin.stateField}
                  label={t("postal.state")}
                  value={value == null ? "" : String(value)}
                  onChangeText={(text) => {
                    onChange(text);
                    pin.onPlaceOrLocalityEdited();
                  }}
                  containerStyle={{ flex: 1, marginBottom: spacing.sm }}
                />
              )}
            />
          )}
        </View>
        {manualLink}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {pinInput}
      {statusEl}
      {localityChips}
      {manualLink}
    </View>
  );
}
