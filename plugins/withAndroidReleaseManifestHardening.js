const { AndroidConfig, withAndroidManifest } = require("@expo/config-plugins");

/**
 * Remove unintended exported components that library manifests merge into the
 * release AndroidManifest.
 *
 * Evidence (NATIVE_ARTIFACT, vc24 AAB from EAS build c931da3d / source 7c938f8):
 * `androidx.compose.ui.tooling.PreviewActivity` is present with
 * `android:exported="true"`. It arrives through `expo-dev-launcher`, whose
 * Gradle module declares `androidx.compose.ui:ui-tooling` as a plain
 * `implementation` dependency, so the Compose preview host activity is
 * compiled into release builds too. That activity reflectively invokes any
 * `@Composable` named in an Intent extra and is meant for debug builds only.
 *
 * `tools:node="remove"` on a matching element in the app manifest makes the
 * manifest merger drop the library's declaration. If a future library version
 * stops declaring the activity the directive is a no-op.
 *
 * Scope is deliberately limited to the component reproduced in the artifact.
 * This plugin is not registered in app.json by itself; registration is a
 * coordinator decision and the result must be re-verified on the next built
 * artifact (bundletool dump manifest), not assumed from this source.
 */
const REMOVED_ACTIVITIES = ["androidx.compose.ui.tooling.PreviewActivity"];

function findActivity(application, name) {
  const list = Array.isArray(application.activity) ? application.activity : [];
  return list.find((a) => a && a.$ && a.$["android:name"] === name) ?? null;
}

/**
 * Pure manifest transform (config-plugins AndroidManifest JSON shape).
 * Idempotent: a second application yields a deeply-equal manifest.
 */
function applyAndroidReleaseManifestHardening(androidManifest) {
  if (!androidManifest || !androidManifest.manifest) {
    throw new Error("MANIFEST_HARDENING: AndroidManifest JSON missing <manifest>");
  }
  AndroidConfig.Manifest.ensureToolsAvailable(androidManifest);
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  if (!Array.isArray(application.activity)) application.activity = [];

  for (const name of REMOVED_ACTIVITIES) {
    const existing = findActivity(application, name);
    if (existing) {
      if (existing.$["tools:node"] !== "remove") {
        throw new Error(
          `MANIFEST_HARDENING: ${name} is declared by the app manifest without tools:node="remove"; refusing to overwrite`
        );
      }
      continue;
    }
    application.activity.push({
      $: { "android:name": name, "tools:node": "remove" },
    });
  }
  return androidManifest;
}

function withAndroidReleaseManifestHardening(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = applyAndroidReleaseManifestHardening(cfg.modResults);
    return cfg;
  });
}

module.exports = withAndroidReleaseManifestHardening;
module.exports.applyAndroidReleaseManifestHardening = applyAndroidReleaseManifestHardening;
module.exports.REMOVED_ACTIVITIES = REMOVED_ACTIVITIES;
