const fs = require("fs");
const path = require("path");
const { withDangerousMod, withMainApplication, withAndroidManifest, withAppBuildGradle } = require("@expo/config-plugins");

/**
 * SDK-pinned pre-initialization migration + owner-scoped manual reporting.
 * The provider runs before Firebase (100) and RNFirebase (99/98). It clears
 * both stored automatic-collection overrides before either SDK is initialized.
 * The migration uses verified internal preference keys: dependency updates must
 * fail this guard and require review rather than silently bypassing consent.
 */
const BRIDGE_IMPORT = "import com.specialsoftwares.vyaamikkdiary.crashconsent.CrashConsentBridgePackage";
const BRIDGE_REGISTER = "add(CrashConsentBridgePackage())";
const PACKAGE_APPLY = "PackageList(this).packages.apply {";

function crashConsentBridgeSourceDir() {
  return path.join(
    __dirname,
    "..",
    "modules",
    "crash-consent",
    "android",
    "src",
    "main",
    "java",
    "com",
    "specialsoftwares",
    "vyaamikkdiary",
    "crashconsent"
  );
}

/**
 * Pure MainApplication transform for the Expo Kotlin template.
 * Idempotent: a second application does not duplicate the import or registration.
 */
function applyCrashConsentMainApplication(contents) {
  if (typeof contents !== "string" || contents.length === 0) {
    throw new Error("CRASH_CONSENT_BRIDGE: MainApplication contents missing");
  }
  if (!contents.includes("getPackages")) {
    throw new Error("CRASH_CONSENT_BRIDGE: MainApplication is missing getPackages");
  }
  let next = contents;
  if (!next.includes(BRIDGE_IMPORT)) {
    const declaration = next.match(/^package .+$/m);
    if (!declaration) throw new Error("CRASH_CONSENT_BRIDGE: package declaration missing");
    const at = declaration.index + declaration[0].length;
    next = `${next.slice(0, at)}\n\n${BRIDGE_IMPORT}${next.slice(at)}`;
  }
  if (!next.includes(BRIDGE_REGISTER)) {
    const applyAt = next.indexOf(PACKAGE_APPLY);
    if (applyAt < 0) {
      throw new Error("CRASH_CONSENT_BRIDGE: PackageList apply block missing");
    }
    const insertAt = applyAt + PACKAGE_APPLY.length;
    next = `${next.slice(0, insertAt)}\n              ${BRIDGE_REGISTER}${next.slice(insertAt)}`;
  }
  return next;
}

function assertCrashConsentVersions(projectRoot) {
  const appPath = require.resolve("@react-native-firebase/app/package.json", { paths: [projectRoot] });
  const crashPath = require.resolve("@react-native-firebase/crashlytics/package.json", { paths: [projectRoot] });
  const app = JSON.parse(fs.readFileSync(appPath, "utf8"));
  const crash = JSON.parse(fs.readFileSync(crashPath, "utf8"));
  if (app.version !== "24.1.0" || crash.version !== "24.1.0" || app.sdkVersions?.android?.firebase !== "34.14.0") {
    throw new Error("CRASH_CONSENT_BRIDGE: SDK startup migration requires reviewed RNFirebase 24.1.0 / Firebase BoM 34.14.0");
  }
}

function applyCrashConsentManifest(manifest) {
  const application = manifest.manifest.application?.[0];
  if (!application) throw new Error("CRASH_CONSENT_BRIDGE: Android application missing");
  const providerName = "com.specialsoftwares.vyaamikkdiary.crashconsent.CrashConsentBootstrap";
  const providers = application.provider ?? [];
  application.provider = providers.filter((item) => item.$?.["android:name"] !== providerName);
  application.provider.push({ $: {
    "android:name": providerName,
    "android:authorities": "${applicationId}.vydcrashconsentbootstrap",
    "android:exported": "false",
    "android:initOrder": "2147483647",
  }});
  return manifest;
}

function applyCrashConsentDependencies(contents) {
  const dependency = 'implementation("com.google.firebase:firebase-crashlytics:20.0.6")';
  const unitDependency = 'testImplementation("junit:junit:4.13.2")';
  if (contents.includes(dependency) && contents.includes(unitDependency)) return contents;
  if (!/dependencies\s*\{/.test(contents)) throw new Error("CRASH_CONSENT_BRIDGE: dependencies block missing");
  return contents.replace(/dependencies\s*\{/, (start) => `${start}\n    ${contents.includes(dependency) ? "" : dependency}\n    ${unitDependency}`);
}

function withCrashConsentBridge(config) {
  config = withAndroidManifest(config, (cfg) => {
    assertCrashConsentVersions(cfg.modRequest.projectRoot);
    cfg.modResults = applyCrashConsentManifest(cfg.modResults);
    return cfg;
  });
  config = withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = applyCrashConsentDependencies(cfg.modResults.contents);
    return cfg;
  });
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      const sourceDir = crashConsentBridgeSourceDir();
      const destDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        "com",
        "specialsoftwares",
        "vyaamikkdiary",
        "crashconsent"
      );
      fs.mkdirSync(destDir, { recursive: true });
      for (const file of fs.readdirSync(sourceDir)) {
        if (!file.endsWith(".kt")) continue;
        fs.copyFileSync(path.join(sourceDir, file), path.join(destDir, file));
      }
      const tests = path.join(sourceDir.replace(`${path.sep}main${path.sep}`, `${path.sep}test${path.sep}`));
      const testsDest = destDir.replace(`${path.sep}main${path.sep}`, `${path.sep}test${path.sep}`);
      fs.mkdirSync(testsDest, { recursive: true });
      for (const file of fs.readdirSync(tests)) {
        if (file.endsWith(".kt")) fs.copyFileSync(path.join(tests, file), path.join(testsDest, file));
      }
      return cfg;
    },
  ]);
  return withMainApplication(config, (cfg) => {
    cfg.modResults.contents = applyCrashConsentMainApplication(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withCrashConsentBridge;
module.exports.applyCrashConsentMainApplication = applyCrashConsentMainApplication;
module.exports.crashConsentBridgeSourceDir = crashConsentBridgeSourceDir;
module.exports.BRIDGE_IMPORT = BRIDGE_IMPORT;
module.exports.BRIDGE_REGISTER = BRIDGE_REGISTER;

module.exports.applyCrashConsentManifest = applyCrashConsentManifest;
module.exports.applyCrashConsentDependencies = applyCrashConsentDependencies;
module.exports.assertCrashConsentVersions = assertCrashConsentVersions;
