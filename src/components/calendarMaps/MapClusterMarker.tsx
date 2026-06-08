import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Marker } from "react-native-maps";

import type { MapLocationCluster } from "@/services/calendarMaps/mapClustering";
import { radius, typography, useTheme } from "@/theme";

const PIN_MARKER_COLOR = "#D97706";

interface MapClusterMarkerProps {
  cluster: MapLocationCluster;
  pinColor: string;
  onPress: () => void;
}

export const MapClusterMarker = memo(function MapClusterMarker({
  cluster,
  pinColor,
  onPress,
}: MapClusterMarkerProps) {
  const { colors } = useTheme();
  const showBadge = cluster.count > 1;
  const isPin = cluster.footprintSource === "pin_approximate";
  const markerColor = isPin ? PIN_MARKER_COLOR : pinColor;
  const iconName = isPin ? "map-marker-radius-outline" : "map-marker";

  return (
    <Marker
      identifier={cluster.id}
      coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
      onPress={onPress}
      tracksViewChanges={false}
    >
      <View style={styles.wrap} collapsable={false}>
        <MaterialCommunityIcons name={iconName} size={isPin ? 34 : 36} color={markerColor} />
        {showBadge ? (
          <View
            style={[
              styles.badge,
              { backgroundColor: isPin ? PIN_MARKER_COLOR : colors.primary },
            ]}
          >
            <Text style={styles.badgeText}>{cluster.count > 99 ? "99+" : cluster.count}</Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", width: 44, height: 44 },
  badge: {
    position: "absolute",
    top: 2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  badgeText: { ...typography.micro, color: "#FFFFFF", fontWeight: "700" },
});
