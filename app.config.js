/**
 * Dynamic Expo config — enables EAS file env for gitignored Google services files.
 * Static defaults live in app.json; Expo passes them as `config`.
 *
 * The Maps key and `extra.androidGoogleMapsConfigured` come from one resolver.
 * The key is not copied into `extra`.
 */
const { applyAndroidMapsToExpoConfig } = require("./src/services/maps/androidMapsBuildConfig");

module.exports = ({ config }) => {
  const withMaps = applyAndroidMapsToExpoConfig(
    config,
    process.env.GOOGLE_MAPS_ANDROID_API_KEY
  );
  return {
    ...withMaps,
    ios: {
      ...withMaps.ios,
      googleServicesFile:
        process.env.GOOGLE_SERVICE_INFO_PLIST ?? withMaps.ios?.googleServicesFile,
    },
    android: {
      ...withMaps.android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? withMaps.android?.googleServicesFile,
    },
  };
};
