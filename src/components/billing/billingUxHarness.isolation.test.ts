/**
 * Isolated harness host must not pull production bootstrap.
 * Boundary: source inspection. Not device.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const indexJs = fs.readFileSync(path.join(root, "tools/billing-ux-harness/index.js"), "utf8");
const harness = fs.readFileSync(
  path.join(root, "tools/billing-ux-harness/src/HarnessApp.tsx"),
  "utf8"
);
const metro = fs.readFileSync(path.join(root, "tools/billing-ux-harness/metro.config.js"), "utf8");
const pkg = fs.readFileSync(path.join(root, "tools/billing-ux-harness/package.json"), "utf8");

assert.equal(indexJs.includes("BootstrapRoot"), false);
assert.equal(indexJs.includes("AuthProvider"), false);
assert.equal(indexJs.includes("LocalDbProvider"), false);
assert.equal(indexJs.includes("SyncProvider"), false);
assert.equal(indexJs.includes("IapProvider"), false);
assert.equal(indexJs.includes("ThemeProvider"), true);
assert.equal(indexJs.includes("I18nProvider"), true);
assert.equal(indexJs.includes("LocaleFontProvider"), true);
assert.equal(indexJs.includes("NavigationContainer"), true);
assert.equal(indexJs.includes("createRoot"), true);
assert.equal(indexJs.includes("BootstrapRoot"), false);
assert.equal(harness.includes("BillingUxPreviewLab"), true);
assert.equal(
  harness.includes("Isolated component preview — not full-app or native validation."),
  true
);
assert.equal(metro.includes("BootstrapRoot"), true);
assert.equal(metro.includes("expo-sqlite"), true);
assert.equal(pkg.includes("node_modules/.bin/expo"), true);
assert.equal(pkg.includes("--web --port 8092"), true);

const lab = fs.readFileSync(
  path.join(root, "src/components/billing/BillingUxPreviewLab.tsx"),
  "utf8"
);
assert.equal(lab.includes("setLastPreviewAction(`purchase:${sku}`)"), true);
assert.equal(lab.includes('setLastPreviewAction("trial")'), true);
assert.equal(lab.includes('setLastPreviewAction("restore")'), true);
assert.equal(lab.includes("grantProfessionalTrial"), false);
assert.equal(lab.includes("onPurchase"), true);

console.log("billingUxHarness.isolation.test.ts: ok");
