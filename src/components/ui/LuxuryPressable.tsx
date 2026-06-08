import React, { useCallback } from "react";
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { LUXURY_PRESS } from "@/theme/luxuryTokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface LuxuryPressableProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  /** When false, skips scale animation (e.g. embedded list rows). */
  tactile?: boolean;
}

/** Shared tactile press — scale 0.97, ~120ms ease-out. Visual only. */
export function LuxuryPressable({
  children,
  style,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  tactile = true,
  ...rest
}: LuxuryPressableProps) {
  const scale = useSharedValue(1);

  const animateTo = useCallback(
    (target: number) => {
      scale.value = withTiming(target, {
        duration: LUXURY_PRESS.durationMs,
        easing: Easing.out(Easing.cubic),
      });
    },
    [scale]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value < 1 ? LUXURY_PRESS.opacity : 1,
  }));

  const handlePressIn = (e: GestureResponderEvent) => {
    if (tactile && !disabled) animateTo(LUXURY_PRESS.scale);
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    if (tactile && !disabled) animateTo(1);
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, tactile && !disabled ? animatedStyle : undefined]}
    >
      {children}
    </AnimatedPressable>
  );
}
