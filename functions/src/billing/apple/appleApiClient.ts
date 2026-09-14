/**
 * App Store Server API client wrapper (VYD-33).
 *
 * Tests inject a fake `AppleSubscriptionApi`. Production uses the official
 * `AppStoreServerAPIClient`. Errors never echo private keys or JWS bodies.
 */

import {
  AppStoreServerAPIClient,
  APIException,
  Environment,
  type StatusResponse,
} from "@apple/app-store-server-library";

import { BillingError } from "../errors";
import { CANONICAL_IOS_BUNDLE_ID } from "./appleConstants";
import type { AppStoreRuntimeConfig } from "./appleConfig";

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export interface AppleSubscriptionApi {
  getAllSubscriptionStatuses(originalTransactionId: string): Promise<StatusResponse>;
}

export function createAppStoreServerApiClient(
  cfg: AppStoreRuntimeConfig
): AppleSubscriptionApi {
  if (cfg.bundleId !== CANONICAL_IOS_BUNDLE_ID) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "ios_bundle_id_mismatch",
    });
  }
  if (cfg.environment === Environment.XCODE || cfg.environment === Environment.LOCAL_TESTING) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "invalid_appstore_environment",
    });
  }
  const inner = new AppStoreServerAPIClient(
    cfg.privateKeyPem,
    cfg.keyId,
    cfg.issuerId,
    cfg.bundleId,
    cfg.environment
  );
  return {
    async getAllSubscriptionStatuses(originalTransactionId: string): Promise<StatusResponse> {
      try {
        return await inner.getAllSubscriptionStatuses(originalTransactionId);
      } catch (err) {
        throw mapAppleApiException(err);
      }
    },
  };
}

export function mapAppleApiException(err: unknown): BillingError {
  if (err instanceof BillingError) return err;
  if (err instanceof APIException) {
    const status = err.httpStatusCode;
    if (RETRYABLE_STATUS.has(status) || status === 401 || status === 403) {
      return new BillingError({
        clientCode: "temporary_unavailable",
        causeCode: "apple_api_temporary_unavailable",
        retryable: true,
      });
    }
    if (status === 404) {
      return new BillingError({
        clientCode: "verification_failed",
        causeCode: "apple_api_not_found",
      });
    }
    return new BillingError({
      clientCode: "verification_failed",
      causeCode: "apple_api_invalid_purchase",
    });
  }
  return new BillingError({
    clientCode: "temporary_unavailable",
    causeCode: "apple_api_temporary_unavailable",
    retryable: true,
  });
}
