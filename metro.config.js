// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite web (WASM) requires cross-origin isolation for SharedArrayBuffer.
config.resolver.assetExts.push("wasm");
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    return middleware(req, res, next);
  };
};

/**
 * App uses only MaterialCommunityIcons + Ionicons. Metro otherwise bundles
 * every @expo/vector-icons font (~3.5 MB). Subpath imports + this block
 * keep unused TTFs out of the Expo Go download.
 */
const ICON_FONT_DIR = path.join(
  __dirname,
  "node_modules",
  "@expo",
  "vector-icons",
  "build",
  "vendor",
  "react-native-vector-icons",
  "Fonts"
);
const KEEP_ICON_FONTS = new Set(["MaterialCommunityIcons.ttf", "Ionicons.ttf"]);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName.includes(`${path.sep}Fonts${path.sep}`) ||
    moduleName.includes("/Fonts/")
  ) {
    const base = path.basename(moduleName);
    if (base.endsWith(".ttf") && !KEEP_ICON_FONTS.has(base)) {
      return { type: "empty" };
    }
  }
  if (moduleName.startsWith(ICON_FONT_DIR)) {
    const base = path.basename(moduleName);
    if (base.endsWith(".ttf") && !KEEP_ICON_FONTS.has(base)) {
      return { type: "empty" };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
