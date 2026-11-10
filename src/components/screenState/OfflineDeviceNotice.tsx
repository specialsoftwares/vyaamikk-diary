import React from "react";
import { StyleSheet } from "react-native";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { useI18n } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

import { screenStateCopy } from "./screenStateCopy";

export function OfflineDeviceNotice({
  offline,
  hasRows,
}: {
  offline: boolean;
  hasRows: boolean;
}) {
  const { lang } = useI18n();
  const copy = screenStateCopy(lang);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      text: {
        ...typography.caption,
        color: c.textMuted,
        paddingVertical: spacing.sm,
        lineHeight: 18,
      },
    })
  );
  if (!offline) return null;
  return <LocaleUiText style={styles.text}>{hasRows ? copy.offlineSaved : copy.offlineNoCache}</LocaleUiText>;
}
