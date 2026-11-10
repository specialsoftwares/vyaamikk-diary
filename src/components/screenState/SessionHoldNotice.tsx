import React from "react";
import { StyleSheet, View } from "react-native";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { useI18n } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

import { screenStateCopy } from "./screenStateCopy";

export function SessionHoldNotice({ visible }: { visible: boolean }) {
  const { lang } = useI18n();
  const copy = screenStateCopy(lang);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: {
        paddingVertical: spacing.sm,
        gap: spacing.xs,
      },
      title: { ...typography.titleSm, color: c.text },
      body: { ...typography.body, color: c.textMuted, lineHeight: 22 },
    })
  );
  if (!visible) return null;
  return (
    <View style={styles.wrap}>
      <LocaleUiText style={styles.title}>{copy.sessionTitle}</LocaleUiText>
      <LocaleUiText style={styles.body}>{copy.sessionBody}</LocaleUiText>
    </View>
  );
}
