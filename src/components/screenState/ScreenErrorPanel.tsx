import React from "react";
import { StyleSheet, View } from "react-native";

import { isUnsafePublicText, presentPublicError } from "@/domain/publicErrors";
import { Button } from "@/components/ui/Button";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { useI18n } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

import { screenStateCopy } from "./screenStateCopy";

export function ScreenErrorPanel({
  error,
  message,
  onRetry,
  onBack,
}: {
  error: unknown;
  /** Existing safe sentence. Unsafe text is still replaced. */
  message?: string;
  onRetry?: () => void;
  onBack?: () => void;
}) {
  const { lang } = useI18n();
  const copy = screenStateCopy(lang);
  const body =
    message && !isUnsafePublicText(message) ? message : presentPublicError(error);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: {
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
        gap: spacing.sm,
        alignItems: "center",
      },
      title: { ...typography.titleMd, color: c.danger, textAlign: "center" },
      body: { ...typography.body, color: c.textMuted, textAlign: "center", lineHeight: 22 },
      actions: { marginTop: spacing.md, gap: spacing.sm, alignSelf: "stretch" },
    })
  );
  return (
    <View style={styles.wrap}>
      <LocaleUiText style={styles.title}>{copy.errorTitle}</LocaleUiText>
      <LocaleUiText style={styles.body}>{body}</LocaleUiText>
      <View style={styles.actions}>
        {onRetry ? (
          <Button label={copy.retry} onPress={onRetry} variant="secondary" fullWidth={false} />
        ) : null}
        {onBack ? (
          <Button label={copy.back} onPress={onBack} variant="ghost" fullWidth={false} />
        ) : null}
      </View>
    </View>
  );
}
