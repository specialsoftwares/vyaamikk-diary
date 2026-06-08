import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { Image, StyleSheet, Text, View } from "react-native";

import { ExecutiveTrustCue } from "@/components/executive/ExecutiveTrustCue";
import { LedgerJaaliPattern } from "@/components/signature/LedgerJaaliPattern";
import type { UserProfile } from "@/domain/types";
import { profileLogoInitials } from "@/services/profileLogo/storage";
import { useT } from "@/i18n";
import { executiveCardDepth } from "@/theme/cardDepth";
import { radius, spacing, typography, useTheme, useThemedStyles } from "@/theme";
import { SIGNATURE_PATTERN_OPACITY } from "@/theme/signatureLayer";

interface IdentityPreviewCardProps {
  user: UserProfile;
  displayName: string;
  businessName: string;
  logoUri: string | null;
}

export function IdentityPreviewCard({
  user,
  displayName,
  businessName,
  logoUri,
}: IdentityPreviewCardProps) {
  const t = useT();
  const { colors, resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const depth = executiveCardDepth(isDark, colors, 2);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      card: {
        ...depth,
        padding: spacing.lg,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        marginBottom: spacing.sm,
        overflow: "hidden",
        position: "relative",
      },
      avatar: {
        width: 56,
        height: 56,
        borderRadius: radius.md,
        overflow: "hidden",
        backgroundColor: c.primaryLight,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: c.divider,
      },
      avatarImage: { width: 56, height: 56 },
      initials: { ...typography.bodyStrong, color: c.primaryDark },
      copy: { flex: 1, gap: 4 },
      name: { ...typography.bodyStrong, color: c.text },
      business: { ...typography.caption, color: c.textMuted },
      ueid: { ...typography.micro, color: c.textSubtle, marginTop: 2 },
      label: {
        ...typography.micro,
        color: c.textSubtle,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: spacing.sm,
      },
      accentStrip: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
        borderTopLeftRadius: radius.lg,
        borderBottomLeftRadius: radius.lg,
      },
      trustWrap: { marginBottom: spacing.lg },
    })
  );

  const nameLine = displayName.trim() || businessName.trim() || t("identity.previewNameFallback");
  const businessLine = businessName.trim();
  const initials = React.useMemo(
    () =>
      profileLogoInitials(
        displayName.trim() || null,
        businessName.trim() || null,
        user.phoneE164?.slice(-2) ?? "VD"
      ),
    [displayName, businessName, user.phoneE164]
  );

  return (
    <View>
      <LocaleUiText style={styles.label}>{t("identity.previewLabel")}</LocaleUiText>
      <View style={styles.card} accessibilityRole="summary">
        <View style={[styles.accentStrip, { backgroundColor: colors.primary }]} />
        <LedgerJaaliPattern
          opacity={SIGNATURE_PATTERN_OPACITY.hero}
          color={colors.primary}
          variant="ledger"
        />
        <View style={styles.avatar}>
          {logoUri ? (
            <Image
              source={{ uri: logoUri }}
              style={styles.avatarImage}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Text style={styles.initials}>{initials}</Text>
          )}
        </View>
        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={2}>
            {nameLine}
          </Text>
          {businessLine && businessLine !== nameLine ? (
            <Text style={styles.business} numberOfLines={1}>
              {businessLine}
            </Text>
          ) : null}
          <Text style={styles.ueid} numberOfLines={1}>
            {user.ueid}
          </Text>
        </View>
      </View>
      <View style={styles.trustWrap}>
        <ExecutiveTrustCue message={t("executive.trust.user_record")} icon="account-outline" />
      </View>
    </View>
  );
}
