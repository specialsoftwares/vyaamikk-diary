/**
 * Native IAP capability. Expo Go / web are not valid VYD-35 runtimes.
 */

import type { IapUnavailableReason } from "./iapTypes";

export interface IapRuntimeSignals {
  platform: string;
  appOwnership: string | null;
  nativeModulePresent: boolean;
}

export interface IapCapability {
  available: boolean;
  reason: IapUnavailableReason | null;
}

export function resolveIapCapability(signals: IapRuntimeSignals): IapCapability {
  if (signals.platform === "web") {
    return { available: false, reason: "web" };
  }
  if (signals.appOwnership === "expo") {
    return { available: false, reason: "expo_go" };
  }
  if (signals.platform !== "ios" && signals.platform !== "android") {
    return { available: false, reason: "native_build_required" };
  }
  if (!signals.nativeModulePresent) {
    return { available: false, reason: "native_build_required" };
  }
  return { available: true, reason: null };
}

export function readIapRuntimeSignals(args: {
  platform: string;
  appOwnership: string | null;
  nativeModulePresent: boolean;
}): IapRuntimeSignals {
  return {
    platform: args.platform,
    appOwnership: args.appOwnership,
    nativeModulePresent: args.nativeModulePresent,
  };
}
