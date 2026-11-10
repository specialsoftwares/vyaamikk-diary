/**
 * Config-plugin source tests for the crash-consent runtime bridge.
 * Label: CONFIG_PLUGIN_SOURCE. Not a signed-device run.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const plugin = require("./withCrashConsentBridge.js") as {
  applyCrashConsentMainApplication: (contents: string) => string;
  crashConsentBridgeSourceDir: () => string;
  BRIDGE_IMPORT: string;
  BRIDGE_REGISTER: string;
  applyCrashConsentManifest: (input: any) => any;
  applyCrashConsentDependencies: (input: string) => string;
  assertCrashConsentVersions: (root: string) => void;
};

const apply = plugin.applyCrashConsentMainApplication;

function templateMainApplication() {
  return `package com.specialsoftwares.vyaamikkdiary

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactPackage

class MainApplication : Application() {
  override fun getPackages(): List<ReactPackage> =
      PackageList(this).packages.apply {
            // Packages that cannot be autolinked yet can be added manually here, for example:
            // add(MyReactNativePackage())
          }
}
`;
}

{
  const sourceDir = plugin.crashConsentBridgeSourceDir();
  const moduleSource = readFileSync(join(sourceDir, "CrashConsentBridgeModule.kt"), "utf8");
  const packageSource = readFileSync(join(sourceDir, "CrashConsentBridgePackage.kt"), "utf8");
  const executable = moduleSource.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(moduleSource, /Signed-device startup, upgrade and account-switch checks — NOT RUN/);
  assert.match(executable, /CrashConsentRuntime\.enable\(uid, revision/);
  assert.match(executable, /CrashConsentRuntime\.disable\(delete = true\)/);
  assert.match(executable, /CrashConsentRuntime\.record\(message\)/);
  assert.match(executable, /CrashConsentRuntime\.log\(message\)/);
  assert.match(packageSource, /CrashConsentBridgeModule/);
  const bootstrap = readFileSync(join(sourceDir, "CrashConsentBootstrap.kt"), "utf8");
  assert.match(bootstrap, /"com.google.firebase.crashlytics"/);
  assert.match(bootstrap, /putBoolean\("firebase_crashlytics_collection_enabled", false\)/);
  assert.match(bootstrap, /putBoolean\("crashlytics_auto_collection_enabled", false\)/);
  assert.doesNotMatch(bootstrap, /setCrashlyticsCollectionEnabled\(true\)/);
  assert.match(bootstrap, /generation != claim/);
  assert.match(bootstrap, /checkForUnsentReports\(\)/);
  assert.match(bootstrap, /reportAction == null/);

}

{
  const next = apply(templateMainApplication());
  assert.equal(next.includes(plugin.BRIDGE_IMPORT), true);
  assert.equal(next.split(plugin.BRIDGE_REGISTER).length - 1, 1);
  const twice = apply(next);
  assert.equal(twice, next, "second application must not duplicate the registration");
}

{
  assert.throws(() => apply(""), /contents missing/);
  assert.throws(() => apply("class MainApplication"), /getPackages/);
  assert.throws(() => apply("fun getPackages() = 1"), /package declaration missing/);
  assert.throws(
    () => apply("package demo\nclass MainApplication { fun getPackages() = emptyList<ReactPackage>() }"),
    /PackageList apply block missing/
  );
}

console.log("withCrashConsentBridge.test.ts: ok (CONFIG_PLUGIN_SOURCE, not a signed-device run)");

{
  const manifest = { manifest: { application: [{ provider: [{ $: { "android:name": "com.google.firebase.provider.FirebaseInitProvider", "android:initOrder": "100" } }] }] } };
  const once = plugin.applyCrashConsentManifest(manifest);
  const twice = plugin.applyCrashConsentManifest(once);
  const providers = twice.manifest.application[0].provider;
  const boot = providers.filter((p: any) => p.$["android:name"].endsWith("CrashConsentBootstrap"));
  assert.equal(boot.length, 1);
  assert.equal(boot[0].$["android:exported"], "false");
  assert.ok(Number(boot[0].$["android:initOrder"]) > 100);
  const deps = plugin.applyCrashConsentDependencies("dependencies {\n}");
  assert.equal(plugin.applyCrashConsentDependencies(deps), deps);
  assert.match(deps, /firebase-crashlytics:20\.0\.6/);
  plugin.assertCrashConsentVersions(process.cwd());
}
