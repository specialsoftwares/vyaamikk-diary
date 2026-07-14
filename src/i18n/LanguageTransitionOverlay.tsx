import React, { useEffect, useRef, useState } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  Animated,
  Easing,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
} from "react-native";

import { APP_BRAND_NAME } from "@/config/brand";
import { resolveLoadedLocaleFont } from "./localeFonts";
import type { Lang } from "./types";
import {
  LANGUAGE_SWITCH_SURFACE,
  LANGUAGE_SWITCH_WAIT,
} from "./languageSwitchMessages";

const FADE_IN_MS = 150;
const FADE_OUT_MS = 150;
/** Guarantees onHidden even if the fade-out animation callback is dropped. */
const HIDE_FALLBACK_MS = FADE_OUT_MS + 250;

interface LanguageTransitionOverlayProps {
  /** Language being switched to (drives the wait copy). */
  targetLang: Lang;
  /** True while the transition is running; false starts the fade-out. */
  active: boolean;
  /** Fires once after the overlay has faded in (bounded by the controller). */
  onShown: () => void;
  /** Fires once after fade-out — the provider unmounts the overlay here. */
  onHidden: () => void;
}

/**
 * Full-screen transition layer rendered ABOVE the app tree during a language
 * switch (the tree stays mounted underneath — no full-tree replacement).
 *
 * Touch policy: intercepts touches only while `active`; the moment the
 * fade-out starts, pointerEvents flips to "none" so a slow or failed
 * animation can never block interaction. Unmount is guaranteed by a fallback
 * timer even if the Animated callback never fires.
 */
export function LanguageTransitionOverlay({
  targetLang,
  active,
  onShown,
  onHidden,
}: LanguageTransitionOverlayProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [hiding, setHiding] = useState(false);
  const shownFiredRef = useRef(false);
  const hiddenFiredRef = useRef(false);
  const onShownRef = useRef(onShown);
  const onHiddenRef = useRef(onHidden);
  onShownRef.current = onShown;
  onHiddenRef.current = onHidden;

  useEffect(() => {
    if (active) return;
    setHiding(true);
  }, [active]);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_IN_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      if (shownFiredRef.current) return;
      shownFiredRef.current = true;
      onShownRef.current();
    });
  }, [opacity]);

  useEffect(() => {
    if (!hiding) return;
    const fireHidden = () => {
      if (hiddenFiredRef.current) return;
      hiddenFiredRef.current = true;
      onHiddenRef.current();
    };
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(fireHidden);
    const fallback = setTimeout(fireHidden, HIDE_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, [hiding, opacity]);

  const waitCopy = LANGUAGE_SWITCH_WAIT[targetLang] ?? LANGUAGE_SWITCH_WAIT.en;
  // Script font only when already loaded — otherwise the system font renders
  // the script correctly while the Noto family loads in the background.
  const scriptFont = resolveLoadedLocaleFont(targetLang);
  const messageStyle = scriptFont
    ? [styles.message, { fontFamily: scriptFont }]
    : styles.message;

  return (
    <Animated.View
      style={[styles.root, { opacity }]}
      pointerEvents={hiding ? "none" : "auto"}
      accessibilityViewIsModal={!hiding}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor={LANGUAGE_SWITCH_SURFACE}
        translucent={false}
      />
      <Animated.View style={styles.center}>
        <Animated.View style={styles.logoMark}>
          <MaterialCommunityIcons
            name="notebook-edit-outline"
            size={28}
            color="#FFFFFF"
          />
        </Animated.View>
        <Text style={styles.wordmark}>{APP_BRAND_NAME}</Text>
        <Text style={messageStyle}>{waitCopy}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
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
    color: "rgba(255,255,255,0.85)",
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 24,
    textAlign: "center",
    maxWidth: 300,
  },
});
