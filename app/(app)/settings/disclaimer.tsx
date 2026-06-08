import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card, Header, Screen, LocaleUiText } from "@/components/ui";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

const SECTION_KEYS = [
  "legal.disclaimerIntro",
  "legal.productUtility",
  "legal.disclaimerUserContent",
  "legal.disclaimerNoVerify",
  "legal.disclaimerNotParty",
  "legal.counselReview",
] as const;

export default function DisclaimerScreen() {
  const t = useT();
  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      body: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
      block: { marginBottom: spacing.md },
    })
  );

  return (
    <Screen scroll>
      <Header title={t("legal.disclaimerTitle")} showBack backFrom="settings" />
      <Card>
        {SECTION_KEYS.map((key) => (
          <View key={key} style={styles.block}>
            <LocaleUiText style={styles.body}>{t(key)}</LocaleUiText>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
