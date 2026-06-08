import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/theme";

interface SavedRecordsTabIconProps {
  color: string;
  focused: boolean;
}

/**
 * Saved Records tab — the archive / work hub.
 * Outline "archive" glyph aligned with the other tab icons.
 */
export const SavedRecordsTabIcon = memo(function SavedRecordsTabIcon({
  color,
  focused,
}: SavedRecordsTabIconProps) {
  const size = focused ? 24 : 22;
  return (
    <View style={styles.wrap}>
      <MaterialCommunityIcons
        name={focused ? "archive-outline" : "archive-outline"}
        size={size}
        color={color}
      />
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
});
