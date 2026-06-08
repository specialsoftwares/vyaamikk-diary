import { LinearGradient } from "expo-linear-gradient";
import React, { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { LedgerJaaliPattern } from "@/components/signature/LedgerJaaliPattern";
import { SubtlePatternCorner } from "@/components/ui/SubtlePatternCorner";
import { executiveCardDepth } from "@/theme/cardDepth";
import { executiveHeroGradient } from "@/theme/executiveLayer";
import { radius, spacing, useTheme } from "@/theme";
import {
  SIGNATURE_PATTERN_OPACITY,
  type SignatureHeroVariant,
} from "@/theme/signatureLayer";

interface SignatureHeroSurfaceProps {
  children: React.ReactNode;
  variant?: SignatureHeroVariant;
  patternColor?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  padded?: boolean;
}

/**
 * Executive hero band — gradient depth, faint texture, Level-1 card hierarchy.
 */
function SignatureHeroSurfaceInner({
  children,
  variant = "dashboard",
  patternColor,
  style,
  contentStyle,
  padded = true,
}: SignatureHeroSurfaceProps) {
  const { colors, resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const tint = patternColor ?? colors.primary;
  const stops = executiveHeroGradient(resolvedMode, variant);
  const depth = executiveCardDepth(isDark, colors, 1);

  return (
    <View style={[depth, { borderColor: colors.divider, overflow: "hidden" }, style]}>
      <LinearGradient
        colors={stops}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <LedgerJaaliPattern
          opacity={SIGNATURE_PATTERN_OPACITY.hero}
          color={tint}
          variant={variant === "statutory" ? "ledger" : "jaali"}
        />
        <SubtlePatternCorner
          corner="topRight"
          opacity={SIGNATURE_PATTERN_OPACITY.corner}
          color={tint}
        />
        <View style={[padded ? styles.content : null, contentStyle]}>{children}</View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: {
    position: "relative",
  },
  content: {
    padding: spacing.lg,
    paddingVertical: spacing.md + 2,
  },
});

export const SignatureHeroSurface = memo(SignatureHeroSurfaceInner);
