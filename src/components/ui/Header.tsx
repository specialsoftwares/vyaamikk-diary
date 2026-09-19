import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Href } from "expo-router";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { useT } from "@/i18n";
import { useSmartBack, type NavigationOrigin } from "@/navigation";
import { executiveHeaderBackStyle } from "@/theme/formLayer";
import { spacing, typography, useThemedStyles } from "@/theme";

interface HeaderProps {
  title: string;
  subtitle?: string;
  /** Indigo executive styling for composer, settings sub-screens, etc. */
  variant?: "default" | "executive";
  showBack?: boolean;
  rightSlot?: React.ReactNode;
  /** Origin when stack cannot pop (see `NavigationOrigin`). */
  backFrom?: NavigationOrigin | string;
  fallback?: Href;
  onBackPress?: () => void;
  dirty?: boolean;
  /** Visible control remains ←. Defaults to t("common.goBack"). */
  backAccessibilityLabel?: string;
}

export function Header({
  title,
  subtitle,
  variant = "default",
  showBack = false,
  rightSlot,
  backFrom,
  fallback,
  onBackPress,
  dirty,
  backAccessibilityLabel,
}: HeaderProps) {
  /** Parent screens (e.g. composer) own `useSmartBack` + `usePreventRemove` — avoid duplicate hooks. */
  const { goBack: smartGoBack } = useSmartBack({
    from: backFrom,
    fallback,
    dirty,
    handleHardwareBack: false,
    enabled: showBack && !onBackPress,
  });
  const goBack = onBackPress ?? smartGoBack;
  const t = useT();
  const backLabel = backAccessibilityLabel ?? t("common.goBack");
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      container: { paddingBottom: spacing.md },
      row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
      back: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.surfaceMuted,
      },
      backExecutive: executiveHeaderBackStyle(c),
      backText: { ...typography.titleMd, color: c.text, marginTop: -2 },
      backTextExecutive: { color: c.primaryDark },
      titleWrap: { flex: 1 },
      title: { ...typography.titleLg, color: c.text },
      titleExecutive: { color: c.primaryDark },
      subtitle: { ...typography.caption, color: c.textMuted, marginTop: 2 },
      right: { marginLeft: spacing.sm },
    })
  );
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [
              styles.back,
              variant === "executive" && styles.backExecutive,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
          >
            <Text
              style={[
                styles.backText,
                variant === "executive" && styles.backTextExecutive,
              ]}
            >
              ←
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.titleWrap}>
          <LocaleUiText style={[styles.title, variant === "executive" && styles.titleExecutive]}>
            {title}
          </LocaleUiText>
          {subtitle ? <LocaleUiText style={styles.subtitle}>{subtitle}</LocaleUiText> : null}
        </View>
        {rightSlot ? <View style={styles.right}>{rightSlot}</View> : null}
      </View>
    </View>
  );
}
