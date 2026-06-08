import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";

import { BrandMomentsTagline } from "@/components/brand/BrandMomentsTagline";
import { env } from "@/config/env";
import { openSafeExternalUrl } from "@/utils/safeUrl";
import { Card, Header, Screen, LocaleUiText } from "@/components/ui";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

export default function AboutScreen() {
  const t = useT();
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? "1.0.0";
  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      title: { ...typography.titleLg, color: colors.text },
      attribution: { ...typography.caption, color: colors.textMuted, marginTop: 6, lineHeight: 18 },
      section: { marginTop: spacing.lg, gap: spacing.sm },
      body: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
      version: { ...typography.caption, color: colors.textSubtle, marginTop: spacing.md },
      linksCard: { marginTop: spacing.lg, gap: 0 },
      linkRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: spacing.md,
      },
      linkLabel: { ...typography.body, color: colors.text },
      linkChevron: { ...typography.titleSm, color: colors.textSubtle },
      divider: { height: 1, backgroundColor: colors.divider },
      counsel: {
        ...typography.caption,
        color: colors.textSubtle,
        marginTop: spacing.xl,
        lineHeight: 18,
        fontStyle: "italic",
      },
      footerAttribution: {
        marginTop: spacing.md,
        gap: 4,
        alignItems: "center",
      },
      footerLine: {
        ...typography.caption,
        color: colors.textSubtle,
        textAlign: "center",
        lineHeight: 18,
      },
    })
  );

  const openUrl = (url: string) => {
    void openSafeExternalUrl(url);
  };

  return (
    <Screen scroll>
      <Header
        variant="executive"
        title={t("settings.about")}
        showBack
        backFrom="settings"
      />

      <Card>
        <LocaleUiText style={styles.title}>{t("app.name")}</LocaleUiText>
        <BrandMomentsTagline align="left" style={{ marginTop: spacing.sm }} />
        <LocaleUiText style={styles.attribution}>{t("brand.designedBy")}</LocaleUiText>
        <LocaleUiText style={styles.version}>{t("about.versionLine", { version })}</LocaleUiText>

        <View style={styles.section}>
          <LocaleUiText style={styles.body}>{t("legal.aboutDescription")}</LocaleUiText>
          <LocaleUiText style={styles.body}>{t("legal.aboutUtility")}</LocaleUiText>
          <LocaleUiText style={styles.body}>
            {t("legal.contactPlaceholder", { email: env.brand.supportEmail })}
          </LocaleUiText>
          <LocaleUiText style={styles.body}>{t("legal.privacyDeletion")}</LocaleUiText>
          <LocaleUiText style={styles.body}>{t("legal.privacyPdfLocal")}</LocaleUiText>
          <LocaleUiText style={styles.body}>{t("legal.privacyPdfSync")}</LocaleUiText>
          <LocaleUiText style={styles.body}>{t("legal.privacyPdfShare")}</LocaleUiText>
          <LocaleUiText style={styles.body}>
            {t("legal.privacyWebDeletion", { url: env.brand.accountDeletionUrl })}
          </LocaleUiText>
        </View>

        <LocaleUiText style={styles.counsel}>{t("legal.counselReview")}</LocaleUiText>
      </Card>

      <Card style={styles.linksCard}>
        <Pressable
          style={styles.linkRow}
          onPress={() => openUrl(env.brand.privacyUrl)}
        >
          <LocaleUiText style={styles.linkLabel}>{t("legal.linkPrivacy")}</LocaleUiText>
          <Text style={styles.linkChevron}>{">"}</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.linkRow} onPress={() => router.push("/(app)/settings/terms")}>
          <LocaleUiText style={styles.linkLabel}>{t("legal.linkTerms")}</LocaleUiText>
          <Text style={styles.linkChevron}>{">"}</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.linkRow}
          onPress={() => router.push("/(app)/settings/disclaimer")}
        >
          <LocaleUiText style={styles.linkLabel}>{t("legal.linkDisclaimer")}</LocaleUiText>
          <Text style={styles.linkChevron}>{">"}</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.linkRow}
          onPress={() => router.push("/(app)/settings/delete")}
        >
          <LocaleUiText style={styles.linkLabel}>{t("legal.linkDeleteAccount")}</LocaleUiText>
          <Text style={styles.linkChevron}>{">"}</Text>
        </Pressable>
      </Card>

      <View style={styles.footerAttribution}>
        <LocaleUiText style={styles.footerLine}>{t("brand.designedBy")}</LocaleUiText>
      </View>
    </Screen>
  );
}
