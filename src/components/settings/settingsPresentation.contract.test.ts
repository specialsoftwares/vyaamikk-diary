import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname);
const navCard = readFileSync(join(root, "SettingsNavCard.tsx"), "utf8");
const prefRow = readFileSync(join(root, "SettingsPreferenceRow.tsx"), "utf8");
const pressable = readFileSync(join(root, "SettingsPressable.tsx"), "utf8");
const luxuryTokens = readFileSync(join(root, "../../theme/luxuryTokens.ts"), "utf8");
const settingsTab = readFileSync(
  join(root, "../../../app/(app)/(tabs)/settings.tsx"),
  "utf8"
);
const accountPanel = readFileSync(join(root, "SettingsAccountAppPanel.tsx"), "utf8");

assert.equal(navCard.includes("LuxuryPressable"), false);
assert.equal(prefRow.includes("LuxuryPressable"), false);
assert.ok(navCard.includes("SettingsPressable"));
assert.ok(prefRow.includes("SettingsPressable"));
assert.ok(navCard.includes("accessibilityRole=\"button\""));
assert.ok(navCard.includes("accessibilityState={{ disabled: !onPress }}"));
assert.ok(navCard.includes("disabled={!onPress}"));
assert.ok(prefRow.includes("accessibilityRole=\"button\""));

assert.equal(pressable.includes("useSharedValue"), false);
assert.equal(pressable.includes("Animated"), false);
assert.equal(pressable.includes("useFocusEffect"), false);
assert.equal(pressable.includes("isPressed"), false);
assert.equal(pressable.includes("setIsPressed"), false);
assert.ok(pressable.includes("Pressable"));
assert.ok(pressable.includes("android_ripple"));
assert.ok(pressable.includes("rgba(99, 102, 241, 0.10)"));
assert.ok(pressable.includes("borderless: false"));
assert.ok(pressable.includes("LUXURY_PRESS.scale"));
assert.ok(pressable.includes("isReduceMotionEnabled"));
assert.ok(luxuryTokens.includes("scale: 0.97"));

assert.equal(settingsTab.includes("LuxuryPressable"), false);
assert.equal(settingsTab.includes("useFocusEffect"), false);
assert.equal(settingsTab.includes("useSharedValue"), false);
assert.ok(settingsTab.includes('t("settings.deleteAccountAndData")'));
assert.ok(settingsTab.includes('t("settings.deleteAccountSubtitle")'));
assert.ok(settingsTab.includes('router.push("/(app)/settings/identity")'));
assert.ok(settingsTab.includes('router.push("/(app)/settings/legal")'));
assert.ok(settingsTab.includes('router.push("/(app)/settings/about")'));
assert.ok(settingsTab.includes('router.push("/(app)/settings/disclaimer")'));
assert.ok(settingsTab.includes('router.push("/(app)/settings/delete")'));
assert.ok(settingsTab.includes('router.push("/(app)/settings/pdf-privacy")'));
assert.ok(settingsTab.includes('router.push("/(app)/settings/location-footprints")'));
assert.ok(settingsTab.includes('router.push("/(app)/settings/business-insights")'));
assert.ok(settingsTab.includes("pathname: \"/statutory\""));
assert.ok(settingsTab.includes("getAuthEntryHref()"));

assert.ok(accountPanel.includes("useFocusEffect"));
assert.ok(accountPanel.includes("void reloadLocation()"));
assert.equal(accountPanel.includes("scale.value"), false);
assert.equal(accountPanel.includes("LuxuryPressable"), false);

const settingsDirFiles = [
  "SettingsNavCard.tsx",
  "SettingsPreferenceRow.tsx",
  "SettingsAccountAppPanel.tsx",
  "SettingsInfoHero.tsx",
  "LanguageSelector.tsx",
  "SettingsSegmentedControl.tsx",
];
for (const name of settingsDirFiles) {
  const src = readFileSync(join(root, name), "utf8");
  assert.equal(
    src.includes("Platform.OS"),
    false,
    `${name} must not scatter Platform.OS; keep it in SettingsPressable`
  );
}
assert.ok(pressable.includes("Platform.OS === \"android\""));

assert.ok(navCard.includes("StyleSheet.hairlineWidth"));
assert.ok(prefRow.includes("StyleSheet.hairlineWidth"));

console.log("settingsPresentation.contract.test.ts: ok");
