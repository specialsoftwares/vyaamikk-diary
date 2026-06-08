import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { StyleSheet, Text, View } from "react-native";

import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

export function LocalDbErrorScreen({ message }: { message?: string }) {
  const t = useT();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      root: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.xl,
        backgroundColor: c.background,
      },
      title: { ...typography.titleLg, color: c.danger, textAlign: "center" },
      body: {
        ...typography.body,
        color: c.textMuted,
        textAlign: "center",
        marginTop: spacing.md,
      },
    })
  );

  return (
    <View style={styles.root}>
      <LocaleUiText style={styles.title}>{t("sync.dbFailedTitle")}</LocaleUiText>
      {message ? (
        <Text style={styles.body}>{message}</Text>
      ) : (
        <LocaleUiText style={styles.body}>{t("sync.dbFailedBody")}</LocaleUiText>
      )}
    </View>
  );
}
