/**
 * RNFirebase App Check. Must be initialized on the native [DEFAULT] app.
 * Expo Go cannot load this module. Debug provider is forbidden in production.
 * iOS is reported as appAttest, never as Play Integrity.
 */

import type { AppCheckInitStatus, AppCheckProviderKind } from "./appCheckTypes";

export type NativeAppCheckInitResult = {
  status: AppCheckInitStatus;
  provider: AppCheckProviderKind;
  tokenObtained: boolean;
  appId: string | null;
};

export type NativeAppCheckPort = {
  platform: "ios" | "android" | "other";
  nativeAppId?: string | null;
  initialize: (provider: AppCheckProviderKind) => Promise<void>;
  getToken?: (forceRefresh: boolean) => Promise<{ token: string; expireTimeMillis?: number }>;
};

function productionProvider(platform: "ios" | "android"): AppCheckProviderKind {
  return platform === "ios" ? "appAttest" : "playIntegrity";
}

export async function initializeNativeAppCheck(input: {
  isProduction: boolean;
  debugTokenPresent: boolean;
  port?: NativeAppCheckPort;
}): Promise<NativeAppCheckInitResult> {
  if (input.isProduction && input.debugTokenPresent) {
    return { status: "failed", provider: "debug", tokenObtained: false, appId: null };
  }

  const port = input.port ?? (await loadProductionPort());
  if (!port || port.platform === "other") {
    return { status: "skipped_non_native", provider: "none", tokenObtained: false, appId: port?.nativeAppId ?? null };
  }

  const provider = input.isProduction ? productionProvider(port.platform) : "debug";
  try {
    await port.initialize(provider);
    let tokenObtained = false;
    if (port.getToken) {
      try {
        const token = await port.getToken(false);
        tokenObtained = typeof token?.token === "string" && token.token.length > 0;
      } catch {
        tokenObtained = false;
      }
      try {
        // Force-refresh probe only. The string is never copied into JS App Check.
        await port.getToken(true);
      } catch {
        // Refresh failure does not undo initialize while enforcement is off.
      }
    }
    return {
      status: "initialized",
      provider,
      tokenObtained,
      appId: port.nativeAppId ?? null,
    };
  } catch {
    return {
      status: "module_unavailable",
      provider: "none",
      tokenObtained: false,
      appId: port.nativeAppId ?? null,
    };
  }
}

async function loadProductionPort(): Promise<NativeAppCheckPort | null> {
  try {
    const Platform = (await import("react-native")).Platform;
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      return { platform: "other", initialize: async () => undefined };
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appCheckMod = require("@react-native-firebase/app-check") as {
      default: () => {
        initializeAppCheck: (opts: { provider: unknown; isTokenAutoRefreshEnabled: boolean }) => Promise<void>;
        getToken?: (forceRefresh?: boolean) => Promise<{ token: string }>;
      };
      ReactNativeFirebaseAppCheckProvider?: new () => {
        configure: (opts: unknown) => void;
      };
    };
    const Provider = appCheckMod.ReactNativeFirebaseAppCheckProvider;
    if (!Provider) return { platform: Platform.OS, initialize: async () => {
      throw new Error("missing provider");
    } };
    let nativeAppId: string | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const appMod = require("@react-native-firebase/app") as {
        default: { app?: () => { options?: { appId?: string } } };
      };
      const id = appMod.default.app?.()?.options?.appId;
      nativeAppId = typeof id === "string" && id.length > 0 ? id : null;
    } catch {
      nativeAppId = null;
    }
    return {
      platform: Platform.OS,
      nativeAppId,
      initialize: async (providerKind) => {
        const rnfbProvider = new Provider();
        if (providerKind === "debug") {
          rnfbProvider.configure({
            android: { provider: "debug" },
            apple: { provider: "debug" },
          });
        } else {
          rnfbProvider.configure({
            android: { provider: "playIntegrity" },
            apple: { provider: "appAttestWithDeviceCheckFallback" },
          });
        }
        await appCheckMod.default().initializeAppCheck({
          provider: rnfbProvider,
          isTokenAutoRefreshEnabled: true,
        });
      },
      getToken: async (forceRefresh) => {
        const inst = appCheckMod.default();
        if (typeof inst.getToken !== "function") {
          return { token: "" };
        }
        return inst.getToken(forceRefresh);
      },
    };
  } catch {
    return null;
  }
}
