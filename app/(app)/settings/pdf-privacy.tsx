import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { PDF_CLOUD_BACKUP_ENABLED, PDF_PRIVACY_COPY_KEYS } from "@/constants/pdfPrivacy";
import { Banner, Card, Header, Screen, LocaleUiText } from "@/components/ui";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

const SECTION_KEYS = [
  PDF_PRIVACY_COPY_KEYS.localFirstTitle,
  PDF_PRIVACY_COPY_KEYS.noAutoUploadTitle,
  PDF_PRIVACY_COPY_KEYS.metadataTitle,
  PDF_PRIVACY_COPY_KEYS.noReviewTitle,
  PDF_PRIVACY_COPY_KEYS.shareTitle,
  PDF_PRIVACY_COPY_KEYS.syncTitle,
  PDF_PRIVACY_COPY_KEYS.accessTitle,
  PDF_PRIVACY_COPY_KEYS.deletionTitle,
] as const;

const BODY_KEYS: Record<(typeof SECTION_KEYS)[number], string> = {
  [PDF_PRIVACY_COPY_KEYS.localFirstTitle]: PDF_PRIVACY_COPY_KEYS.localFirstBody,
  [PDF_PRIVACY_COPY_KEYS.noAutoUploadTitle]: PDF_PRIVACY_COPY_KEYS.noAutoUploadBody,
  [PDF_PRIVACY_COPY_KEYS.metadataTitle]: PDF_PRIVACY_COPY_KEYS.metadataBody,
  [PDF_PRIVACY_COPY_KEYS.noReviewTitle]: PDF_PRIVACY_COPY_KEYS.noReviewBody,
  [PDF_PRIVACY_COPY_KEYS.shareTitle]: PDF_PRIVACY_COPY_KEYS.shareBody,
  [PDF_PRIVACY_COPY_KEYS.syncTitle]: PDF_PRIVACY_COPY_KEYS.syncBody,
  [PDF_PRIVACY_COPY_KEYS.accessTitle]: PDF_PRIVACY_COPY_KEYS.accessBody,
  [PDF_PRIVACY_COPY_KEYS.deletionTitle]: PDF_PRIVACY_COPY_KEYS.deletionBody,
};

export default function PdfPrivacyScreen() {
  const t = useT();
  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      lead: { marginBottom: spacing.lg },
      section: { marginBottom: spacing.lg, gap: spacing.sm },
      sectionTitle: { ...typography.titleSm, color: colors.text },
      sectionBody: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
      toggleRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: spacing.md,
        gap: spacing.md,
      },
      toggleLabel: { ...typography.body, color: colors.text, flex: 1 },
      toggleHint: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
      comingSoon: { ...typography.captionStrong, color: colors.textSubtle },
      modes: { marginTop: spacing.md, gap: spacing.xs },
      modeLine: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
    })
  );

  return (
    <Screen scroll>
      <Header
        variant="executive"
        title={t(PDF_PRIVACY_COPY_KEYS.screenTitle)}
        showBack
        backFrom="settings"
      />

      <View style={styles.lead}>
        <Banner tone="info" title={t("pdfPrivacy.bannerTitle")} message={t(PDF_PRIVACY_COPY_KEYS.trustLead)} />
      </View>

      <Card>
        {SECTION_KEYS.map((titleKey) => (
          <View key={titleKey} style={styles.section}>
            <LocaleUiText style={styles.sectionTitle}>{t(titleKey)}</LocaleUiText>
            <LocaleUiText style={styles.sectionBody}>{t(BODY_KEYS[titleKey])}</LocaleUiText>
          </View>
        ))}
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <LocaleUiText style={styles.toggleLabel}>{t(PDF_PRIVACY_COPY_KEYS.cloudBackupLabel)}</LocaleUiText>
            <LocaleUiText style={styles.toggleHint}>{t(PDF_PRIVACY_COPY_KEYS.cloudBackupHint)}</LocaleUiText>
            {!PDF_CLOUD_BACKUP_ENABLED ? (
              <LocaleUiText style={styles.comingSoon}>{t(PDF_PRIVACY_COPY_KEYS.cloudBackupComingSoon)}</LocaleUiText>
            ) : null}
          </View>
          <Switch value={false} disabled={!PDF_CLOUD_BACKUP_ENABLED} />
        </View>

        <LocaleUiText style={[styles.sectionTitle, { marginTop: spacing.md }]}>
          {t(PDF_PRIVACY_COPY_KEYS.storageModesTitle)}
        </LocaleUiText>
        <View style={styles.modes}>
          <LocaleUiText style={styles.modeLine}>• {t(PDF_PRIVACY_COPY_KEYS.storageLocalOnly)}</LocaleUiText>
          <LocaleUiText style={styles.modeLine}>• {t(PDF_PRIVACY_COPY_KEYS.storageCloudBacked)}</LocaleUiText>
          <LocaleUiText style={styles.modeLine}>• {t(PDF_PRIVACY_COPY_KEYS.storageCloudEncrypted)}</LocaleUiText>
        </View>
      </Card>
    </Screen>
  );
}
