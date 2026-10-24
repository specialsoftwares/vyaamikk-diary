const { withAppBuildGradle } = require("@expo/config-plugins");

/** Keep framework resources for every UI language in src/i18n/types.ts. */
const RES_CONFIGS = 'resConfigs "en", "hi", "ta", "te", "gu"';

/**
 * Expo SDK 54 build-properties cannot set resourceConfigurations.
 * Strip other Android framework locales without dropping the app's five languages.
 */
function withAndroidLocaleConfigs(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error("android/app/build.gradle must stay Groovy to set resConfigs");
    }
    if (cfg.modResults.contents.includes("resConfigs")) {
      return cfg;
    }
    const next = cfg.modResults.contents.replace(
      /defaultConfig\s*\{/,
      (match) => `${match}\n        ${RES_CONFIGS}`
    );
    if (next === cfg.modResults.contents) {
      throw new Error("defaultConfig block not found in android/app/build.gradle");
    }
    cfg.modResults.contents = next;
    return cfg;
  });
}

module.exports = withAndroidLocaleConfigs;
