import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/theme";

interface StatutoryInfoTabIconProps {
  color: string;
  focused: boolean;
}

/**
 * Filing document + compliance shield — statutory due dates & filings.
 * Distinct from Calendar & Maps (calendar + pin) and You (diary + account).
 */
export const StatutoryInfoTabIcon = memo(function StatutoryInfoTabIcon({
  color,
  focused,
}: StatutoryInfoTabIconProps) {
  const size = focused ? 24 : 22;
  const badgeSize = focused ? 11 : 10;

  return (
    <View style={styles.wrap}>
      <MaterialCommunityIcons name="file-document-outline" size={size} color={color} />
      <View style={styles.badge}>
        <MaterialCommunityIcons name="shield-check-outline" size={badgeSize} color={color} />
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
    right: -2,
    bottom: -1,
  },
});
