import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

interface ProfilePolicyGuidanceCardProps {}

export function ProfilePolicyGuidanceCard(_props: ProfilePolicyGuidanceCardProps) {
  const t = useT();
  const router = useRouter();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      card: {
        backgroundColor: c.surfaceMuted,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.sm,
        marginTop: spacing.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
      },
      title: { ...typography.bodyStrong, color: c.text },
      bullet: { ...typography.caption, color: c.textMuted, lineHeight: 20 },
      links: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.xs },
      link: { ...typography.captionStrong, color: c.primary },
    })
  );

  const openPrivacy = () => {
    router.push({ pathname: "/legal/[doc]", params: { doc: "privacy" } });
  };

  return (
    <View style={styles.card}>
      <LocaleUiText style={styles.title}>{t("identity.policyTitle")}</LocaleUiText>
      <LocaleUiText style={styles.bullet}>• {t("identity.policyEditable")}</LocaleUiText>
      <LocaleUiText style={styles.bullet}>• {t("identity.policyLimits")}</LocaleUiText>
      <LocaleUiText style={styles.bullet}>• {t("identity.policyUeid")}</LocaleUiText>
      <LocaleUiText style={styles.bullet}>• {t("identity.policyMobile")}</LocaleUiText>
      <LocaleUiText style={styles.bullet}>• {t("profilePolicy.fieldOfWorkRecommendation")}</LocaleUiText>
      <View style={styles.links}>
        <Pressable
          onPress={() => router.push({ pathname: "/legal/[doc]", params: { doc: "terms" } })}
          accessibilityRole="link"
        >
          <LocaleUiText style={styles.link}>{t("legal.linkTerms")}</LocaleUiText>
        </Pressable>
        <Pressable onPress={openPrivacy} accessibilityRole="link">
          <LocaleUiText style={styles.link}>{t("settings.privacy")}</LocaleUiText>
        </Pressable>
      </View>
    </View>
  );
}
