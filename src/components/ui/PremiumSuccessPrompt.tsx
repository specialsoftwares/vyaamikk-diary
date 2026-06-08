import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { ExecutiveTrustCue } from "@/components/executive/ExecutiveTrustCue";
import { LedgerJaaliPattern } from "@/components/signature/LedgerJaaliPattern";
import { Banner } from "@/components/ui/Banner";
import { PremiumCard } from "@/components/ui/PremiumCard";
import { SubtlePatternCorner } from "@/components/ui/SubtlePatternCorner";
import { executiveCardDepth } from "@/theme/cardDepth";
import {
  EXECUTIVE_SUCCESS_FADE_MS,
  executiveHeroGradient,
} from "@/theme/executiveLayer";
import { radius, spacing, typography, useTheme, useThemedStyles } from "@/theme";
import type { CategoryAccentKey } from "@/theme/categoryAccents";
import { useCategoryAccent } from "@/theme/useBrandTokens";
import { SIGNATURE_PATTERN_OPACITY } from "@/theme/signatureLayer";

interface PremiumSuccessPromptProps {
  title: string;
  subtitle?: string;
  warning?: { title: string; message: string } | null;
  error?: string | null;
  children: React.ReactNode;
  accentKey?: CategoryAccentKey;
  /** Subtle trust lines — no legal wall of text. */
  trustMessages?: string[];
}

/**
 * Post-save / confirmation panel — executive gradient title band + action stack.
 */
export function PremiumSuccessPrompt({
  title,
  subtitle,
  warning,
  error,
  children,
  accentKey = "work",
  trustMessages,
}: PremiumSuccessPromptProps) {
  const accent = useCategoryAccent(accentKey);
  const { colors, resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const stops = executiveHeroGradient(resolvedMode, "success");
  const depth = executiveCardDepth(isDark, colors, 1);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: EXECUTIVE_SUCCESS_FADE_MS,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { gap: spacing.lg },
      titleBand: {
        ...depth,
        overflow: "hidden",
      },
      titleInner: {
        padding: spacing.lg + 2,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.md,
      },
      checkRing: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: StyleSheet.hairlineWidth,
      },
      titleCol: { flex: 1, gap: spacing.xs },
      title: { ...typography.titleLg, color: c.text },
      subtitle: { ...typography.body, color: c.textMuted },
      trustCol: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 2 },
      actions: { gap: spacing.md },
    })
  );

  return (
    <Animated.View style={[styles.wrap, { opacity: fade }]}>
      <View style={styles.titleBand}>
        <LinearGradient colors={stops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <LedgerJaaliPattern
            opacity={SIGNATURE_PATTERN_OPACITY.success}
            color={accent.main}
            variant="jaali"
          />
          <SubtlePatternCorner
            corner="topRight"
            opacity={SIGNATURE_PATTERN_OPACITY.corner}
            color={accent.main}
          />
          <View style={styles.titleInner}>
            <View
              style={[
                styles.checkRing,
                { backgroundColor: accent.soft, borderColor: accent.main + "44" },
              ]}
            >
              <MaterialCommunityIcons name="check-circle-outline" size={26} color={accent.main} />
            </View>
            <View style={styles.titleCol}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
          </View>
          {trustMessages?.length ? (
            <View style={styles.trustCol}>
              {trustMessages.map((msg) => (
                <ExecutiveTrustCue key={msg} message={msg} />
              ))}
            </View>
          ) : null}
        </LinearGradient>
      </View>
      {warning ? (
        <Banner tone="warning" title={warning.title} message={warning.message} />
      ) : null}
      {error ? <Banner tone="danger" message={error} /> : null}
      <PremiumCard>
        <View style={styles.actions}>{children}</View>
      </PremiumCard>
    </Animated.View>
  );
}
