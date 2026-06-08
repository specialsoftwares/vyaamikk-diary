import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { LuxuryPressable } from "@/components/ui/LuxuryPressable";
import { useT } from "@/i18n";
import { executiveCardDepth } from "@/theme/cardDepth";
import { executiveSearchGlow } from "@/theme/executiveLayer";
import { radius, spacing, typography, useTheme, useThemedStyles } from "@/theme";

interface GlobalSearchBarProps {
  testID?: string;
}

/** Executive search affordance — premium presence, opens full search screen. */
export function GlobalSearchBar({ testID }: GlobalSearchBarProps) {
  const t = useT();
  const router = useRouter();
  const { colors, resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";

  const placeholder = t("globalSearch.placeholder");

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      outer: {
        gap: spacing.xs,
      },
      pressable: {
        borderRadius: radius.xl,
        overflow: "hidden",
        ...executiveSearchGlow(isDark),
        ...executiveCardDepth(isDark, c, 2),
      },
      inner: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 4,
        gap: spacing.sm,
        minHeight: 52,
      },
      iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.primaryLight,
      },
      copy: { flex: 1, gap: 2 },
      placeholder: {
        ...typography.bodyStrong,
        color: c.text,
      },
      hint: {
        ...typography.micro,
        color: c.textSubtle,
        letterSpacing: 0.2,
      },
    })
  );

  const glassStops = useMemo(
    () =>
      isDark
        ? ([colors.surfaceElevated, colors.surfaceMuted] as const)
        : ([colors.surface, colors.surfaceMuted] as const),
    [colors.surface, colors.surfaceElevated, colors.surfaceMuted, isDark]
  );

  return (
    <View style={styles.outer}>
      <LuxuryPressable
        onPress={() => router.push("/(app)/search")}
        style={styles.pressable}
        accessibilityRole="button"
        accessibilityLabel={t("globalSearch.open")}
        testID={testID ?? "global-search-bar"}
      >
        <LinearGradient colors={glassStops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.inner}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="magnify" size={22} color={colors.primaryDark} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.placeholder} numberOfLines={1}>
                {placeholder}
              </Text>
              <LocaleUiText style={styles.hint} numberOfLines={1}>
                {t("executive.searchHint")}
              </LocaleUiText>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
          </View>
        </LinearGradient>
      </LuxuryPressable>
    </View>
  );
}
