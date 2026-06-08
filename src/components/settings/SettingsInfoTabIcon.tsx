import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/theme";

interface SettingsInfoTabIconProps {
  color: string;
  focused: boolean;
}

/** Settings sliders + info mark — command centre for account and statutory info. */
export const SettingsInfoTabIcon = memo(function SettingsInfoTabIcon({
  color,
  focused,
}: SettingsInfoTabIconProps) {
  const size = focused ? 24 : 22;
  const badgeSize = focused ? 11 : 10;

  return (
    <View style={styles.wrap}>
      <MaterialCommunityIcons name="tune-variant" size={size} color={color} />
      <View style={styles.badge}>
        <MaterialCommunityIcons name="information-outline" size={badgeSize} color={color} />
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
