/**
 * Explicit failed proof: returning a mocked native token from CustomProvider
 * is not dual-SDK App Check coverage.
 */

import { APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE } from "./appCheckTypes";

export type CustomProviderBridgeAttempt = {
  mockedTokenReturned: boolean;
  acceptedAsDualSdkCoverage: false;
  failure: string;
};

export function attemptNativeToJsCustomProviderBridge(input: {
  nativeToken: string;
}): CustomProviderBridgeAttempt {
  const mockedTokenReturned = typeof input.nativeToken === "string" && input.nativeToken.length > 0;
  return {
    mockedTokenReturned,
    acceptedAsDualSdkCoverage: false,
    failure: APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE,
  };
}
