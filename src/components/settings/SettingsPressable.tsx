import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { LUXURY_PRESS } from "@/theme/luxuryTokens";

/** Branded Android ripple — Settings primitives only. */
export const SETTINGS_ANDROID_RIPPLE = {
  color: "rgba(99, 102, 241, 0.10)",
  borderless: false,
} as const;

function useReduceMotionEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setEnabled(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => {
      setEnabled(v);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return enabled;
}

/**
 * Settings-scoped pressable. Visual state is owned by RN `pressed` (iOS scale)
 * or native ripple (Android) — never a persisted Reanimated scale/opacity.
 */
export function SettingsPressable({
  children,
  style,
  disabled,
  onPress,
  android_ripple,
  ...rest
}: PressableProps) {
  const reduceMotion = useReduceMotionEnabled();
  const isAndroid = Platform.OS === "android";
  const ripple = (() => {
    if (android_ripple !== undefined) return android_ripple;
    if (!isAndroid || disabled) return undefined;
    if (reduceMotion) {
      return { color: "transparent", borderless: false as const };
    }
    return SETTINGS_ANDROID_RIPPLE;
  })();

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPress={onPress}
      android_ripple={ripple}
      style={(state) => {
        const resolved: StyleProp<ViewStyle> =
          typeof style === "function" ? style(state) : style;
        const iosScale: ViewStyle | null =
          !isAndroid && state.pressed && !disabled && !reduceMotion
            ? { transform: [{ scale: LUXURY_PRESS.scale }] }
            : null;
        return [resolved, iosScale];
      }}
    >
      {children}
    </Pressable>
  );
}
