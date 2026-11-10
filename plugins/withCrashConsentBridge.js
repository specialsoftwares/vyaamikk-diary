const fs = require("fs");
const path = require("path");
const { withDangerousMod, withMainApplication } = require("@expo/config-plugins");

/**
 * Copies the crash-consent runtime bridge into the Android app and registers it
 * on MainApplication. The bridge calls FirebaseCrashlytics.setCrashlyticsCollectionEnabled
 * for the current process. It does not write the RNFirebase auto-collection preference.
 *
 * This plugin is not registered in app.json by itself. Registration is a
 * coordinator decision. A signed binary that includes the copied sources is
 * required before any device check. This source is not that check.
 *
 * Signed-device checks — NOT RUN:
 * - Allow enables collection only in the current process.
 * - Force-stop, then relaunch, stays disabled until Allow again.
 * - Withdrawal disables collection.
 * - Switching accounts does not keep the previous grant.
 * - logcat or a debug readout must show the RNFirebase auto-collection preference false.
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

function withCrashConsentBridge(config) {
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
