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
assert.ok(settingsTab.includes('router.push("/(app)/settings/subscription")'));
assert.ok(settingsTab.includes('t("settings.subscriptionItem")'));
assert.ok(settingsTab.includes('openPublicLinkOrExplain("privacy")'));
assert.ok(settingsTab.includes('router.push("/(app)/settings/about")'));
assert.ok(settingsTab.includes('openPublicLinkOrExplain("terms")'));
assert.ok(settingsTab.includes('router.push("/(app)/settings/delete")'));
assert.ok(settingsTab.includes('router.push("/(app)/settings/pdf-privacy")'));
assert.equal(settingsTab.includes("location-footprints"), false);
assert.equal(settingsTab.includes("onLocationAccess"), false);
assert.ok(settingsTab.includes("BUSINESS_INSIGHTS_HREF"));
assert.ok(settingsTab.includes('from "@/content/insights/entry"'));
assert.ok(settingsTab.includes('t("settings.sectionAccountApp")'));
assert.equal(settingsTab.includes("pathname: \"/statutory\""), false);
assert.equal(settingsTab.includes("sectionStatutory"), false);
assert.equal(settingsTab.includes("settings.statutoryItem"), false);
assert.equal(settingsTab.includes("onStatutory"), false);
assert.ok(settingsTab.includes("getAuthEntryHref()"));
assert.ok(settingsTab.includes('t("settings.logout")'));
assert.ok(settingsTab.includes('t("settings.signOutPrompt")'));
assert.ok(settingsTab.includes("confirmLogoutAll"));
assert.ok(settingsTab.includes("runConfirmedLogoutAll"));
assert.ok(settingsTab.includes("callLogoutAllDevices"));
assert.ok(settingsTab.includes("useIsOnline"));
assert.ok(settingsTab.includes('t("settings.logoutAllConfirm")'));
assert.ok(settingsTab.includes('t("settings.logoutAllComplete")'));
assert.ok(settingsTab.includes('t("settings.logoutAllPending")'));
assert.ok(settingsTab.includes('t("settings.logoutAllNotRecent")'));
const localSignOut = settingsTab.slice(
  settingsTab.indexOf("const confirmSignOut"),
  settingsTab.indexOf("const logoutAllMessage")
);
assert.equal(localSignOut.includes("callLogoutAllDevices"), false);
assert.equal(localSignOut.includes("runConfirmedLogoutAll"), false);

assert.equal(accountPanel.includes("lastActiveLabel"), false);
assert.equal(accountPanel.includes("sessionLastActive"), false);
assert.equal(accountPanel.includes("lastActiveAt"), false);
assert.equal(accountPanel.includes("GlassSurface"), false);
assert.equal(settingsTab.includes("lastActiveLabel"), false);
assert.equal(settingsTab.includes("sessionLastActive"), false);
assert.equal(settingsTab.includes("SettingsAccountAppPanel"), false);
assert.equal(accountPanel.includes("locationAccess"), false);
assert.equal(accountPanel.includes("settings.appearance"), false);
assert.equal(accountPanel.includes("settings.language"), false);
assert.equal(accountPanel.includes("useFocusEffect"), false);
assert.equal(accountPanel.includes("reloadLocation"), false);
assert.equal(accountPanel.includes("saveLocationFootprintPreferences"), false);
assert.equal(accountPanel.includes("scale.value"), false);
assert.equal(accountPanel.includes("LuxuryPressable"), false);

const prefsPanel = readFileSync(join(root, "SettingsAppPreferencesPanel.tsx"), "utf8");
assert.ok(prefsPanel.includes('t("settings.appearance")'));
assert.ok(prefsPanel.includes('t("settings.language")'));
assert.ok(prefsPanel.includes("LanguageSelector"));
assert.ok(prefsPanel.includes("setMode"));
assert.equal(prefsPanel.includes("locationAccess"), false);
assert.equal(prefsPanel.includes("locationFootprintsEnabled"), false);

const identity = readFileSync(join(root, "../../../app/(app)/settings/identity.tsx"), "utf8");
assert.ok(identity.includes("SettingsAppPreferencesPanel"));
assert.ok(identity.includes('t("settings.sectionPreferences")'));

const locationRoute = readFileSync(
  join(root, "../../../app/(app)/settings/location-footprints.tsx"),
  "utf8"
);
assert.ok(locationRoute.includes("Redirect"));
assert.ok(locationRoute.includes('"/(app)/(tabs)/settings"'));
assert.equal(locationRoute.includes("requestPermission"), false);
assert.equal(locationRoute.includes("locationFootprintsEnabled"), false);
assert.equal(locationRoute.includes("saveLocationFootprintPreferences"), false);
assert.equal(locationRoute.includes("PermissionRationaleModal"), false);
assert.equal(locationRoute.includes("Linking.openSettings"), false);

const settingsDirFiles = [
  "SettingsNavCard.tsx",
  "SettingsPreferenceRow.tsx",
  "SettingsAccountAppPanel.tsx",
  "SettingsAppPreferencesPanel.tsx",
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
assert.doesNotMatch(
  navCard,
  /backgroundColor: embedded \? "transparent" : undefined/,
  "standalone SettingsNavCard must keep opaque surface; undefined wipes fill and leaves Android elevation as a grey slab"
);
assert.match(
  navCard,
  /\.\.\.depth, overflow: "hidden"/,
  "standalone settings cards clip to radius so Android does not paint a rectangular halo"
);

const cardDepth = readFileSync(join(root, "../../theme/cardDepth.ts"), "utf8");
assert.doesNotMatch(
  cardDepth,
  /android:\s*\{\s*elevation:\s*[1-9]/,
  "executiveCardDepth must not apply Android Material elevation (grey rectangular plane)"
);
assert.doesNotMatch(
  luxuryTokens,
  /android:\s*\{\s*elevation:\s*2\s*\}/,
  "luxuryCardShadow must not use Android elevation in light mode"
);

assert.ok(settingsTab.includes("tabBarInset"));
assert.doesNotMatch(
  settingsTab,
  /paddingBottom:\s*0/,
  "settings scroll must keep tab-bar clearance via Screen tabBarInset"
);

console.log("settingsPresentation.contract.test.ts: ok");
