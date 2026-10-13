/**
 * One resolver for the Android Maps key and the public availability flag.
 * The key is copied only into the native manifest config. `extra` receives
 * a boolean so runtime code never reads the key to decide whether to mount.
 */

const ANDROID_MAPS_CONFIGURED_EXTRA_KEY = "androidGoogleMapsConfigured";

function resolveAndroidMapsBuild(raw) {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key) return { configured: false, manifestApiKey: null };
  return { configured: true, manifestApiKey: key };
}

function applyAndroidMapsToExpoConfig(config, rawEnv) {
  const resolved = resolveAndroidMapsBuild(rawEnv);
  const extra = {
    ...(config.extra ?? {}),
    [ANDROID_MAPS_CONFIGURED_EXTRA_KEY]: resolved.configured,
  };
  const android = { ...(config.android ?? {}) };
  const androidConfig = { ...(android.config ?? {}) };
  if (resolved.manifestApiKey) {
    androidConfig.googleMaps = { ...(androidConfig.googleMaps ?? {}), apiKey: resolved.manifestApiKey };
  } else {
    delete androidConfig.googleMaps;
  }
  return {
    ...config,
    extra,
    android: {
      ...android,
      config: androidConfig,
    },
  };
}

module.exports = {
  ANDROID_MAPS_CONFIGURED_EXTRA_KEY,
  resolveAndroidMapsBuild,
  applyAndroidMapsToExpoConfig,
};
