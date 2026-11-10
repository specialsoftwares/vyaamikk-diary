import React from "react";
import { StyleSheet } from "react-native";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { useI18n } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

import { screenStateCopy } from "./screenStateCopy";

/** `confirmed` must be the screen's existing remote-accept flag. A local write passes false. */
export function SaveOutcomeLabel({ confirmed }: { confirmed: boolean }) {
  const { lang } = useI18n();
  const copy = screenStateCopy(lang);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      text: {
        ...typography.captionStrong,
        color: c.textMuted,
        paddingVertical: spacing.xs,
      },
    })
  );
  return <LocaleUiText style={styles.text}>{confirmed ? copy.confirmed : copy.savedOnDevice}</LocaleUiText>;
}
