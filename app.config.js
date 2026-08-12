/**
 * Dynamic Expo config — enables EAS file env for gitignored Google services files.
 * Static defaults live in app.json; Expo passes them as `config`.
 */
module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    googleServicesFile:
      process.env.GOOGLE_SERVICE_INFO_PLIST ?? config.ios?.googleServicesFile,
  },
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
});
