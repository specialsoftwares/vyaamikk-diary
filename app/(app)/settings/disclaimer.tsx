import React from "react";
import { Pressable, StyleSheet } from "react-native";

import { Header, Screen, LocaleUiText } from "@/components/ui";
import { openPublicLinkOrExplain } from "@/config/publicLinks";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

export default function DisclaimerScreen() {
  const t = useT();
  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      body: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
      link: { ...typography.bodyStrong, color: colors.primary, marginTop: spacing.md },
    })
  );

  return (
    <Screen scroll>
      <Header title={t("legal.disclaimerTitle")} showBack backFrom="settings" />
      <LocaleUiText style={styles.body}>{t("settings.legalCombinedSubtitle")}</LocaleUiText>
      <Pressable accessibilityRole="link" onPress={() => void openPublicLinkOrExplain("terms")}>
        <LocaleUiText style={styles.link}>{t("legal.linkTerms")}</LocaleUiText>
      </Pressable>
    </Screen>
  );
}
