const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { withDangerousMod, withMainApplication, withAppBuildGradle, withSettingsGradle, withProjectBuildGradle } = require("@expo/config-plugins");

/**
 * Copies the phone-auth activity bridge into the Android app and registers it.
 * The bridge owns Android verification callbacks and credential-task publication.
 *
 * A signed binary that includes the copied sources is required before a device
 * check can see the signal. This source is not that check.
 */
const BRIDGE_IMPORT = "import com.specialsoftwares.vyaamikkdiary.phoneauth.PhoneAuthActivityPackage";
const BRIDGE_REGISTER = "add(PhoneAuthActivityPackage())";
const PACKAGE_APPLY = "PackageList(this).packages.apply {";

// The installed Firebase Auth 24.1.0 contains Kotlin 2.3 metadata. Kotlin
// 2.2.20 can read that metadata, but AGP 8.11's bundled R8 8.11.18 cannot
// safely shrink it. Pin the documented compatible stable R8 without changing
// Expo, AGP, Firebase, or disabling release shrinking/metadata validation.
// https://developer.android.com/build/kotlin-support
// https://r8.googlesource.com/r8/+/refs/heads/main/README.md#replacing-r8-in-android-gradle-plugin
const PHONE_AUTH_R8_VERSION = "8.13.19";
const PHONE_AUTH_KOTLIN_VERSION = "2.2.20";

// datetimepicker 8.4.4 uses an inherited synthetic property that Kotlin 2.2
// rejects. React Native's own getCurrentActivity() declares this exact
// replacement. Keep this compatibility patch reproducible and refuse any
// unreviewed package/source drift; do not upgrade the native dependency here.
const DATE_TIME_PICKER_SOURCE_HASHES = {
  "MaterialDatePickerModule.kt": "6ad7de3639ac29774b5da2438bcd8732d4822781508e72d93b78cf924228f477",
  "MaterialTimePickerModule.kt": "5e9642b99c9b47a82e85b3fc1e34d3a0aa4dee0b3ea50d5243866bcd81ea0f4b",
};
function applyDateTimePickerKotlinCompatibility(contents, fileName, version) {
  const expectedHash = DATE_TIME_PICKER_SOURCE_HASHES[fileName];
  if (version !== "8.4.4" || !expectedHash || typeof contents !== "string") {
    throw new Error("PHONE_AUTH_ACTIVITY: date/time picker compiler compatibility requires review");
  }
  const before = "val activity = currentActivity as FragmentActivity?";
  const after = "val activity = reactApplicationContext.currentActivity as FragmentActivity?";
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  if (hash(contents) === expectedHash) return contents.split(before).join(after);
  if (contents.split(after).length === 3 && hash(contents.split(after).join(before)) === expectedHash) return contents;
  throw new Error("PHONE_AUTH_ACTIVITY: date/time picker source differs from reviewed 8.4.4");
}

function patchDateTimePickerKotlinCompatibility(projectRoot) {
  const packagePath = require.resolve("@react-native-community/datetimepicker/package.json", { paths: [projectRoot] });
  const { version } = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const sourceRoot = path.join(path.dirname(packagePath), "android", "src", "main", "java", "com", "reactcommunity", "rndatetimepicker");
  const changes = Object.keys(DATE_TIME_PICKER_SOURCE_HASHES).map((fileName) => {
    const filePath = path.join(sourceRoot, fileName);
    const current = fs.readFileSync(filePath, "utf8");
    return { filePath, current, next: applyDateTimePickerKotlinCompatibility(current, fileName, version) };
  });
  for (const { filePath, current, next } of changes) {
    if (current !== next) fs.writeFileSync(filePath, next);
  }
}

// Expo's android.kotlinVersion aligns its version catalog and KSP; the SDK54
// root template also needs an explicit KGP dependency, otherwise React Native's
// transitive compiler 2.1.20 still wins the unversioned :app buildscript request.
function applyPhoneAuthKotlinCompiler(contents) {
  const pinned = `classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:${PHONE_AUTH_KOTLIN_VERSION}")`;
  if (typeof contents !== "string") throw new Error("PHONE_AUTH_ACTIVITY: root build.gradle missing");
  if ((contents.match(/org\.jetbrains\.kotlin:kotlin-gradle-plugin/g) || []).length !== 1) {
    throw new Error("PHONE_AUTH_ACTIVITY: Kotlin compiler dependency requires review");
  }
  if (contents.includes(pinned)) return contents;
  const request = /classpath\(\s*(["'])org\.jetbrains\.kotlin:kotlin-gradle-plugin\1\s*\)/;
  if (!request.test(contents)) throw new Error("PHONE_AUTH_ACTIVITY: Kotlin compiler dependency requires review");
  return contents.replace(request, pinned);
}

function applyPhoneAuthR8Toolchain(contents) {
  const start = "  // VYD_PHONE_AUTH_R8_BEGIN";
  const end = "  // VYD_PHONE_AUTH_R8_END";
  const block = `${start}\n  buildscript {\n    repositories {\n      google()\n      mavenCentral()\n    }\n    dependencies {\n      classpath("com.android.tools:r8:${PHONE_AUTH_R8_VERSION}")\n    }\n  }\n${end}`;
  if (typeof contents !== "string" || !/\bpluginManagement\s*\{/.test(contents)) {
    throw new Error("PHONE_AUTH_ACTIVITY: settings.gradle pluginManagement block missing");
  }
  if (contents.includes(start) || contents.includes(end)) {
    if (!contents.includes(block)) {
      throw new Error("PHONE_AUTH_ACTIVITY: unexpected generated R8 override");
    }
    if (/com\.android\.tools:r8:/.test(contents.replace(block, ""))) {
      throw new Error("PHONE_AUTH_ACTIVITY: existing R8 override requires review");
    }
    return contents;
  }
  if (/com\.android\.tools:r8:/.test(contents)) {
    throw new Error("PHONE_AUTH_ACTIVITY: existing R8 override requires review");
  }
  return contents.replace(/\bpluginManagement\s*\{/, (opening) => `${opening}\n${block}\n`);
}

// The bridge is compiled in :app. RNFirebase's implementation dependency does
// not expose Firebase Auth types to :app's compile classpath. Use the installed
// RNFirebase BOM, avoiding a second independently chosen Firebase version.
function applyPhoneAuthDependencies(contents, firebaseBomVersion) {
  const marker = "// VYD_PHONE_AUTH_DEPENDENCIES";
  if (contents.includes(marker)) return contents;
  if (!/^\d+\.\d+\.\d+$/.test(firebaseBomVersion)) {
    throw new Error("PHONE_AUTH_ACTIVITY: installed Firebase BOM version missing");
  }
  const block = `\n${marker}\ndependencies {\n    implementation platform("com.google.firebase:firebase-bom:${firebaseBomVersion}")\n    implementation "com.google.firebase:firebase-auth"\n}\n`;
  return contents + block;
}

function phoneAuthActivitySourceDir() {
  return path.join(
    __dirname,
    "..",
    "modules",
    "phone-auth-activity",
    "android",
    "src",
    "main",
    "java",
    "com",
    "specialsoftwares",
    "vyaamikkdiary",
    "phoneauth"
  );
}

function applyPhoneAuthActivityMainApplication(contents) {
  if (typeof contents !== "string" || contents.length === 0) {
    throw new Error("PHONE_AUTH_ACTIVITY: MainApplication contents missing");
  }
  if (!contents.includes("getPackages")) {
    throw new Error("PHONE_AUTH_ACTIVITY: MainApplication is missing getPackages");
  }
  let next = contents;
  if (!next.includes(BRIDGE_IMPORT)) {
    const declaration = next.match(/^package .+$/m);
    if (!declaration) throw new Error("PHONE_AUTH_ACTIVITY: package declaration missing");
    const at = declaration.index + declaration[0].length;
    next = `${next.slice(0, at)}\n\n${BRIDGE_IMPORT}${next.slice(at)}`;
  }
  if (!next.includes(BRIDGE_REGISTER)) {
    const applyAt = next.indexOf(PACKAGE_APPLY);
    if (applyAt < 0) {
      throw new Error("PHONE_AUTH_ACTIVITY: PackageList apply block missing");
    }
    const insertAt = applyAt + PACKAGE_APPLY.length;
    next = `${next.slice(0, insertAt)}\n              ${BRIDGE_REGISTER}${next.slice(insertAt)}`;
  }
  return next;
}

function withPhoneAuthActivity(config) {
  config = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") throw new Error("PHONE_AUTH_ACTIVITY: expected Groovy root build.gradle");
    cfg.modResults.contents = applyPhoneAuthKotlinCompiler(cfg.modResults.contents);
    return cfg;
  });
  config = withSettingsGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") throw new Error("PHONE_AUTH_ACTIVITY: expected Groovy settings.gradle");
    cfg.modResults.contents = applyPhoneAuthR8Toolchain(cfg.modResults.contents);
    return cfg;
  });
  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") throw new Error("PHONE_AUTH_ACTIVITY: expected Groovy app build.gradle");
    const installed = require("@react-native-firebase/app/package.json");
    cfg.modResults.contents = applyPhoneAuthDependencies(cfg.modResults.contents, installed.sdkVersions?.android?.firebase);
    return cfg;
  });
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      patchDateTimePickerKotlinCompatibility(cfg.modRequest.projectRoot);
      const sourceDir = phoneAuthActivitySourceDir();
      const destDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        "com",
        "specialsoftwares",
        "vyaamikkdiary",
        "phoneauth"
      );
      fs.mkdirSync(destDir, { recursive: true });
      for (const file of fs.readdirSync(sourceDir)) {
        if (!file.endsWith(".kt")) continue;
        fs.copyFileSync(path.join(sourceDir, file), path.join(destDir, file));
      }
      return cfg;
    },
  ]);
  return withMainApplication(config, (cfg) => {
    cfg.modResults.contents = applyPhoneAuthActivityMainApplication(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withPhoneAuthActivity;
module.exports.applyPhoneAuthActivityMainApplication = applyPhoneAuthActivityMainApplication;
module.exports.phoneAuthActivitySourceDir = phoneAuthActivitySourceDir;
module.exports.BRIDGE_IMPORT = BRIDGE_IMPORT;
module.exports.BRIDGE_REGISTER = BRIDGE_REGISTER;
module.exports.applyPhoneAuthDependencies = applyPhoneAuthDependencies;
module.exports.applyPhoneAuthR8Toolchain = applyPhoneAuthR8Toolchain;
module.exports.applyPhoneAuthKotlinCompiler = applyPhoneAuthKotlinCompiler;
module.exports.applyDateTimePickerKotlinCompatibility = applyDateTimePickerKotlinCompatibility;
