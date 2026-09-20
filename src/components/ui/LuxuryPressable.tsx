import React from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { LUXURY_PRESS } from "@/theme/luxuryTokens";

export interface LuxuryPressableProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  /** When false, skips the pressed scale/opacity (e.g. embedded list rows). */
  tactile?: boolean;
}

/**
 * Shared tactile press. Visual state is owned by RN `pressed` so drag-away,
 * cancel, and unmount cannot leave a dimmed/scaled surface behind.
 */
export function LuxuryPressable({
  children,
  style,
  onPress,
  disabled,
  tactile = true,
  ...rest
}: LuxuryPressableProps) {
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPress={onPress}
      style={(state) => {
        const pressed = Boolean(tactile && !disabled && state.pressed);
        return [
          style,
          pressed
            ? {
                transform: [{ scale: LUXURY_PRESS.scale }],
                opacity: LUXURY_PRESS.opacity,
              }
            : null,
        ];
      }}
    >
      {children}
    </Pressable>
  );
}
