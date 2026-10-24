/**
 * VyaaFlow scroll owner — the agenda list is the only vertical scroller.
 *
 * React Navigation already lays the tab scene above the JS tab bar. Reserving
 * `contentPaddingBottom` again on Screen's non-scroll wrapper is a fixed dead
 * band. End spacing belongs inside the list, as `spacing.lg`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  childScrollListEndGap,
  computeTabBarMetrics,
  screenBottomPadding,
  type ScreenBottomPaddingInput,
} from "@/layout/tabBarMetrics";
import { spacing } from "@/theme/spacing";

const root = join(__dirname, "../..");

function padding(
  overrides: Partial<ScreenBottomPaddingInput> = {}
): number {
  return screenBottomPadding({
    hasFooter: false,
    scroll: false,
    childScrollOwner: false,
    tabBarInset: true,
    contentPaddingBottom: 0,
    bottomInset: 0,
    extraBottomPadding: 0,
    formExtraPadding: 0,
    ...overrides,
  });
}

const androidBar = computeTabBarMetrics(48, "android");
const iosBar = computeTabBarMetrics(34, "ios");

assert.equal(childScrollListEndGap(), spacing.lg);
assert.notEqual(childScrollListEndGap(), androidBar.contentPaddingBottom);
assert.ok(androidBar.contentPaddingBottom > childScrollListEndGap());

// Child scroll owner: wrapper does not reserve the bar or the safe-area fallback.
assert.equal(
  padding({
    childScrollOwner: true,
    tabBarInset: true,
    contentPaddingBottom: androidBar.contentPaddingBottom,
    bottomInset: 48,
    extraBottomPadding: 24,
  }),
  0
);
assert.equal(
  padding({
    childScrollOwner: true,
    tabBarInset: false,
    contentPaddingBottom: iosBar.contentPaddingBottom,
    bottomInset: 34,
  }),
  0
);

// Keyboard/form extra still applies; the bar reservation does not.
assert.equal(
  padding({
    childScrollOwner: true,
    contentPaddingBottom: androidBar.contentPaddingBottom,
    bottomInset: 48,
    formExtraPadding: 40,
  }),
  40
);

// Default tab screen, scrolling or not, still uses contentPaddingBottom.
for (const scroll of [false, true]) {
  assert.equal(
    padding({
      scroll,
      childScrollOwner: false,
      tabBarInset: true,
      contentPaddingBottom: androidBar.contentPaddingBottom,
      bottomInset: 48,
    }),
    androidBar.contentPaddingBottom
  );
}

// Non-tab screen keeps the safe-area fallback. Child ownership is what zeroes it.
assert.equal(
  padding({
    tabBarInset: false,
    bottomInset: 34,
    contentPaddingBottom: androidBar.contentPaddingBottom,
  }),
  34 + spacing.xl
);

// Footer path stays the small in-flow gap, including when the child flag is set.
assert.equal(
  padding({
    hasFooter: true,
    scroll: true,
    childScrollOwner: false,
    contentPaddingBottom: androidBar.contentPaddingBottom,
    extraBottomPadding: 4,
    formExtraPadding: 40,
  }),
  spacing.md + 4
);
assert.equal(
  padding({
    hasFooter: true,
    childScrollOwner: true,
    contentPaddingBottom: androidBar.contentPaddingBottom,
    bottomInset: 48,
  }),
  spacing.md
);

// Screen's own scroll view still owns bottom padding if the flag is combined with scroll.
assert.equal(
  padding({
    scroll: true,
    childScrollOwner: true,
    contentPaddingBottom: androidBar.contentPaddingBottom,
    extraBottomPadding: 8,
    formExtraPadding: 12,
  }),
  androidBar.contentPaddingBottom + 8 + 12
);

const calendar = readFileSync(join(root, "app/(app)/(tabs)/calendar.tsx"), "utf8");
const screen = readFileSync(join(root, "src/components/ui/Screen.tsx"), "utf8");
const you = readFileSync(join(root, "app/(app)/(tabs)/you.tsx"), "utf8");

assert.match(calendar, /childScrollOwner/);
assert.match(calendar, /childScrollListEndGap\(\)/);
assert.doesNotMatch(
  calendar,
  /contentPaddingBottom/,
  "the agenda list must not reserve the tab bar a second time"
);
assert.match(calendar, /agendaList:\s*\{\s*flex:\s*1,\s*minHeight:\s*0\s*\}/);
assert.match(calendar, /<ScrollView[\s\S]*?style=\{styles\.agendaList\}/);
assert.match(calendar, /<SectionList[\s\S]*?style=\{styles\.agendaList\}/);
assert.match(calendar, /removeClippedSubviews=\{Platform\.OS === "android"\}/);
assert.match(calendar, /refreshControl=\{refreshControl\}/);
assert.match(calendar, /onOpenStatutoryReference/);
assert.match(calendar, /onPress=\{\(\) => openRecord\(item\)\}/);

const scrollViewAt = calendar.indexOf("<ScrollView");
const scrollViewEnd = calendar.indexOf("</ScrollView>", scrollViewAt);
const sectionAt = calendar.indexOf("<SectionList");
const sectionEnd = calendar.indexOf("/>", sectionAt);
assert.ok(scrollViewAt > 0 && scrollViewEnd > scrollViewAt);
assert.ok(sectionAt > scrollViewEnd, "SectionList must not be nested in the empty-day ScrollView");
assert.doesNotMatch(calendar.slice(scrollViewAt, scrollViewEnd), /<SectionList/);
assert.doesNotMatch(calendar.slice(sectionAt, sectionEnd), /<ScrollView/);

const heroAt = calendar.indexOf("<SignatureHeroSurface");
const listBodyAt = calendar.indexOf("{calendarBody}");
assert.ok(heroAt > 0 && listBodyAt > heroAt);
assert.doesNotMatch(
  calendar.slice(calendar.indexOf("const calendarListHeader"), calendar.indexOf("const calendarBody")),
  /SignatureHeroSurface/,
  "the hero stays a fixed header, not a list header"
);

assert.match(screen, /childScrollOwner = false/);
assert.match(screen, /screenBottomPadding\(/);
assert.match(screen, /paddingBottom:\s*bottomPadding/);
assert.match(screen, /paddingBottom:\s*tabBarInset\s*\?\s*spacing\.sm/);
assert.match(screen, /FORM_KEYBOARD_EXTRA_PADDING/);
assert.doesNotMatch(screen, /marginBottom:\s*-/);
assert.doesNotMatch(you, /childScrollOwner/);
assert.match(you, /footer=\{addBar\}/);

console.log("vyaaflowScrollOwner.contract.test.ts: ok");
