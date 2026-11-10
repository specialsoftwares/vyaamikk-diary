const fs = require("fs");
const path = require("path");
const { withDangerousMod, withMainApplication } = require("@expo/config-plugins");

/**
 * Copies the phone-auth activity bridge into the Android app and registers it.
 * The bridge reads the current Activity. It does not start phone authentication.
 *
 * A signed binary that includes the copied sources is required before a device
 * check can see the signal. This source is not that check.
 */
const BRIDGE_IMPORT = "import com.specialsoftwares.vyaamikkdiary.phoneauth.PhoneAuthActivityPackage";
const BRIDGE_REGISTER = "add(PhoneAuthActivityPackage())";
const PACKAGE_APPLY = "PackageList(this).packages.apply {";

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
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
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
