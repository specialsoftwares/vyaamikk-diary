import React from "react";
import { StyleSheet, Text, View } from "react-native";

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  vyaamikk: {
    fontFamily: "BarlowCondensed_700Bold",
    fontSize: 32,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 2,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  diary: {
    fontFamily: "Barlow_300Light",
    fontSize: 11,
    fontWeight: "300",
    color: "rgba(255,255,255,0.92)",
    letterSpacing: 7.2,
    marginTop: 4,
    textTransform: "uppercase",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  fallbackTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
});

interface VyaamikkBootWordmarkProps {
  opacity: number;
}

/** Fonts are preloaded in BootAnimationGate before this mounts. */
export function VyaamikkBootWordmark({ opacity }: VyaamikkBootWordmarkProps) {
  return (
    <View style={[styles.wrap, { opacity }]}>
      <Text style={styles.vyaamikk}>VYAAMIKK</Text>
      <Text style={styles.diary}>DIARY</Text>
    </View>
  );
}
