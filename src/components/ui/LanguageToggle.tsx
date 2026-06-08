import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useI18n, type Lang } from "@/i18n";
import {
  radius,
  spacing,
  typography,
  useThemedStyles,
  useThemeColors,
} from "@/theme";

import { GlassSurface } from "./GlassSurface";

interface LanguageToggleProps {
  compact?: boolean;
  /** Frosted pill track (settings only — avoid in long lists). */
  glass?: boolean;
  /** Light segments on indigo auth / onboarding gradient. */
  onDark?: boolean;
}

/** @deprecated Settings uses LanguageSelector — kept for legacy imports only. */
const OPTIONS: { id: Lang; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "hi", label: "हिं" },
  { id: "ta", label: "த" },
  { id: "te", label: "తె" },
  { id: "gu", label: "ગુ" },
];

export function LanguageToggle({
  compact = true,
  glass = false,
  onDark = false,
}: LanguageToggleProps) {
  const { lang, setLang, t } = useI18n();
  const colors = useThemeColors();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      track: {
        flexDirection: "row",
        backgroundColor: onDark ? "rgba(255,255,255,0.1)" : c.surfaceMuted,
        borderRadius: radius.pill,
        padding: 3,
        borderWidth: 1,
        borderColor: onDark ? "rgba(255,255,255,0.2)" : c.divider,
      },
      trackCompact: { alignSelf: "flex-start" },
      trackGlass: {
        flexDirection: "row",
        padding: 3,
      },
      pill: {
        paddingVertical: 4,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        minWidth: 36,
        alignItems: "center",
        justifyContent: "center",
      },
      pillActive: { backgroundColor: onDark ? "#FFFFFF" : c.primary },
    })
  );

  const segmentRow = (
    <View
      style={glass ? styles.trackGlass : [styles.track, compact && styles.trackCompact]}
      accessibilityRole="tablist"
      accessibilityLabel={t("language.toggleAriaLabel")}
    >
      {OPTIONS.map((opt) => {
        const active = opt.id === lang;
        return (
          <Pressable
            key={opt.id}
            onPress={() => {
              if (!active) void setLang(opt.id);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.pill,
              active ? styles.pillActive : null,
              pressed && !active ? { opacity: 0.85 } : null,
            ]}
          >
            <Text
              style={[
                typography.captionStrong,
                {
                  color: onDark
                    ? active
                      ? colors.primaryDark
                      : "rgba(255,255,255,0.55)"
                    : active
                      ? colors.primaryOn
                      : colors.textMuted,
                },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (glass) {
    return (
      <GlassSurface variant="pill" padded={false} hairline>
        {segmentRow}
      </GlassSurface>
    );
  }

  return segmentRow;
}
