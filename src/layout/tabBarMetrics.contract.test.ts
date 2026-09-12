/**
 * VYD-23 contract — native tab bar geometry + navigation chrome contrast.
 *
 * Locks in:
 * 1. Platform-correct bar heights (Material 3 = 80dp, UITabBar = 49pt) so
 *    bottom-pinned CTAs clear the native bar on every inset configuration
 *    (gesture nav, 3-button nav, home indicator, zero-inset devices).
 * 2. WCAG contrast for the tab bar's label/icon pairs in BOTH palettes
 *    (labels >= 4.5:1, icons/graphics >= 3:1).
 * 3. The tab layout and Screen footer derive their values from the shared
 *    model instead of hardcoded constants.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ANDROID_M3_NAV_BAR_CONTENT_HEIGHT,
  IOS_UITABBAR_CONTENT_HEIGHT,
  TAB_BAR_MIN_BOTTOM_PADDING,
  computeTabBarMetrics,
  tabBarContentHeightFor,
  tabBarFooterClearance,
} from "@/layout/tabBarMetrics";
import { darkColors, lightColors } from "@/theme/palettes";
import { spacing } from "@/theme/spacing";

const root = join(__dirname, "../..");

// ---------------------------------------------------------------------------
// 1. Geometry — Material 3 bar is 80dp + consumed system inset; UITabBar 49pt.
// ---------------------------------------------------------------------------

assert.equal(ANDROID_M3_NAV_BAR_CONTENT_HEIGHT, 80);
assert.equal(IOS_UITABBAR_CONTENT_HEIGHT, 49);
assert.equal(tabBarContentHeightFor("android"), 80);
assert.equal(tabBarContentHeightFor("ios"), 49);

// Android gesture navigation (typical 24dp bottom inset).
assert.equal(computeTabBarMetrics(24, "android").height, 104);
// Android 3-button navigation (typical 48dp bottom inset).
assert.equal(computeTabBarMetrics(48, "android").height, 128);
// Devices reporting no inset still keep a padding floor.
assert.equal(
  computeTabBarMetrics(0, "android").height,
  80 + TAB_BAR_MIN_BOTTOM_PADDING
);
// iOS home-indicator devices (34pt inset) — real UITabBar total is 83pt.
assert.equal(computeTabBarMetrics(34, "ios").height, 83);

// Scroll content on tab screens must clear the bar plus breathing room.
for (const inset of [0, 16, 24, 48]) {
  for (const platform of ["android", "ios"]) {
    const m = computeTabBarMetrics(inset, platform);
    assert.equal(m.contentPaddingBottom, m.height + spacing.lg);
    // Footer CTAs (e.g. "+ New record") must sit a full spacing token above
    // the native bar's clip line. The pre-VYD-23 constant (56) violated this
    // on Android: clearance fell 8-12dp SHORT of the Material 3 bar and the
    // CTA rendered partially behind it.
    const clearance = tabBarFooterClearance(m);
    assert.equal(clearance, m.height + spacing.md);
    assert.ok(
      clearance - m.height >= spacing.sm,
      `footer clearance must exceed bar height by >= spacing.sm (inset ${inset}, ${platform})`
    );
  }
}

// The regression this file exists to prevent: modelling the Android bar
// shorter than the real Material 3 navigation bar.
for (const inset of [TAB_BAR_MIN_BOTTOM_PADDING, 24, 48]) {
  const m = computeTabBarMetrics(inset, "android");
  assert.equal(
    m.height - m.paddingBottom,
    80,
    "Android bar content height must stay 80dp (Material 3 spec)"
  );
}

// ---------------------------------------------------------------------------
// 2. Contrast gate — WCAG 2.x relative luminance over the real palettes.
// ---------------------------------------------------------------------------

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  assert.equal(h.length, 6, `expected 6-digit hex, got ${hex}`);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const WCAG_TEXT = 4.5;
const WCAG_GRAPHIC = 3;

for (const [mode, c] of [
  ["light", lightColors],
  ["dark", darkColors],
] as const) {
  // Tab labels (selected + unselected) against the themed bar background.
  assert.ok(
    contrast(c.primary, c.surface) >= WCAG_TEXT,
    `${mode}: selected label primary(${c.primary}) on surface(${c.surface}) = ${contrast(c.primary, c.surface).toFixed(2)} — needs >= ${WCAG_TEXT}`
  );
  assert.ok(
    contrast(c.textMuted, c.surface) >= WCAG_TEXT,
    `${mode}: unselected label textMuted(${c.textMuted}) on surface(${c.surface}) = ${contrast(c.textMuted, c.surface).toFixed(2)} — needs >= ${WCAG_TEXT}`
  );
  // Icons: unselected on bar surface; selected on the active indicator pill.
  assert.ok(
    contrast(c.textMuted, c.surface) >= WCAG_GRAPHIC,
    `${mode}: unselected icon on surface — needs >= ${WCAG_GRAPHIC}`
  );
  assert.ok(
    contrast(c.primary, c.primaryLight) >= WCAG_GRAPHIC,
    `${mode}: selected icon primary(${c.primary}) on indicator primaryLight(${c.primaryLight}) = ${contrast(c.primary, c.primaryLight).toFixed(2)} — needs >= ${WCAG_GRAPHIC}`
  );
}

// The old hardcoded selected tint failed exactly this gate in dark mode —
// keep the receipt so the number is never disputed.
assert.ok(
  contrast("#4338CA", darkColors.surface) < WCAG_GRAPHIC,
  "sanity: the retired #4338CA tint is provably illegible on dark surface"
);

// ---------------------------------------------------------------------------
// 3. Static wiring — layout + Screen must consume the shared model.
// ---------------------------------------------------------------------------

const tabsLayout = readFileSync(join(root, "app/(app)/(tabs)/_layout.tsx"), "utf8");
assert.match(tabsLayout, /labelVisibilityMode="labeled"/);
assert.match(tabsLayout, /backgroundColor=\{colors\.surface\}/);
assert.match(tabsLayout, /tintColor=\{colors\.primary\}/);
assert.match(
  tabsLayout,
  /iconColor=\{\{ default: colors\.textMuted, selected: colors\.primary \}\}/
);
assert.doesNotMatch(
  tabsLayout,
  /#4338CA/i,
  "tab layout must not hardcode the light-only indigo tint"
);
assert.doesNotMatch(tabsLayout, /TAB_ACTIVE_TINT/);

const screen = readFileSync(join(root, "src/components/ui/Screen.tsx"), "utf8");
assert.match(screen, /tabBarFooterClearance\(tabBar\)/);
assert.doesNotMatch(
  screen,
  /tabBar\.height \+ spacing\.md/,
  "footer clearance must come from tabBarFooterClearance, not inline math"
);

const tabBarAdapter = readFileSync(join(root, "src/layout/tabBar.ts"), "utf8");
assert.match(tabBarAdapter, /useSafeAreaInsets\(\)/);
assert.match(tabBarAdapter, /computeTabBarMetrics\(insets\.bottom\)/);
assert.doesNotMatch(
  tabBarAdapter,
  /=\s*56\b/,
  "the JS-tabs era 56dp constant must not return"
);

console.log("tabBarMetrics.contract.test.ts: ok");
