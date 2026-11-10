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
  assert.match(moduleSource, /Signed-device checks — NOT RUN/);
  assert.match(moduleSource, /Force-stop, then relaunch, stays disabled until Allow again/);
  assert.match(moduleSource, /Switching accounts does not keep the previous grant/);
  assert.match(moduleSource, /preference false/);
  assert.match(executable, /FirebaseCrashlytics\.getInstance\(\)\.setCrashlyticsCollectionEnabled\(enabled\)/);
  assert.match(executable, /FirebaseCrashlytics\.getInstance\(\)\.deleteUnsentReports\(\)/);
  assert.match(executable, /FirebaseCrashlytics\.getInstance\(\)\.recordException\(/);
  assert.match(executable, /FirebaseCrashlytics\.getInstance\(\)\.log\(/);
  assert.match(executable, /fun recordDiagnostic/);
  assert.match(executable, /fun logDiagnostic/);
  assert.doesNotMatch(executable, /KEY_CRASHLYTICS_AUTO_COLLECTION_ENABLED/);
  assert.doesNotMatch(executable, /sendUnsentReports/);
  assert.doesNotMatch(executable, /ReactNativeFirebasePreferences/);
  assert.match(packageSource, /CrashConsentBridgeModule/);
  assert.doesNotMatch(packageSource, /setCrashlyticsCollectionEnabled\(true\)/);
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
