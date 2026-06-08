import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/theme";

interface CalendarMapsTabIconProps {
  color: string;
  focused: boolean;
}

/** Calendar + map-pin — communicates dates and location footprints. */
export const CalendarMapsTabIcon = memo(function CalendarMapsTabIcon({
  color,
  focused,
}: CalendarMapsTabIconProps) {
  const size = focused ? 24 : 22;
  const pinSize = focused ? 13 : 12;

  return (
    <View style={styles.wrap}>
      <MaterialCommunityIcons name="calendar-month-outline" size={size} color={color} />
      <View style={styles.pin}>
        <MaterialCommunityIcons name="map-marker" size={pinSize} color={color} />
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
  pin: {
    position: "absolute",
    right: -1,
    bottom: 0,
  },
});
