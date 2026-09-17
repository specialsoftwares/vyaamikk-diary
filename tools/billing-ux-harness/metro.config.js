const path = require("path");
const fs = require("fs");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(__dirname, "../..");
const workspaceNodeModules = fs.realpathSync(path.join(workspaceRoot, "node_modules"));

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot, workspaceNodeModules];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, "node_modules"),
  workspaceNodeModules,
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get(_target, name) {
      if (typeof name !== "string" || name.length === 0) return undefined;
      return path.join(workspaceNodeModules, name);
    },
  }
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "expo-router") {
    return {
      type: "sourceFile",
      filePath: path.join(projectRoot, "stubs/expo-router.js"),
    };
  }
  if (
    moduleName.startsWith("@react-native-firebase") ||
    moduleName === "firebase" ||
    moduleName.startsWith("firebase/") ||
    moduleName === "expo-sqlite" ||
    moduleName.startsWith("expo-sqlite/")
  ) {
    return { type: "empty" };
  }
  if (moduleName.startsWith("@/")) {
    return context.resolveRequest(
      context,
      path.join(workspaceRoot, "src", moduleName.slice(2)),
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.blockList = [
  /[\\/]src[\\/]state[\\/]auth\.tsx$/,
  /[\\/]src[\\/]state[\\/]localDb\.tsx$/,
  /[\\/]src[\\/]state[\\/]sync\.tsx$/,
  /[\\/]src[\\/]startup[\\/]BootstrapRoot\.tsx$/,
  /[\\/]src[\\/]billing[\\/]iap[\\/]/,
  /[\\/]src[\\/]services[\\/]auth[\\/]firebase\.ts$/,
  /[\\/]src[\\/]localDb[\\/]init\.ts$/,
];

module.exports = config;
