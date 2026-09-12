import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  computeTabBarMetrics as computeTabBarMetricsFor,
  type TabBarMetrics,
} from "@/layout/tabBarMetrics";

export {
  ANDROID_M3_NAV_BAR_CONTENT_HEIGHT,
  IOS_UITABBAR_CONTENT_HEIGHT,
  TAB_BAR_MIN_BOTTOM_PADDING,
  tabBarContentHeightFor,
  tabBarFooterClearance,
  type TabBarMetrics,
} from "@/layout/tabBarMetrics";

/** See src/layout/tabBarMetrics.ts for the geometry model and rationale. */
export function computeTabBarMetrics(
  bottomInset: number,
  platform: string = Platform.OS
): TabBarMetrics {
  return computeTabBarMetricsFor(bottomInset, platform);
}

export function useTabBarMetrics(): TabBarMetrics {
  const insets = useSafeAreaInsets();
  return computeTabBarMetrics(insets.bottom);
}
