import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Header, LocaleUiText, Screen } from "@/components/ui";
import { BRAND_GOLD, BRAND_SURFACE } from "@/config/brandMotion";
import { useT } from "@/i18n";
import { spacing, typography } from "@/theme";

import { estimateSheetsSaved } from "./upgradePresentation";

export interface BenefitEducationScreenProps {
  reducedMotion: boolean;
  onContinue: () => void;
  onClose: () => void;
}

/**
 * Benefit education — indigo/gold presentation only.
 * Does not persist benefitScreenShown; the caller records that if needed.
 */
export function BenefitEducationScreen({
  reducedMotion,
  onContinue,
  onClose,
}: BenefitEducationScreenProps) {
  const t = useT();
  const [recordsText, setRecordsText] = useState("25");
  const records = Number.parseInt(recordsText, 10);
  const sheets = estimateSheetsSaved(Number.isFinite(records) ? records : 0);

  const sections = useMemo(
    () => [
      { title: t("billing.education.paperTitle"), body: t("billing.education.paperBody") },
      { title: t("billing.education.timeTitle"), body: t("billing.education.timeBody") },
      { title: t("billing.education.gstTitle"), body: t("billing.education.gstBody") },
      { title: t("billing.education.indiaTitle"), body: t("billing.education.indiaBody") },
      { title: t("billing.education.yoursTitle"), body: t("billing.education.yoursBody") },
    ],
    [t]
  );

  return (
    <Screen scroll padded extraBottomPadding={spacing.xl}>
      <Header
        variant="executive"
        title={t("billing.education.title")}
        showBack
        onBackPress={onClose}
      />

      <View
        style={[styles.goldRule, reducedMotion && styles.goldRuleReduced]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />

      {sections.map((section) => (
        <View key={section.title} style={styles.card}>
          <LocaleUiText style={styles.sectionTitle}>{section.title}</LocaleUiText>
          <LocaleUiText style={styles.sectionBody}>{section.body}</LocaleUiText>
        </View>
      ))}

      <View style={styles.card}>
        <LocaleUiText style={styles.sectionTitle}>{t("billing.education.savingsTitle")}</LocaleUiText>
        <LocaleUiText style={styles.sectionBody}>{t("billing.education.savingsBody")}</LocaleUiText>
        <LocaleUiText style={styles.inputLabel}>{t("billing.education.savingsRecords")}</LocaleUiText>
        <TextInput
          value={recordsText}
          onChangeText={setRecordsText}
          keyboardType="number-pad"
          accessibilityLabel={t("billing.education.savingsRecords")}
          style={styles.input}
        />
        <LocaleUiText style={styles.sectionBody}>
          {t("billing.education.savingsSheets", { sheets })}
        </LocaleUiText>
        <LocaleUiText style={styles.disclaimer}>{t("billing.education.savingsDisclaimer")}</LocaleUiText>
      </View>

      <Pressable
        onPress={onContinue}
        accessibilityRole="button"
        accessibilityLabel={t("billing.education.continue")}
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
      >
        <LocaleUiText style={styles.ctaLabel}>{t("billing.education.continue")}</LocaleUiText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  goldRule: {
    height: 2,
    backgroundColor: BRAND_GOLD,
    opacity: 0.85,
    marginBottom: spacing.lg,
  },
  goldRuleReduced: {
    opacity: 0.45,
  },
  card: {
    backgroundColor: BRAND_SURFACE,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.titleSm,
    color: "#F2F3F8",
  },
  sectionBody: {
    ...typography.body,
    color: "rgba(255,255,255,0.78)",
  },
  inputLabel: {
    ...typography.captionStrong,
    color: BRAND_GOLD,
  },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.45)",
    paddingHorizontal: spacing.md,
    color: "#F2F3F8",
    ...typography.body,
  },
  disclaimer: {
    ...typography.caption,
    color: "rgba(255,255,255,0.48)",
  },
  cta: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: BRAND_GOLD,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  ctaLabel: {
    ...typography.bodyStrong,
    color: BRAND_SURFACE,
  },
  pressed: {
    opacity: 0.8,
  },
});

