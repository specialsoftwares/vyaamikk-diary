import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import { format, isToday } from "date-fns";

import { GlassSurface } from "@/components/ui";
import type { UserProfile } from "@/domain/types";
import { resolveLoginSubtitle } from "@/services/auth/loginTimestamps";
import { useT } from "@/i18n";
import { spacing, useThemedStyles } from "@/theme";

import { SettingsPreferenceRow } from "./SettingsPreferenceRow";

interface SettingsAccountAppPanelProps {
  user: UserProfile | null;
  sessionLastActive?: number | null;
}

function formatCompactActiveTimestamp(ms: number, todayLabel: string): string {
  if (isToday(ms)) return `${todayLabel}, ${format(ms, "h:mm a")}`;
  return format(ms, "d MMM, h:mm a");
}

/** Last active stays here. Appearance, language, and location access do not. */
export function SettingsAccountAppPanel({
  user,
  sessionLastActive,
}: SettingsAccountAppPanelProps) {
  const t = useT();

  const styles = useThemedStyles(() =>
    StyleSheet.create({
      card: {
        paddingVertical: 6,
        paddingHorizontal: spacing.sm,
        gap: 0,
      },
    })
  );

  const activeMs = useMemo(() => {
    if (user?.lastActiveAt != null && user.lastActiveAt > 0) return user.lastActiveAt;
    if (sessionLastActive != null && sessionLastActive > 0) return sessionLastActive;
    return null;
  }, [user?.lastActiveAt, sessionLastActive]);

  const lastActiveValue = useMemo(() => {
    if (activeMs == null) return t("settings.lastActiveUnknown");
    return formatCompactActiveTimestamp(activeMs, t("settings.lastActiveToday"));
  }, [activeMs, t]);

  const loginSubtitle = resolveLoginSubtitle(user);
  const showFirstSignIn = loginSubtitle?.kind === "first_login" && activeMs == null;

  return (
    <GlassSurface style={styles.card}>
      <SettingsPreferenceRow
        dense
        icon="clock-outline"
        label={t("settings.lastActiveLabel")}
        value={showFirstSignIn ? t("settings.firstLoginShort") : lastActiveValue}
        valueTone={showFirstSignIn ? "muted" : "default"}
      />
    </GlassSurface>
  );
}
