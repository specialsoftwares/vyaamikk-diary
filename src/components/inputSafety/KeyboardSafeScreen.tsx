import React, { type RefObject } from "react";
import { ScrollView, type StyleProp, type ViewStyle } from "react-native";

import { Screen } from "@/components/ui/Screen";

interface KeyboardSafeScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  tabBarInset?: boolean;
  extraBottomPadding?: number;
  footer?: React.ReactNode;
  scrollRef?: RefObject<ScrollView | null>;
  refreshing?: boolean;
  onRefresh?: () => void;
  topInsetOverride?: number;
}

/**
 * Full-screen keyboard-safe form shell — single scroll owner, avoiding view,
 * keyboard padding, validation focus context, and handled taps.
 */
export function KeyboardSafeScreen({
  children,
  scroll = true,
  padded = true,
  contentStyle,
  tabBarInset = false,
  extraBottomPadding = 0,
  footer,
  scrollRef,
  refreshing,
  onRefresh,
  topInsetOverride,
}: KeyboardSafeScreenProps) {
  return (
    <Screen
      scroll={scroll}
      form
      padded={padded}
      contentStyle={contentStyle}
      tabBarInset={tabBarInset}
      extraBottomPadding={extraBottomPadding}
      footer={footer}
      scrollRef={scrollRef}
      refreshing={refreshing}
      onRefresh={onRefresh}
      topInsetOverride={topInsetOverride}
      dismissKeyboardOnTap={false}
    >
      {children}
    </Screen>
  );
}
