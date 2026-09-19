/**
 * Billing-details fields for SubscriptionManagementScreen.
 * Saves only through updateBillingDetails. No client GSTIN verification.
 */

import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { LocaleUiText, PremiumActionButton, TextField } from "@/components/ui";
import { gstStateLabel, GST_STATE_CODES, gstStateName } from "@/subscription/gstStates";
import type { ClientBillingDetails } from "@/subscription/billingDetailsReader";
import type { TranslateFn } from "@/components/billing/upgradeTypes";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

export type BillingDetailsDraft = {
  billingRecipientName: string;
  gstin: string;
  billingBusinessName: string;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingCity: string;
  billingPostalCode: string;
  billingStateCode: string;
};

export function draftFromDetails(details: ClientBillingDetails | null): BillingDetailsDraft {
  return {
    billingRecipientName: details?.billingRecipientName ?? "",
    gstin: details?.gstin ?? "",
    billingBusinessName: details?.billingBusinessName ?? "",
    billingAddressLine1: details?.billingAddressLine1 ?? "",
    billingAddressLine2: details?.billingAddressLine2 ?? "",
    billingCity: details?.billingCity ?? "",
    billingPostalCode: details?.billingPostalCode ?? "",
    billingStateCode: details?.billingStateCode ?? "",
  };
}

export function payloadFromDraft(draft: BillingDetailsDraft) {
  const stateCode = draft.billingStateCode.trim();
  return {
    billingRecipientName: draft.billingRecipientName.trim() || null,
    gstin: draft.gstin.trim() || null,
    billingBusinessName: draft.billingBusinessName.trim() || null,
    billingAddressLine1: draft.billingAddressLine1.trim() || null,
    billingAddressLine2: draft.billingAddressLine2.trim() || null,
    billingCity: draft.billingCity.trim() || null,
    billingPostalCode: draft.billingPostalCode.trim() || null,
    billingStateCode: stateCode || null,
    billingStateName: stateCode ? gstStateName(stateCode) : null,
  };
}

export function BillingDetailsForm(props: {
  t: TranslateFn;
  draft: BillingDetailsDraft;
  onChange: (next: BillingDetailsDraft) => void;
  gstinError: string | null;
  saveError: string | null;
  saving: boolean;
  saveDisabled: boolean;
  onSave: () => void;
}) {
  const { t, draft, onChange, gstinError, saveError, saving, saveDisabled, onSave } = props;
  const [statesOpen, setStatesOpen] = useState(false);
  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      helper: { ...typography.caption, color: colors.textMuted, lineHeight: 18, marginBottom: spacing.sm },
      pickerLabel: { ...typography.captionStrong, color: colors.textMuted, marginBottom: 6 },
      picker: {
        borderWidth: 1,
        borderColor: colors.divider,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        marginBottom: spacing.sm,
      },
      pickerValue: { ...typography.body, color: colors.text },
      stateRow: {
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.divider,
      },
      error: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
    })
  );

  const selectedLabel = useMemo(() => {
    if (!draft.billingStateCode) return t("billing.management.statePlaceholder");
    return gstStateLabel(draft.billingStateCode);
  }, [draft.billingStateCode, t]);

  return (
    <View>
      <LocaleUiText style={styles.helper}>{t("billing.management.gstHelper")}</LocaleUiText>
      <TextField
        label={t("billing.management.recipientName")}
        required
        value={draft.billingRecipientName}
        onChangeText={(billingRecipientName) => onChange({ ...draft, billingRecipientName })}
        autoCapitalize="words"
      />
      <TextField
        label={`${t("billing.management.gstin")} (${t("billing.management.gstinSuffix")})`}
        value={draft.gstin}
        onChangeText={(gstin) => onChange({ ...draft, gstin })}
        autoCapitalize="characters"
        placeholder="22AAAAA0000A1Z5"
        error={gstinError}
      />
      <TextField
        label={t("billing.management.businessName")}
        value={draft.billingBusinessName}
        onChangeText={(billingBusinessName) => onChange({ ...draft, billingBusinessName })}
      />
      <TextField
        label={t("billing.management.address1")}
        value={draft.billingAddressLine1}
        onChangeText={(billingAddressLine1) => onChange({ ...draft, billingAddressLine1 })}
      />
      <TextField
        label={t("billing.management.address2")}
        value={draft.billingAddressLine2}
        onChangeText={(billingAddressLine2) => onChange({ ...draft, billingAddressLine2 })}
      />
      <TextField
        label={t("billing.management.city")}
        value={draft.billingCity}
        onChangeText={(billingCity) => onChange({ ...draft, billingCity })}
      />
      <TextField
        label={t("billing.management.pin")}
        value={draft.billingPostalCode}
        onChangeText={(billingPostalCode) => onChange({ ...draft, billingPostalCode })}
        keyboardType="number-pad"
        maxLength={6}
      />
      <LocaleUiText style={styles.pickerLabel}>{t("billing.management.state")}</LocaleUiText>
      <Pressable
        onPress={() => setStatesOpen((open) => !open)}
        style={styles.picker}
        accessibilityRole="button"
        accessibilityLabel={t("billing.management.state")}
      >
        <LocaleUiText style={styles.pickerValue}>{selectedLabel}</LocaleUiText>
      </Pressable>
      {statesOpen
        ? GST_STATE_CODES.map((code) => (
            <Pressable
              key={code}
              onPress={() => {
                onChange({ ...draft, billingStateCode: code });
                setStatesOpen(false);
              }}
              style={styles.stateRow}
              accessibilityRole="button"
              accessibilityLabel={gstStateLabel(code)}
            >
              <LocaleUiText style={styles.pickerValue}>{gstStateLabel(code)}</LocaleUiText>
            </Pressable>
          ))
        : null}
      {saveError ? <LocaleUiText style={styles.error}>{saveError}</LocaleUiText> : null}
      <PremiumActionButton
        label={saving ? t("billing.management.saving") : t("billing.management.saveDetails")}
        onPress={onSave}
        loading={saving}
        loadingLabel={t("billing.management.saving")}
        disabled={saveDisabled || saving}
        accessibilityLabel={t("billing.management.saveDetails")}
      />
    </View>
  );
}
