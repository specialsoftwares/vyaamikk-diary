import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

import { SettingsNavCard, SettingsNavGroup } from "@/components/settings";
import { Header, Screen, LocaleUiText } from "@/components/ui";
import { legal } from "@/config/legal";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
import { openSafeExternalUrl } from "@/utils/safeUrl";

export default function LegalHubScreen() {
  const t = useT();
  const router = useRouter();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      intro: { ...typography.body, color: c.textMuted, marginBottom: spacing.md, lineHeight: 22 },
      webLink: { ...typography.captionStrong, color: c.primaryDark, marginTop: spacing.lg },
    })
  );

  return (
    <Screen scroll>
      <Header title={t("settings.legalCombined")} showBack backFrom="settings" />
      <LocaleUiText style={styles.intro}>{t("settings.legalCombinedSubtitle")}</LocaleUiText>
      <SettingsNavGroup>
        <SettingsNavCard
          icon="shield-check-outline"
          title={t("settings.privacy")}
          onPress={() => router.push({ pathname: "/legal/[doc]", params: { doc: "privacy" } })}
          embedded
        />
        <SettingsNavCard
          icon="file-document-outline"
          title={t("settings.terms")}
          onPress={() => router.push({ pathname: "/legal/[doc]", params: { doc: "terms" } })}
          embedded
        />
      </SettingsNavGroup>
      <Pressable onPress={() => void openSafeExternalUrl(legal.legalHubUrl)}>
        <LocaleUiText style={styles.webLink}>{t("legal.viewerHostedHub")}</LocaleUiText>
      </Pressable>
    </Screen>
  );
}
