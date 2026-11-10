import React from "react";
import { StyleSheet } from "react-native";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { useLoadingSlowWarning, SKELETON_SLOW_MS } from "@/components/ui/skeleton/useLoadingSlowWarning";
import { useI18n } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

import { SCREEN_SLOW_MS } from "./resolveScreenState";
import { screenStateCopy } from "./screenStateCopy";

export function SlowNetworkStatus({
  active,
  slowAfterMs = SCREEN_SLOW_MS,
}: {
  /** True while a load is still running and content is already on screen. */
  active: boolean;
  /** Use the screen's existing threshold when it has one. */
  slowAfterMs?: number;
}) {
  const slow = useLoadingSlowWarning(active, slowAfterMs);
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
  if (!slow) return null;
  return <LocaleUiText style={styles.text}>{copy.slow}</LocaleUiText>;
}

export const SCREEN_EXISTING_SLOW_MS = SKELETON_SLOW_MS;
