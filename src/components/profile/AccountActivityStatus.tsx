import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { StyleSheet, Text, View } from "react-native";

import type { UserProfile } from "@/domain/types";
import { resolveLoginSubtitle } from "@/services/auth/loginTimestamps";
import { useT } from "@/i18n";
import { DATA_FORMAT_LOCALE } from "@/utils/formatters";
import { spacing, typography, useThemedStyles } from "@/theme";
import { formatDisplayTimestamp } from "@/utils/greeting";

interface AccountActivityStatusProps {
  user: UserProfile | null;
  /** Local session mirror when profile `lastActiveAt` is not yet synced. */
  sessionLastActive?: number | null;
}

export function AccountActivityStatus({
  user,
  sessionLastActive,
}: AccountActivityStatusProps) {
  const t = useT();
  const locale = DATA_FORMAT_LOCALE;

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      block: { gap: spacing.md },
      row: { gap: 4 },
      label: { ...typography.captionStrong, color: c.textMuted },
      value: { ...typography.body, color: c.text },
      message: { ...typography.body, color: c.textMuted },
    })
  );

  const loginSubtitle = resolveLoginSubtitle(user);
  const activeMs =
    user?.lastActiveAt != null && user.lastActiveAt > 0
      ? user.lastActiveAt
      : sessionLastActive != null && sessionLastActive > 0
        ? sessionLastActive
        : null;

  const loginValue =
    loginSubtitle?.kind === "last_login"
      ? formatDisplayTimestamp(loginSubtitle.ms, locale)
      : null;

  if (!loginSubtitle && activeMs == null) return null;

  return (
    <View style={styles.block}>
      {loginSubtitle ? (
        <View style={styles.row}>
          <LocaleUiText style={styles.label}>
            {loginSubtitle.kind === "last_login"
              ? t("settings.lastLoginLabel")
              : t("settings.signInStatusLabel")}
          </LocaleUiText>
          {loginValue ? (
            <Text style={styles.value}>{loginValue}</Text>
          ) : (
            <LocaleUiText style={styles.message}>{t("settings.firstLogin")}</LocaleUiText>
          )}
        </View>
      ) : null}
      {activeMs != null ? (
        <View style={styles.row}>
          <LocaleUiText style={styles.label}>{t("settings.lastActiveLabel")}</LocaleUiText>
          <Text style={styles.value}>
            {formatDisplayTimestamp(activeMs, locale)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
