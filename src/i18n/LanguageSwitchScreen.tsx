import React, { useEffect, useRef } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { APP_BRAND_NAME } from "@/config/brand";
import type { Lang } from "./types";
import {
  LANGUAGE_SWITCH_FONT,
  LANGUAGE_SWITCH_SURFACE,
  LANGUAGE_SWITCH_WAIT,
} from "./languageSwitchMessages";

interface LanguageSwitchScreenProps {
  targetLang: Lang;
  /** Fires once after the buffer has mounted and painted. */
  onPainted: (paintedAtMs: number) => void;
}

/**
 * Full-screen language switch buffer — replaces the app tree (not a Modal).
 * No animation; deep indigo surface with logo mark and target-language wait copy.
 */
export function LanguageSwitchScreen({
  targetLang,
  onPainted,
}: LanguageSwitchScreenProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    let active = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!active || firedRef.current) return;
        firedRef.current = true;
        onPainted(Date.now());
      });
    });
    return () => {
      active = false;
    };
  }, [onPainted]);

  const waitCopy = LANGUAGE_SWITCH_WAIT[targetLang] ?? LANGUAGE_SWITCH_WAIT.en;
  const scriptFont = LANGUAGE_SWITCH_FONT[targetLang];
  const messageStyle = scriptFont
    ? [styles.message, { fontFamily: scriptFont }]
    : styles.message;

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={LANGUAGE_SWITCH_SURFACE}
        translucent={false}
      />
      <View style={styles.center}>
        <View style={styles.logoMark}>
          <MaterialCommunityIcons
            name="notebook-edit-outline"
            size={28}
            color="#FFFFFF"
          />
        </View>
        <Text style={styles.wordmark}>{APP_BRAND_NAME}</Text>
        <Text style={messageStyle}>{waitCopy}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: LANGUAGE_SWITCH_SURFACE,
    ...Platform.select({
      android: { paddingTop: StatusBar.currentHeight ?? 0 },
      default: {},
    }),
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(99, 102, 241, 0.95)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  wordmark: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.2,
    marginBottom: 28,
    textAlign: "center",
  },
  message: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 300,
  },
});
