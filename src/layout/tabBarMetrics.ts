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

/**
 * Frames for a tab scene whose footer is a column sibling of the scroll view.
 *
 * React Navigation 7 lays the scene out in a flex column above the tab bar.
 * `absoluteFill` applies only inside that already-shortened container. Subtracting
 * the bar height again (`subtractTabBarAgain`) is the vc27 You-dashboard defect:
 * it leaves a dead band under the footer and parks the next content row in the
 * footer's band.
 */
export function dashboardChromeFrames(input: {
  windowHeight: number;
  tabBarHeight: number;
  topInset: number;
  footerHeight: number;
  subtractTabBarAgain: boolean;
}): {
  sceneHeight: number;
  scrollHeight: number;
  footerTop: number;
  deadBand: number;
} {
  const sceneHeight = input.windowHeight - input.tabBarHeight;
  const deadBand = input.subtractTabBarAgain ? input.tabBarHeight : 0;
  const columnHeight = sceneHeight - input.topInset - deadBand;
  const scrollHeight = columnHeight - input.footerHeight;
  return {
    sceneHeight,
    scrollHeight,
    footerTop: input.topInset + scrollHeight,
    deadBand,
  };
}

/** DashboardStatTile text block. minHeight is the floor at font scale 1. */
const GLANCE_TILE_MIN_HEIGHT = 108;
const GLANCE_TILE_PAD_V = spacing.md + 4;
const GLANCE_TILE_GAP = 6;
const GLANCE_VALUE_LINE = 28;
const GLANCE_LABEL_LINE = 14;
const GLANCE_LABEL_LINES = 3;

/** PremiumActionButton size lg, bodyStrong label. */
const NEW_RECORD_MIN_HEIGHT = 52;
const NEW_RECORD_PAD_V = 14 * 2;
const NEW_RECORD_LABEL_LINE = 22;

export function glanceStatRowHeight(fontScale: number): number {
  const text =
    GLANCE_TILE_PAD_V * 2 +
    GLANCE_TILE_GAP +
    GLANCE_VALUE_LINE * fontScale +
    GLANCE_LABEL_LINES * GLANCE_LABEL_LINE * fontScale;
  return Math.max(GLANCE_TILE_MIN_HEIGHT, text);
}

export function newRecordFooterHeight(fontScale: number): number {
  const button = Math.max(
    NEW_RECORD_MIN_HEIGHT,
    NEW_RECORD_PAD_V + NEW_RECORD_LABEL_LINE * fontScale
  );
  return spacing.md + button + spacing.sm;
}

/**
 * Scroll the At a glance row so its bottom sits on the scroll viewport's
 * bottom edge. The footer is the next column sibling, so a row that fits
 * in the viewport is fully above the footer and its press target is clear.
 */
export function glanceRowAfterScroll(input: {
  windowHeight: number;
  tabBarHeight: number;
  topInset: number;
  fontScale: number;
  contentBeforeRow: number;
}): {
  viewport: number;
  rowHeight: number;
  rowTop: number;
  rowBottom: number;
  footerTop: number;
  fullyAboveFooter: boolean;
} {
  const footerHeight = newRecordFooterHeight(input.fontScale);
  const frames = dashboardChromeFrames({
    windowHeight: input.windowHeight,
    tabBarHeight: input.tabBarHeight,
    topInset: input.topInset,
    footerHeight,
    subtractTabBarAgain: false,
  });
  const rowHeight = glanceStatRowHeight(input.fontScale);
  const rowBottomInContent = input.contentBeforeRow + rowHeight;
  const offset = Math.max(0, rowBottomInContent - frames.scrollHeight);
  const rowTop = input.contentBeforeRow - offset;
  const rowBottom = rowBottomInContent - offset;
  const epsilon = 0.05;
  return {
    viewport: frames.scrollHeight,
    rowHeight,
    rowTop,
    rowBottom,
    footerTop: frames.footerTop,
    fullyAboveFooter:
      rowTop >= -epsilon &&
      rowBottom <= frames.scrollHeight + epsilon &&
      rowHeight <= frames.scrollHeight + epsilon,
  };
}
