/**
 * Production boot: finished ledger mark (not construction grid), the ledger
 * open animation plays before routing, splash released on every terminal
 * path, routing not blocked on optional prefetch / PIN warm.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getAuthEntryHref } from "@/config/authWrapper";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const bootScreen = readFileSync(join(root, "app/index.tsx"), "utf8");
const bootstrap = readFileSync(join(root, "src/startup/BootstrapRoot.tsx"), "utf8");
const bootRoute = readFileSync(join(root, "src/boot/resolveBootRoute.ts"), "utf8");
const coordinator = readFileSync(join(root, "src/startup/coordinator.ts"), "utf8");
const layout = readFileSync(join(root, "app/_layout.tsx"), "utf8");
const appJson = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as {
  expo: { plugins: unknown[] };
};

const splashPlugin = appJson.expo.plugins.find(
  (entry): entry is [string, { image?: string; backgroundColor?: string }] =>
    Array.isArray(entry) && entry[0] === "expo-splash-screen"
);
assert.ok(splashPlugin, "expo-splash-screen plugin must be configured");
assert.equal(
  splashPlugin[1].image,
  "./assets/android-icon-foreground.png",
  "native splash must use the finished adaptive-icon mark, not splash-icon.png"
);
assert.equal(splashPlugin[1].backgroundColor, "#1E1B4B");
assert.doesNotMatch(
  JSON.stringify(appJson),
  /splash-icon\.png/,
  "construction-grid splash-icon.png must not be referenced in app.json"
);

const splashBytes = readFileSync(join(root, "assets/android-icon-foreground.png"));
const forbiddenGrid = readFileSync(join(root, "assets/splash-icon.png"));
assert.ok(splashBytes.length > 0, "finished splash mark must exist");
assert.equal(splashBytes.equals(forbiddenGrid), false, "finished mark is not the grid PNG");

const bootCompletion = readFileSync(join(root, "src/boot/bootCompletion.ts"), "utf8");
const bootGate = readFileSync(join(root, "src/boot/BootAnimationGate.tsx"), "utf8");

assert.match(bootScreen, /BootAnimationGate/, "ledger open animation must mount");
assert.match(bootScreen, /createBootCompletionMachine/);
assert.match(bootScreen, /createBootGateCompleters/);
assert.match(bootScreen, /computeBootReady/);
assert.match(bootScreen, /shouldShowLocalDbFailure/);
assert.match(bootScreen, /syncSessionOwnership/);
assert.match(bootScreen, /resolveBootDestination/);
assert.match(bootScreen, /sequenceHoldDurationMs/);
assert.match(bootCompletion, /BOOT_ANIMATION_MS/);
assert.match(bootCompletion, /BOOT_REDUCED_MOTION_MS/);
assert.doesNotMatch(bootScreen, /routingStartedRef/);
assert.doesNotMatch(bootGate, /if \(bootError && visible\)/);
assert.doesNotMatch(bootScreen, /consumeBootAnimationSlot/);
assert.doesNotMatch(bootScreen, /BOOT_BRAND_MIN_MS/);
assert.doesNotMatch(bootScreen, /logoCircle/);
assert.doesNotMatch(bootScreen, /VyaamikkIntroSplash/);
assert.match(bootScreen, /BRAND_SURFACE/);
assert.match(bootScreen, /finishBootNavigation/);
assert.match(bootScreen, /SplashScreen\.hideAsync/);
assert.match(
  bootScreen,
  /shouldShowLocalDbFailure\(dbStatus\)/,
  "local-db failure must hide splash / reach LocalDbErrorScreen"
);
assert.match(bootScreen, /LocalDbErrorScreen/);

assert.match(
  bootstrap,
  /if \(!outcome\.ok\)/,
  "config/startup failure must remain a controlled branch"
);
assert.match(bootstrap, /StartupFailureScreen/);
assert.doesNotMatch(
  bootstrap,
  /await hideSplash\(\);\s*if \(!outcome\.ok\)/,
  "must not hide native splash before success routing"
);
assert.match(bootstrap, /BRAND_SURFACE/);
assert.doesNotMatch(bootstrap, /ActivityIndicator/);
assert.match(layout, /preventAutoHideAsync/);

assert.match(bootRoute, /if \(!input\.signedIn \|\| !input\.user\)/);
assert.match(bootRoute, /href: getAuthEntryHref\(\)/);
assert.equal(getAuthEntryHref(), "/(auth)/v2");
assert.match(
  bootRoute,
  /canAccessDashboard|hrefForIdentityRouteState/,
  "signed-in route still goes through identity/dashboard resolution"
);

assert.match(
  coordinator,
  /Promise\.all\(\[jsFirebaseTask, localDbTask\]\)/,
  "independent JS Firebase init and local DB open must start together"
);
assert.doesNotMatch(coordinator, /scheduleDeferredIndiaPincodeWarm/);
assert.doesNotMatch(coordinator, /warmIndiaPincodeOfflineLookup/);
assert.doesNotMatch(coordinator, /resolveIndianPincode/);
assert.doesNotMatch(coordinator, /india-pincode/);
assert.doesNotMatch(coordinator, /pdfService/);
assert.doesNotMatch(coordinator, /useCalendarMapsData/);
assert.doesNotMatch(coordinator, /BOOT_BRAND_MIN_MS/);

assert.doesNotMatch(bootScreen, /scheduleDeferredIndiaPincodeWarm/);
assert.doesNotMatch(bootstrap, /scheduleDeferredIndiaPincodeWarm/);
assert.doesNotMatch(bootScreen, /scheduleDeferredIndiaPincodeWarm/);

console.log("bootProductionStartup.contract.test.ts: ok");
