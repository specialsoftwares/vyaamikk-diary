import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import type { CalendarMapsMode } from "@/components/calendarMaps/CalendarMapsModeSwitch";

interface CalendarMapsModeTransitionProps {
  mode: CalendarMapsMode;
  calendar: React.ReactNode;
  map: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Lightweight crossfade between Calendar and Map panels. */
export function CalendarMapsModeTransition({
  mode,
  calendar,
  map,
  style,
}: CalendarMapsModeTransitionProps) {
  const calendarOpacity = useRef(new Animated.Value(mode === "calendar" ? 1 : 0)).current;
  const mapOpacity = useRef(new Animated.Value(mode === "map" ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(calendarOpacity, {
        toValue: mode === "calendar" ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(mapOpacity, {
        toValue: mode === "map" ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [mode, calendarOpacity, mapOpacity]);

  return (
    <View style={[styles.host, style]}>
      <Animated.View
        style={[styles.layer, { opacity: calendarOpacity }]}
        pointerEvents={mode === "calendar" ? "auto" : "none"}
      >
        {calendar}
      </Animated.View>
      <Animated.View
        style={[styles.layer, { opacity: mapOpacity }]}
        pointerEvents={mode === "map" ? "auto" : "none"}
      >
        {map}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, minHeight: 280, overflow: "hidden" },
  layer: { ...StyleSheet.absoluteFillObject },
});
