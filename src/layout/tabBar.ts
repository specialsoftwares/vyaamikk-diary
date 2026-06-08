import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "@/theme";

/** Visible tab bar content area above the home-indicator inset. */
export const TAB_BAR_CONTENT_HEIGHT = 56;

export interface TabBarMetrics {
  /** Total tab bar height including bottom safe area. */
  height: number;
  paddingBottom: number;
  paddingTop: number;
  bottomInset: number;
  /** Bottom padding for scroll content on tab screens (tab bar + breathing room). */
  contentPaddingBottom: number;
}

export function computeTabBarMetrics(bottomInset: number): TabBarMetrics {
  const paddingBottom = Math.max(bottomInset, 10);
  const height = TAB_BAR_CONTENT_HEIGHT + paddingBottom;
  return {
    height,
    paddingBottom,
    paddingTop: 6,
    bottomInset,
    contentPaddingBottom: height + spacing.lg,
  };
}

export function useTabBarMetrics(): TabBarMetrics {
  const insets = useSafeAreaInsets();
  return computeTabBarMetrics(insets.bottom);
}
