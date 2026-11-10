/**
 * Source tests for the phone-auth activity signal.
 * The Kotlin method reads currentActivity. This is not a signed-device run.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

const pluginDirectory = fileURLToPath(new URL(".", import.meta.url));

import { createPhoneAuthNativeSlot, sendPermittedBySignal } from "../src/services/auth/phoneAuthNativeSlot";

const require = createRequire(import.meta.url);
const plugin = require("./withPhoneAuthActivity.js") as {
  applyPhoneAuthActivityMainApplication: (contents: string) => string;
  phoneAuthActivitySourceDir: () => string;
  BRIDGE_IMPORT: string;
  BRIDGE_REGISTER: string;
  applyPhoneAuthDependencies: (contents: string, firebaseBomVersion: string) => string;
  applyPhoneAuthR8Toolchain: (contents: string) => string;
  applyPhoneAuthKotlinCompiler: (contents: string) => string;
  applyDateTimePickerKotlinCompatibility: (contents: string, fileName: string, version: string) => string;
};

const dependencies = plugin.applyPhoneAuthDependencies("plugins {}", "34.14.0");
assert.match(dependencies, /implementation "com.google.firebase:firebase-auth"/);
assert.match(dependencies, /firebase-bom:34.14.0/);
assert.equal(plugin.applyPhoneAuthDependencies(dependencies, "34.14.0"), dependencies);
assert.throws(() => plugin.applyPhoneAuthDependencies("", ""), /BOM version missing/);

{
  const packageRoot = fileURLToPath(new URL("../node_modules/@react-native-community/datetimepicker/", import.meta.url));
  for (const fileName of ["MaterialDatePickerModule.kt", "MaterialTimePickerModule.kt"]) {
    const installed = readFileSync(join(packageRoot, "android/src/main/java/com/reactcommunity/rndatetimepicker", fileName), "utf8");
    const original = installed.replaceAll("val activity = reactApplicationContext.currentActivity as FragmentActivity?", "val activity = currentActivity as FragmentActivity?");
    const patched = plugin.applyDateTimePickerKotlinCompatibility(original, fileName, "8.4.4");
    assert.equal(patched.split("val activity = reactApplicationContext.currentActivity as FragmentActivity?").length - 1, 2);
    assert.doesNotMatch(patched, /val activity = currentActivity as/);
    assert.equal(plugin.applyDateTimePickerKotlinCompatibility(patched, fileName, "8.4.4"), patched);
    assert.throws(() => plugin.applyDateTimePickerKotlinCompatibility(original + "\n", fileName, "8.4.4"), /differs from reviewed/);
    assert.throws(() => plugin.applyDateTimePickerKotlinCompatibility(original, fileName, "8.4.5"), /requires review/);
    assert.equal(patched.replaceAll("reactApplicationContext.currentActivity", "currentActivity"), original, "only the two getter expressions change");
  }
}

{
  const root = "buildscript { dependencies { classpath('org.jetbrains.kotlin:kotlin-gradle-plugin') } }";
  const pinned = plugin.applyPhoneAuthKotlinCompiler(root);
  assert.match(pinned, /classpath\("org\.jetbrains\.kotlin:kotlin-gradle-plugin:2\.2\.20"\)/);
  assert.equal(plugin.applyPhoneAuthKotlinCompiler(pinned), pinned);
  assert.throws(() => plugin.applyPhoneAuthKotlinCompiler(pinned + root), /requires review/);
  assert.throws(() => plugin.applyPhoneAuthKotlinCompiler(root.replace("kotlin-gradle-plugin'", "kotlin-gradle-plugin:2.1.20'")), /requires review/);
  assert.throws(() => plugin.applyPhoneAuthKotlinCompiler("buildscript {}"), /requires review/);
  const app = JSON.parse(readFileSync(join(pluginDirectory, "..", "app.json"), "utf8"));
  const buildProperties = app.expo.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === "expo-build-properties");
  assert.equal(buildProperties[1].android.kotlinVersion, "2.2.20", "Expo KSP/catalog and app compiler must stay aligned");
  assert.equal(buildProperties[1].android.enableMinifyInReleaseBuilds, true);
}

{
  const template = 'pluginManagement {\n  includeBuild("react-native-plugin")\n}\nplugins { id("expo-autolinking-settings") }\n';
  const generated = plugin.applyPhoneAuthR8Toolchain(template);
  assert.match(generated, /pluginManagement \{\s*\/\/ VYD_PHONE_AUTH_R8_BEGIN\s*buildscript \{/);
  assert.match(generated, /classpath\("com\.android\.tools:r8:8\.13\.19"\)/);
  assert.match(generated, /includeBuild\("react-native-plugin"\)/);
  assert.match(generated, /id\("expo-autolinking-settings"\)/);
  assert.equal(plugin.applyPhoneAuthR8Toolchain(generated), generated);
  assert.throws(() => plugin.applyPhoneAuthR8Toolchain("plugins {}"), /pluginManagement block missing/);
  assert.throws(() => plugin.applyPhoneAuthR8Toolchain(template + '// com.android.tools:r8:9.0.0'), /requires review/);
  assert.throws(() => plugin.applyPhoneAuthR8Toolchain(generated + '// com.android.tools:r8:9.0.0'), /requires review/);
  assert.throws(() => plugin.applyPhoneAuthR8Toolchain(generated.replace("8.13.19", "8.11.18")), /unexpected generated R8/);
  assert.doesNotMatch(generated, /skip-metadata|enableR8=false|dontshrink|dontoptimize/);
}

const apply = plugin.applyPhoneAuthActivityMainApplication;

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
  const sourceDir = plugin.phoneAuthActivitySourceDir();
  const moduleSource = readFileSync(join(sourceDir, "PhoneAuthActivityModule.kt"), "utf8");
  const executable = moduleSource.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(executable, /reactApplicationContext\.currentActivity/);
  assert.match(executable, /System\.identityHashCode\(activity\)/);
  assert.match(executable, /return "present:" \+ System\.identityHashCode\(activity\)/);
  assert.match(executable, /"refused:in_flight"/);
  assert.doesNotMatch(executable, /"recovered"/);
  assert.match(executable, /credentialTask/);
  assert.match(executable, /activeSend !== attempt \|\| attempt.retired/);
  assert.match(executable, /PhoneAuthProvider\.verifyPhoneNumber/);
  assert.match(executable, /verificationProof/);
  assert.doesNotMatch(executable, /RNFBAuthModule|module loaded|getConstants/);
  const appJson = readFileSync(join(pluginDirectory, "..", "app.json"), "utf8");
  assert.match(appJson, /\.\/plugins\/withPhoneAuthActivity\.js/);
}

{
  assert.equal(sendPermittedBySignal("unknown"), false);
  assert.equal(sendPermittedBySignal("present"), false);
  assert.equal(sendPermittedBySignal("present:0"), false);
  assert.equal(sendPermittedBySignal("present:41"), true);
  const slot = createPhoneAuthNativeSlot();
  assert.equal(slot.claim("send", 1, null), "refused:missing");
  assert.equal(slot.claim("send", 1, { id: "41" }), "accepted:41");
  assert.equal(slot.claim("send", 2, { id: "41" }), "refused:in_flight");
  assert.equal(slot.recover("send", { id: "41" }), "held");
  assert.equal(slot.release("send", 2), "stale");
  assert.equal(slot.recover("send", null), "held");
  assert.equal(slot.claim("confirm", 1, { id: "41" }), "refused:in_flight");
  assert.equal(slot.claim("send", 3, { id: "42" }), "refused:in_flight");
  assert.equal(slot.release("send", 1), "released");
  assert.equal(slot.claim("send", 3, { id: "42" }), "accepted:42");
  assert.equal(slot.release("send", 3), "released");
  assert.equal(slot.recover("send", { id: "42" }), "idle");
}

{
  const gate = readFileSync(
    join(pluginDirectory, "..", "src", "services", "auth", "nativePhoneAuth.ts"),
    "utf8"
  );
  const send = gate.split("export async function startNativePhoneOtp")[1]?.split(
    "export async function confirmNativePhoneOtp"
  )[0];
  assert.ok(send);
  assert.match(send, /sendPermittedBySignal\(androidSignal\)/);
  assert.doesNotMatch(send, /probeAndroidAuthActivityState|RNFBAuthModule/);
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

console.log("withPhoneAuthActivity.test.ts: ok (source signal, not a signed-device run)");
