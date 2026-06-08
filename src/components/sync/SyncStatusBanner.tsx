import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { getAuthEntryHref } from "@/config/authWrapper";
import { useSync } from "@/state/sync";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

/**
 * Non-intrusive sync / session status — never blocks typing.
 */
export function SyncStatusBanner() {
  const t = useT();
  const router = useRouter();
  const { status, pendingCount, clearSessionLock, flush } = useSync();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: {
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: spacing.md,
        borderWidth: StyleSheet.hairlineWidth,
      },
      session: {
        backgroundColor: c.surfaceMuted,
        borderColor: c.warning,
      },
      pending: {
        backgroundColor: c.primaryLight,
        borderColor: c.primary,
      },
      offline: {
        backgroundColor: c.surfaceMuted,
        borderColor: c.divider,
      },
      text: { ...typography.caption, color: c.text },
      action: { ...typography.captionStrong, color: c.primaryDark, marginTop: 4 },
    })
  );

  if (status === "idle" || status === "pulling") return null;

  if (status === "syncing") {
    return (
      <View style={[styles.wrap, styles.pending]}>
        <LocaleUiText style={styles.text}>{t("sync.syncing")}</LocaleUiText>
      </View>
    );
  }

  if (status === "session_expired") {
    return (
      <Pressable
        style={[styles.wrap, styles.session]}
        onPress={() => {
          clearSessionLock();
          router.push(getAuthEntryHref());
        }}
      >
        <LocaleUiText style={styles.text}>{t("sync.sessionExpiredBanner")}</LocaleUiText>
        <LocaleUiText style={styles.action}>{t("sync.tapToReauth")}</LocaleUiText>
      </Pressable>
    );
  }

  if (status === "offline" || status === "pending") {
    return (
      <Pressable style={[styles.wrap, status === "offline" ? styles.offline : styles.pending]} onPress={() => void flush()}>
        <LocaleUiText style={styles.text}>
          {status === "offline"
            ? t("sync.offlineSaved", { count: pendingCount })
            : t("sync.pendingSync", { count: pendingCount })}
        </LocaleUiText>
      </Pressable>
    );
  }

  return null;
}
