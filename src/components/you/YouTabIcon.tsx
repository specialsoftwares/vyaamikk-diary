import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ComponentProps } from "react";
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/theme";

export type YouTabIconConcept = "notebook" | "ledger" | "command";

type MciName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface YouTabIconProps {
  color: string;
  focused: boolean;
  /** QA only: set `EXPO_PUBLIC_YOU_TAB_ICON_CONCEPT` to `ledger` or `command`. */
  concept?: YouTabIconConcept;
}

/**
 * Resolves which of the three tab-icon concepts to render.
 * Production default: `notebook` (open diary + identity badge).
 */
export function resolveYouTabIconConcept(): YouTabIconConcept {
  const v = process.env.EXPO_PUBLIC_YOU_TAB_ICON_CONCEPT;
  if (v === "ledger" || v === "command") return v;
  return "notebook";
}

const MAIN_GLYPH: Record<YouTabIconConcept, MciName> = {
  notebook: "book-open-page-variant-outline",
  ledger: "file-document-multiple-outline",
  command: "view-dashboard-outline",
};

/**
 * You tab — personal business command centre (diary + identity).
 * Outline style aligned with `CalendarMapsTabIcon`.
 */
export const YouTabIcon = memo(function YouTabIcon({
  color,
  focused,
  concept = resolveYouTabIconConcept(),
}: YouTabIconProps) {
  const size = focused ? 24 : 22;
  const badgeSize = focused ? 10 : 9;

  return (
    <View style={styles.wrap}>
      <MaterialCommunityIcons name={MAIN_GLYPH[concept]} size={size} color={color} />
      <View style={styles.badge}>
        <MaterialCommunityIcons name="account-circle-outline" size={badgeSize} color={color} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  badge: {
    position: "absolute",
    right: -1,
    bottom: 0,
  },
});
