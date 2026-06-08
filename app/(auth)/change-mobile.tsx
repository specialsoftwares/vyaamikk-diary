import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Header, PremiumActionButton, Screen, LocaleUiText } from "@/components/ui";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

/**
 * Retired user route — self-service mobile change is not offered in the app.
 * Deep links land here with support guidance, then return to Profile & Identity.
 */
export default function ChangeMobileSupportScreen() {
  const t = useT();
  const router = useRouter();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      body: { gap: spacing.md, marginTop: spacing.lg },
      lead: { ...typography.body, color: c.textMuted, lineHeight: 22 },
      note: { ...typography.caption, color: c.textSubtle, lineHeight: 20 },
    })
  );

  return (
    <Screen scroll padded>
      <Header title={t("identity.mobileChangeRetiredTitle")} showBack />
      <View style={styles.body}>
        <LocaleUiText style={styles.lead}>{t("identity.verifiedMobileSupport")}</LocaleUiText>
        <LocaleUiText style={styles.note}>{t("identity.verifiedMobileHint")}</LocaleUiText>
        <PremiumActionButton
          label={t("identity.mobileChangeBackToProfile")}
          variant="primary"
          size="md"
          onPress={() => router.replace("/(app)/settings/identity")}
        />
      </View>
    </Screen>
  );
}
