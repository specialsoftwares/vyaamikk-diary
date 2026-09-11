/**
 * VYD-22: production boot must not show construction-grid choreography.
 * Native splash stays until route resolution; signed-out goes to auth.
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

assert.doesNotMatch(bootScreen, /BootAnimationGate/);
assert.doesNotMatch(bootScreen, /VyaamikkBootAnimation/);
assert.doesNotMatch(bootScreen, /consumeBootAnimationSlot/);
assert.doesNotMatch(bootScreen, /BOOT_BRAND_MIN_MS/);
assert.doesNotMatch(bootScreen, /logoCircle/);
assert.doesNotMatch(bootScreen, /VyaamikkIntroSplash/);
assert.match(bootScreen, /BRAND_SURFACE/);
assert.match(bootScreen, /finishBootNavigation/);
assert.match(bootScreen, /getAuthEntryHref/);
assert.match(bootScreen, /routingStartedRef/);

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

assert.match(bootRoute, /if \(!input\.signedIn \|\| !input\.user\)/);
assert.match(bootRoute, /href: getAuthEntryHref\(\)/);
assert.equal(getAuthEntryHref(), "/(auth)/v2");

console.log("bootProductionStartup.contract.test.ts: ok");
