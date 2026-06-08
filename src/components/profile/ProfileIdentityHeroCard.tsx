import React, { useState } from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { authV2GradientStops } from "@/auth-v2/theme/authV2Theme";
import type { UserProfile } from "@/domain/types";
import { useT } from "@/i18n";
import { radius, spacing, typography, useTheme } from "@/theme";
import { formatShortDate } from "@/utils/date";
import { maskMobile } from "@/utils/phone";

interface ProfileIdentityHeroCardProps {
  user: UserProfile;
  memberSinceMs: number;
}

/** Executive indigo identity header — UEID, verified mobile, member since. */
export function ProfileIdentityHeroCard({ user, memberSinceMs }: ProfileIdentityHeroCardProps) {
  const t = useT();
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const gradient = authV2GradientStops(isDark);
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await Clipboard.setStringAsync(user.ueid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onMobileInfo = () => {
    Alert.alert(t("identity.verifiedMobileLabel"), t("identity.verifiedMobileSupport"));
  };

  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.topRow}>
        <MaterialCommunityIcons name="shield-check-outline" size={22} color="rgba(255,255,255,0.85)" />
        <LocaleUiText style={styles.verified}>{t("identity.verifiedAccount")}</LocaleUiText>
      </View>

      <LocaleUiText style={styles.ueidLabel}>{t("ueid.label")}</LocaleUiText>
      <Text style={styles.ueidValue} selectable accessibilityRole="text">
        {user.ueid}
      </Text>
      <Pressable onPress={() => void onCopy()} accessibilityRole="button" style={styles.copyBtn}>
        <LocaleUiText style={styles.copyText}>{copied ? t("ueid.copied") : t("ueid.copy")}</LocaleUiText>
      </Pressable>

      <View style={styles.metaRow}>
        <Pressable
          style={styles.metaItem}
          onPress={onMobileInfo}
          accessibilityRole="button"
          accessibilityHint={t("identity.verifiedMobileHint")}
        >
          <LocaleUiText style={styles.metaLabel}>{t("identity.verifiedMobileLabel")}</LocaleUiText>
          <Text style={styles.metaValue}>{maskMobile(user.phoneE164)}</Text>
          <LocaleUiText style={styles.metaHint}>{t("identity.verifiedMobileHint")}</LocaleUiText>
        </Pressable>
        <View style={styles.metaDivider} />
        <View style={styles.metaItem}>
          <LocaleUiText style={styles.metaLabel}>{t("profile.joined")}</LocaleUiText>
          <Text style={styles.metaValue}>{formatShortDate(memberSinceMs)}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  verified: {
    ...typography.captionStrong,
    color: "rgba(255,255,255,0.72)",
    letterSpacing: 0.3,
  },
  ueidLabel: {
    ...typography.micro,
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 1.4,
    marginTop: spacing.xs,
  },
  ueidValue: {
    ...typography.mono,
    fontSize: 22,
    color: "#FFFFFF",
    lineHeight: 28,
  },
  copyBtn: { alignSelf: "flex-start", paddingVertical: spacing.xs },
  copyText: { ...typography.captionStrong, color: "rgba(255,255,255,0.9)" },
  metaRow: {
    flexDirection: "row",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.18)",
  },
  metaItem: { flex: 1, gap: 2 },
  metaDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginHorizontal: spacing.md,
  },
  metaLabel: { ...typography.micro, color: "rgba(255,255,255,0.55)" },
  metaValue: { ...typography.captionStrong, color: "#FFFFFF" },
  metaHint: {
    ...typography.micro,
    color: "rgba(255,255,255,0.45)",
    lineHeight: 14,
    marginTop: 2,
  },
});
