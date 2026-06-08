import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { LANG_NATIVE_LABELS, SUPPORTED_LANGS, useI18n, type Lang } from "@/i18n";
import { radius, spacing, typography, useThemedStyles, useThemeColors } from "@/theme";

const VISIBLE_LANGS = SUPPORTED_LANGS;

export function LanguageSelector() {
  const { lang, setLang, switching, t } = useI18n();
  const colors = useThemeColors();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      track: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "flex-end",
        gap: 4,
        maxWidth: 220,
      },
      chip: {
        paddingVertical: 3,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: c.divider,
        backgroundColor: c.surfaceMuted,
      },
      chipActive: {
        backgroundColor: c.primary,
        borderColor: c.primary,
      },
      chipPressed: { opacity: 0.88 },
      chipDisabled: { opacity: 0.55 },
    })
  );

  const onSelect = useCallback(
    (next: Lang) => {
      if (switching || next === lang) return;
      void setLang(next);
    },
    [lang, setLang, switching]
  );

  return (
    <View
      style={styles.track}
      accessibilityRole="radiogroup"
      accessibilityLabel={t("language.selectorAriaLabel")}
    >
      {VISIBLE_LANGS.map((code) => {
        const active = code === lang;
        return (
          <Pressable
            key={code}
            disabled={switching}
            onPress={() => onSelect(code)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled: switching }}
            style={({ pressed }) => [
              styles.chip,
              active ? styles.chipActive : null,
              switching ? styles.chipDisabled : null,
              pressed && !active && !switching ? styles.chipPressed : null,
            ]}
          >
            <Text
              style={[
                typography.captionStrong,
                { color: active ? colors.primaryOn : colors.textMuted },
              ]}
              numberOfLines={1}
            >
              {LANG_NATIVE_LABELS[code]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
