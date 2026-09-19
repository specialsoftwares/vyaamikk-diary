/**
 * RNFirebase App Check. Must be initialized on the native [DEFAULT] app.
 * Expo Go cannot load this module. Debug provider is forbidden in production.
 * iOS is reported as appAttest, never as Play Integrity.
 *
 * Provider initialize is the startup-relevant step. Optional getToken /
 * force-refresh probes are diagnostics and must not gate routing.
 */

import type { AppCheckInitStatus, AppCheckProviderKind } from "./appCheckTypes";

export type NativeAppCheckInitResult = {
  status: AppCheckInitStatus;
  provider: AppCheckProviderKind;
  tokenObtained: boolean;
  appId: string | null;
  probe?: (forceRefresh?: boolean) => Promise<{ tokenObtained: boolean; refreshAttempted: boolean }>;
};

export type NativeAppCheckPort = {
  platform: "ios" | "android" | "other";
  nativeAppId?: string | null;
  initialize: (provider: AppCheckProviderKind) => Promise<void>;
  getToken?: (forceRefresh: boolean) => Promise<{ token: string; expireTimeMillis?: number }>;
};

export type AppCheckClock = {
  nowMs: () => number;
  wait: (ms: number) => Promise<void>;
};

export const DEFAULT_APP_CHECK_INIT_BUDGET_MS = 2000;

export function defaultAppCheckClock(): AppCheckClock {
  return {
    nowMs: () => Date.now(),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

export async function raceWithBudget<T>(
  work: Promise<T>,
  budgetMs: number,
  clock: AppCheckClock
): Promise<{ kind: "done"; value: T } | { kind: "timeout" }> {
  let settled = false;
  const guarded = work.then(
    (value) => {
      settled = true;
      return { kind: "done" as const, value };
    },
    (err) => {
      settled = true;
      throw err;
    }
  );
  const timeout = clock.wait(budgetMs).then(() => {
    if (settled) return guarded;
    return { kind: "timeout" as const };
  });
  try {
    return await Promise.race([guarded, timeout]);
  } catch (err) {
    if (!settled) void work.catch(() => undefined);
    throw err;
  }
}

function productionProvider(platform: "ios" | "android"): AppCheckProviderKind {
  return platform === "ios" ? "appAttest" : "playIntegrity";
}

export async function initializeNativeAppCheck(input: {
  isProduction: boolean;
  debugTokenPresent: boolean;
  port?: NativeAppCheckPort;
  clock?: AppCheckClock;
  initBudgetMs?: number;
}): Promise<NativeAppCheckInitResult> {
  if (input.isProduction && input.debugTokenPresent) {
    return { status: "failed", provider: "debug", tokenObtained: false, appId: null };
  }

  const port = input.port ?? (await loadProductionPort());
  if (!port || port.platform === "other") {
    return { status: "skipped_non_native", provider: "none", tokenObtained: false, appId: port?.nativeAppId ?? null };
  }

  const provider = input.isProduction ? productionProvider(port.platform) : "debug";
  const clock = input.clock ?? defaultAppCheckClock();
  const budget = input.initBudgetMs ?? DEFAULT_APP_CHECK_INIT_BUDGET_MS;
  try {
    const initWork = port.initialize(provider);
    const raced = await raceWithBudget(initWork, budget, clock);
    if (raced.kind === "timeout") {
      void initWork.catch(() => undefined);
      return {
        status: "failed",
        provider,
        tokenObtained: false,
        appId: port.nativeAppId ?? null,
      };
    }
    return {
      status: "initialized",
      provider,
      tokenObtained: false,
      appId: port.nativeAppId ?? null,
      probe: port.getToken
        ? (forceRefresh) => probeNativeAppCheckTokens({ port, forceRefresh: forceRefresh === true })
        : undefined,
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

/** Explicit diagnostic path. Not a startup prerequisite. Force-refresh is opt-in. */
export async function probeNativeAppCheckTokens(input: {
  port: NativeAppCheckPort;
  forceRefresh?: boolean;
}): Promise<{ tokenObtained: boolean; refreshAttempted: boolean }> {
  if (!input.port.getToken) {
    return { tokenObtained: false, refreshAttempted: false };
  }
  let tokenObtained = false;
  try {
    const token = await input.port.getToken(false);
    tokenObtained = typeof token?.token === "string" && token.token.length > 0;
  } catch {
    tokenObtained = false;
  }
  if (!input.forceRefresh) {
    return { tokenObtained, refreshAttempted: false };
  }
  try {
    await input.port.getToken(true);
  } catch {
    // Refresh failure does not undo initialize while enforcement is off.
  }
  return { tokenObtained, refreshAttempted: true };
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
