import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useFonts, Barlow_300Light } from "@expo-google-fonts/barlow";
import { BarlowCondensed_700Bold } from "@expo-google-fonts/barlow-condensed";

const SURFACE = "#1E1B4B";
const GOLD = "#C9A84C";
const BRAND_INDIGO = "#3B41C5";

interface TelemetryConsentModalProps {
  visible: boolean;
  onAllow: () => void;
  onDecline: () => void;
}

export function TelemetryConsentModal({
  visible,
  onAllow,
  onDecline,
}: TelemetryConsentModalProps) {
  const [fontsLoaded] = useFonts({
    Barlow_300Light,
    BarlowCondensed_700Bold,
  });
  const titleFamily = fontsLoaded ? "BarlowCondensed_700Bold" : undefined;
  const bodyFamily = fontsLoaded ? "Barlow_300Light" : undefined;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={[styles.title, titleFamily ? { fontFamily: titleFamily } : null]}>
            Help improve Vyaamikk Diary
          </Text>
          <View style={styles.rule} />
          <Text style={[styles.body, bodyFamily ? { fontFamily: bodyFamily } : null]}>
            We would like to collect anonymous crash reports to help us fix issues faster. No
            personal data, business records, financial information, or identifiable details are
            ever included. You can change this anytime in Settings.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onAllow}
            style={styles.primary}
          >
            <Text style={styles.primaryLabel}>Allow crash reports</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onDecline}
            style={styles.secondary}
          >
            <Text style={styles.secondaryLabel}>No thanks</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(8, 7, 22, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: SURFACE,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  rule: {
    height: 2,
    width: 48,
    backgroundColor: GOLD,
    marginTop: 12,
    marginBottom: 16,
  },
  body: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    fontWeight: "300",
    lineHeight: 21,
    marginBottom: 22,
  },
  primary: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND_INDIGO,
    borderRadius: 0,
    marginBottom: 10,
  },
  primaryLabel: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  secondary: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.40)",
    borderRadius: 0,
  },
  secondaryLabel: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
