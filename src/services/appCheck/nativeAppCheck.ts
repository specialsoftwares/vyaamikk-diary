/**
 * RNFirebase App Check. Must be initialized on the native [DEFAULT] app.
 * Expo Go cannot load this module. Debug provider is forbidden in production.
 */

import type { AppCheckInitStatus, AppCheckProviderKind } from "./appCheckTypes";

export type NativeAppCheckInitResult = {
  status: AppCheckInitStatus;
  provider: AppCheckProviderKind;
};

export async function initializeNativeAppCheck(input: {
  isProduction: boolean;
  debugTokenPresent: boolean;
}): Promise<NativeAppCheckInitResult> {
  if (input.isProduction && input.debugTokenPresent) {
    return { status: "failed", provider: "debug" };
  }
  try {
    const Platform = (await import("react-native")).Platform;
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      return { status: "skipped_non_native", provider: "none" };
    }
  } catch {
    return { status: "skipped_non_native", provider: "none" };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appCheckMod = require("@react-native-firebase/app-check") as {
      default: () => {
        initializeAppCheck: (opts: { provider: unknown; isTokenAutoRefreshEnabled: boolean }) => Promise<void>;
      };
      ReactNativeFirebaseAppCheckProvider?: new () => {
        configure: (opts: unknown) => void;
      };
    };
    const Provider = appCheckMod.ReactNativeFirebaseAppCheckProvider;
    if (!Provider) {
      return { status: "module_unavailable", provider: "none" };
    }
    const rnfbProvider = new Provider();
    if (input.isProduction) {
      rnfbProvider.configure({
        android: { provider: "playIntegrity" },
        apple: { provider: "appAttestWithDeviceCheckFallback" },
      });
    } else {
      rnfbProvider.configure({
        android: { provider: "debug" },
        apple: { provider: "debug" },
      });
    }
    await appCheckMod.default().initializeAppCheck({
      provider: rnfbProvider,
      isTokenAutoRefreshEnabled: true,
    });
    return {
      status: "initialized",
      provider: input.isProduction ? "playIntegrity" : "debug",
    };
  } catch {
    return { status: "module_unavailable", provider: "none" };
  }
}
