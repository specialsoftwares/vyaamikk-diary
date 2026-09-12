/**
 * Native tab bar geometry model — the single source of truth for clearance
 * above the bottom navigation. Pure module (no react-native imports) so the
 * contract test can execute the math directly. Do NOT sprinkle per-screen
 * bottom offsets; derive them from these metrics.
 *
 * The tab shell uses expo-router NativeTabs (react-native-screens native
 * bottom tabs), so the bar is a real platform view, not a JS component:
 *
 * - Android renders a Material 3 `BottomNavigationView` under
 *   `Theme.Material3.*` whose container height is 80dp (M3 navigation-bar
 *   spec / `m3_bottom_nav_min_height`), and the bar consumes the system
 *   bottom inset as internal padding, so its total height is
 *   `80 + insets.bottom`. RN/Yoga lays tab content out at full window height
 *   (edge-to-edge; the gamma tabs host gives no native size feedback), and
 *   the native content container clips at the bar top — anything positioned
 *   lower than `height` from the window bottom is hidden behind the bar.
 * - iOS renders a UITabBar (49pt standard content height) above the
 *   home-indicator inset; scroll content passes underneath the translucent
 *   bar, so the same clearance keeps footers/CTAs visible.
 *
 * The previous value (56) was a JS-tabs era guess: it understated the
 * Material 3 bar by 24dp and left bottom-pinned CTAs clipped behind the bar
 * (VYD-23).
 */

import { spacing } from "@/theme/spacing";

export const ANDROID_M3_NAV_BAR_CONTENT_HEIGHT = 80;
export const IOS_UITABBAR_CONTENT_HEIGHT = 49;

/**
 * Floor for the bar's bottom padding on devices reporting a zero bottom
 * inset, so clearance never sits flush against the bar edge.
 */
export const TAB_BAR_MIN_BOTTOM_PADDING = 10;

/** Visible tab bar content area above the bottom safe-area inset. */
export function tabBarContentHeightFor(platform: string): number {
  return platform === "android"
    ? ANDROID_M3_NAV_BAR_CONTENT_HEIGHT
    : IOS_UITABBAR_CONTENT_HEIGHT;
}

export interface TabBarMetrics {
  /** Total tab bar height including bottom safe area. */
  height: number;
  paddingBottom: number;
  paddingTop: number;
  bottomInset: number;
  /** Bottom padding for scroll content on tab screens (tab bar + breathing room). */
  contentPaddingBottom: number;
}

export function computeTabBarMetrics(
  bottomInset: number,
  platform: string
): TabBarMetrics {
  const paddingBottom = Math.max(bottomInset, TAB_BAR_MIN_BOTTOM_PADDING);
  const height = tabBarContentHeightFor(platform) + paddingBottom;
  return {
    height,
    paddingBottom,
    paddingTop: 6,
    bottomInset,
    contentPaddingBottom: height + spacing.lg,
  };
}

/**
 * Clearance below a bottom-pinned footer (e.g. the You tab "+ New record"
 * CTA) so the control clears the native bar with a spacing-token gap.
 */
export function tabBarFooterClearance(metrics: TabBarMetrics): number {
  return metrics.height + spacing.md;
}
