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
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import {
  ANDROID_M3_NAV_BAR_CONTENT_HEIGHT,
  IOS_UITABBAR_CONTENT_HEIGHT,
  TAB_BAR_MIN_BOTTOM_PADDING,
  computeTabBarMetrics,
  dashboardChromeFrames,
  glanceRowAfterScroll,
  glanceStatRowHeight,
  newRecordFooterHeight,
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
const tabBar = readFileSync(join(root, "src/navigation/AppTabBar.tsx"), "utf8");
assert.match(tabsLayout, /backBehavior="history"/);
assert.match(tabsLayout, /<AppTabBar/);
assert.match(tabBar, /selectedTabRouteName\(state\)/);
assert.match(tabBar, /backgroundColor: colors\.surface/);
assert.match(tabBar, /focused \? colors\.primary : colors\.textMuted/);
assert.doesNotMatch(tabsLayout, /unstable-native-tabs/);
assert.doesNotMatch(tabBar, /allowFontScaling=\{false\}/);
assert.doesNotMatch(
  tabsLayout,
  /#4338CA/i,
  "tab layout must not hardcode the light-only indigo tint"
);
assert.doesNotMatch(tabsLayout, /TAB_ACTIVE_TINT/);

const screen = readFileSync(join(root, "src/components/ui/Screen.tsx"), "utf8");
const you = readFileSync(join(root, "app/(app)/(tabs)/you.tsx"), "utf8");
assert.doesNotMatch(
  screen,
  /BottomTabBarHeightContext/,
  "the tab scene is already above the bar; do not inset the footer by the bar height"
);
assert.doesNotMatch(screen, /marginBottom:\s*tabOverlay/);
assert.match(screen, /minHeight:\s*0/);
assert.match(screen, /paddingBottom:\s*tabBarInset\s*\?\s*spacing\.sm/);
assert.doesNotMatch(screen, /position:\s*["']absolute["']/);
assert.doesNotMatch(
  screen,
  /tabBarFooterClearance\(tabBar\)/,
  "an in-flow footer must not repeat the tab bar height as internal padding"
);
assert.doesNotMatch(screen, /tabBar\.height \+ spacing\.md/);
assert.match(you, /tabBarInset/);
assert.match(you, /footer=\{addBar\}/);
assert.doesNotMatch(you, /allowFontScaling=\{false\}/);
assert.match(tabBar, /BottomTabBarHeightCallbackContext/);

const tabBarAdapter = readFileSync(join(root, "src/layout/tabBar.ts"), "utf8");
assert.match(tabBarAdapter, /useSafeAreaInsets\(\)/);
assert.match(tabBarAdapter, /computeTabBarMetrics\(insets\.bottom\)/);
assert.doesNotMatch(
  tabBarAdapter,
  /=\s*56\b/,
  "the JS-tabs era 56dp constant must not return"
);

// ---------------------------------------------------------------------------
// 4. Installed navigator hierarchy. The tab bar is a column sibling after a
//    flex:1 screen container. absoluteFill is only inside that container.
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);
const bottomTabsRoot = join(
  dirname(require.resolve("@react-navigation/bottom-tabs/package.json")),
  "lib/module/views/BottomTabView.js"
);
const bottomTabView = readFileSync(bottomTabsRoot, "utf8");
const safeAreaCompat = readFileSync(
  join(bottomTabsRoot, "../../../../../elements/lib/module/SafeAreaProviderCompat.js"),
  "utf8"
);
assert.match(safeAreaCompat, /container:\s*\{\s*flex:\s*1\s*\}/);
assert.match(
  bottomTabView,
  /flexDirection: tabBarPosition === 'left' \|\| tabBarPosition === 'right' \? 'row' : 'column'/
);
assert.match(bottomTabView, /screens:\s*\{\s*flex:\s*1,\s*overflow:\s*'hidden'\s*\}/);
const screensContainerAt = bottomTabView.indexOf("style: styles.screens");
const sceneFillAt = bottomTabView.indexOf("StyleSheet.absoluteFill");
const bottomBarSiblingAt = bottomTabView.indexOf(
  "tabBarPosition === 'bottom' || tabBarPosition === 'right' ? tabBarElement : null"
);
assert.ok(screensContainerAt > 0 && sceneFillAt > screensContainerAt);
assert.ok(bottomBarSiblingAt > sceneFillAt);
assert.doesNotMatch(tabsLayout, /position:\s*["']absolute["']/);
assert.doesNotMatch(tabBar, /position:\s*["']absolute["']/);
assert.match(tabsLayout, /tabBar=\{\(props\) => <AppTabBar/);
const scrollAt = screen.indexOf("<ScrollView");
const footerSiblingAt = screen.indexOf("{footer ? (");
assert.ok(scrollAt > 0 && footerSiblingAt > scrollAt);

// Style tokens the scroll/tap math must keep matching.
const tile = readFileSync(join(root, "src/components/you/DashboardStatTile.tsx"), "utf8");
const action = readFileSync(join(root, "src/components/ui/PremiumActionButton.tsx"), "utf8");
const type = readFileSync(join(root, "src/theme/typography.ts"), "utf8");
assert.match(tile, /minHeight:\s*108/);
assert.match(tile, /numberOfLines=\{3\}/);
assert.match(tile, /paddingVertical:\s*spacing\.md \+ 4/);
assert.match(you, /flexDirection:\s*"row"/);
assert.equal(you.split("<DashboardStatTile").length - 1, 3);
assert.match(type, /titleLg: base\(\{ fontSize: 22, lineHeight: 28/);
assert.match(type, /micro: base\(\{ fontSize: 11, lineHeight: 14/);
assert.match(type, /bodyStrong: base\(\{ fontSize: 15, lineHeight: 22/);
assert.match(action, /paddingVertical: 14/);
assert.match(action, /minHeight: 52/);
assert.match(action, /\.\.\.typography\.bodyStrong/);

assert.equal(glanceStatRowHeight(1), 108);
assert.ok(glanceStatRowHeight(1.3) > 108);
assert.ok(newRecordFooterHeight(1.3) >= newRecordFooterHeight(1));

for (const fontScale of [1, 1.15, 1.3]) {
  for (const windowHeight of [640, 800, 900]) {
    for (const bottomInset of [24, 48]) {
      const bar = computeTabBarMetrics(bottomInset, "android");
      for (const contentBeforeRow of [0, 400, 4000]) {
        const placed = glanceRowAfterScroll({
          windowHeight,
          tabBarHeight: bar.height,
          topInset: 24,
          fontScale,
          contentBeforeRow,
        });
        assert.equal(
          placed.fullyAboveFooter,
          true,
          `font ${fontScale} window ${windowHeight} inset ${bottomInset} before ${contentBeforeRow}`
        );
        assert.ok(placed.rowBottom <= placed.viewport + 0.05);
        assert.ok(Math.abs(placed.footerTop - (24 + placed.viewport)) < 0.05);
      }
    }
  }
}

// vc27 device screenshot (465x1024) is supporting evidence for the dead band.
// It is not a native layout pass. The purple New record control is the
// 52dp button; the white band under it, before the tab icons, is the bar
// height subtracted a second time plus the footer's 8dp padding.
const screenshotPx = { height: 1024, buttonTop: 692, buttonBottom: 756, tabIconsTop: 932 };
const buttonPx = screenshotPx.buttonBottom - screenshotPx.buttonTop + 1;
const gapPx = screenshotPx.tabIconsTop - screenshotPx.buttonBottom - 1;
const dpPerPx = 52 / buttonPx;
const gapDp = gapPx * dpPerPx;
const threeButtonBar = computeTabBarMetrics(48, "android");
assert.equal(threeButtonBar.height, 128);
assert.ok(
  Math.abs(gapDp - (threeButtonBar.height + spacing.sm)) < 8,
  `screenshot dead band ${gapDp.toFixed(1)}dp must match a second ${threeButtonBar.height}dp bar plus footer padding`
);

const STAT_TILE_MIN_HEIGHT = 108;
const topInset = 31 * dpPerPx;
const footerHeight = (buttonPx * dpPerPx) + spacing.md + spacing.sm;
const windowHeight = screenshotPx.height * dpPerPx;
const broken = dashboardChromeFrames({
  windowHeight,
  tabBarHeight: threeButtonBar.height,
  topInset,
  footerHeight,
  subtractTabBarAgain: true,
});
const fixed = dashboardChromeFrames({
  windowHeight,
  tabBarHeight: threeButtonBar.height,
  topInset,
  footerHeight,
  subtractTabBarAgain: false,
});
assert.equal(broken.deadBand, threeButtonBar.height);
assert.equal(fixed.deadBand, 0);
assert.equal(fixed.scrollHeight - broken.scrollHeight, threeButtonBar.height);
assert.ok(
  fixed.scrollHeight - broken.scrollHeight >= STAT_TILE_MIN_HEIGHT,
  "recovering the dead band must reveal the At a glance tile row"
);
assert.ok(fixed.footerTop > broken.footerTop);
assert.ok(fixed.footerTop + footerHeight <= windowHeight - threeButtonBar.height + 0.5);

console.log("tabBarMetrics.contract.test.ts: ok");
