/**
 * Evidence-backed native-to-JS App Check evaluation.
 *
 * A native token string (real getToken or otherwise) is not JS coverage.
 * Production bootstrap does not pass a mocked token into this function.
 */

import { APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE } from "./appCheckTypes";

export type CustomProviderBridgeAttempt = {
  nativeTokenPresent: boolean;
  acceptedAsDualSdkCoverage: false;
  failure: string;
  jsAppId: string | null;
  nativeAppId: string | null;
  appIdentityCompatible: boolean;
};

export function evaluateNativeToJsCustomProvider(input: {
  nativeTokenPresent: boolean;
  jsAppId?: string | null;
  nativeAppId?: string | null;
}): CustomProviderBridgeAttempt {
  const jsAppId = input.jsAppId ?? null;
  const nativeAppId = input.nativeAppId ?? null;
  const sameNonEmptyIds =
    typeof jsAppId === "string" &&
    jsAppId.length > 0 &&
    typeof nativeAppId === "string" &&
    nativeAppId.length > 0 &&
    jsAppId === nativeAppId;
  const failure = sameNonEmptyIds
    ? "JS firebase/app-check initializeAppCheck is not called in this candidate, so a native token is not dual-SDK coverage even when app IDs match."
    : APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE;
  return {
    nativeTokenPresent: input.nativeTokenPresent,
    acceptedAsDualSdkCoverage: false,
    failure,
    jsAppId,
    nativeAppId,
    appIdentityCompatible: sameNonEmptyIds,
  };
}

/** @deprecated alias kept for existing unit names; not a production mock harness. */
export function attemptNativeToJsCustomProviderBridge(input: {
  nativeToken?: string;
  jsAppId?: string | null;
  nativeAppId?: string | null;
}): CustomProviderBridgeAttempt {
  return evaluateNativeToJsCustomProvider({
    nativeTokenPresent: typeof input.nativeToken === "string" && input.nativeToken.length > 0,
    jsAppId: input.jsAppId,
    nativeAppId: input.nativeAppId,
  });
}
