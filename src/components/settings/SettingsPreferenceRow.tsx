import React, { type ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { SettingsPressable } from "./SettingsPressable";
import { spacing, typography, useTheme, useThemedStyles } from "@/theme";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export type SettingsPreferenceValueTone = "default" | "muted" | "positive" | "warning";

interface SettingsPreferenceRowProps {
  icon?: IconName;
  label: string;
  /** Right-side status text when not using `trailing`. */
  value?: string;
  valueTone?: SettingsPreferenceValueTone;
  /** Custom right control (toggle, segmented, pill). */
  trailing?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  showChevron?: boolean;
  /** Tighter single-line row for Account & App strip. */
  dense?: boolean;
}

export function SettingsPreferenceRow({
  icon,
  label,
  value,
  trailing,
  onPress,
  accessibilityLabel,
  showChevron = Boolean(onPress && !trailing),
  valueTone = "default",
  dense = false,
}: SettingsPreferenceRowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        flexDirection: "row",
        alignItems: "center",
        gap: dense ? 6 : spacing.sm,
        minHeight: dense ? 32 : 38,
        paddingVertical: dense ? 2 : 5,
      },
      iconWrap: {
        width: dense ? 16 : 22,
        alignItems: "center",
        justifyContent: "center",
      },
      label: {
        ...(dense ? typography.micro : typography.captionStrong),
        color: c.textMuted,
        flexShrink: 1,
        minWidth: dense ? 64 : 92,
        maxWidth: dense ? "38%" : undefined,
      },
      trailing: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: spacing.xs,
        minWidth: 0,
      },
      value: {
        ...(dense ? typography.micro : typography.captionStrong),
        color:
          valueTone === "positive"
            ? c.primaryDark
            : valueTone === "warning"
              ? c.danger
              : valueTone === "muted"
                ? c.textMuted
                : c.text,
        textAlign: "right",
        flexShrink: 1,
        fontWeight: dense ? "600" : undefined,
      },
      chevron: {
        ...(dense ? typography.micro : typography.caption),
        color: c.textSubtle,
        marginLeft: 2,
      },
    })
  );

  const content = (
    <>
      {icon ? (
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name={icon} size={dense ? 14 : 16} color={colors.textMuted} />
        </View>
      ) : null}
      <LocaleUiText style={styles.label} numberOfLines={dense ? 2 : 1}>
        {label}
      </LocaleUiText>
      <View style={styles.trailing}>
        {trailing ??
          (value ? (
            <Text style={styles.value} numberOfLines={1}>
              {value}
            </Text>
          ) : null)}
        {showChevron ? <Text style={styles.chevron}>›</Text> : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <SettingsPressable
        onPress={onPress}
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
      >
        {content}
      </SettingsPressable>
    );
  }

  return (
    <View style={styles.row} accessibilityLabel={accessibilityLabel ?? label}>
      {content}
    </View>
  );
}

export function SettingsPreferenceDivider() {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      line: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: c.divider,
        marginVertical: 2,
      },
    })
  );
  return <View style={styles.line} />;
}
