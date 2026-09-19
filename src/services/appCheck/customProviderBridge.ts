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
  appIdentityCompatible: false;
};

export function evaluateNativeToJsCustomProvider(input: {
  nativeTokenPresent: boolean;
  jsAppId?: string | null;
  nativeAppId?: string | null;
}): CustomProviderBridgeAttempt {
  const jsAppId = input.jsAppId ?? null;
  const nativeAppId = input.nativeAppId ?? null;
  return {
    nativeTokenPresent: input.nativeTokenPresent,
    acceptedAsDualSdkCoverage: false,
    failure: APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE,
    jsAppId,
    nativeAppId,
    appIdentityCompatible: false,
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
