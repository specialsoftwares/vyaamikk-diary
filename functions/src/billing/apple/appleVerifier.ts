/**
 * Official Apple SignedDataVerifier wrapper (VYD-33).
 *
 * Never decode an unverified JWS and treat its claims as authority.
 * VerificationException is mapped to fail-closed BillingError without echoing
 * the compact JWS.
 */

import {
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";

import { BillingError } from "../errors";
import { CANONICAL_IOS_BUNDLE_ID } from "./appleConstants";

export interface AppleSignedDataVerifier {
  verifyAndDecodeTransaction(signedTransactionInfo: string): Promise<JWSTransactionDecodedPayload>;
  verifyAndDecodeRenewalInfo(signedRenewalInfo: string): Promise<JWSRenewalInfoDecodedPayload>;
  verifyAndDecodeNotification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload>;
}

export function createAppleSignedDataVerifier(opts: {
  rootCaDerCerts: Buffer[];
  environment: Environment;
  bundleId?: string;
  appAppleId?: number;
  enableOnlineChecks?: boolean;
}): AppleSignedDataVerifier {
  const bundleId = opts.bundleId ?? CANONICAL_IOS_BUNDLE_ID;
  if (bundleId !== CANONICAL_IOS_BUNDLE_ID) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "ios_bundle_id_mismatch",
    });
  }
  if (opts.environment === Environment.PRODUCTION && opts.appAppleId == null) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "missing_appstore_app_apple_id",
    });
  }
  const inner = new SignedDataVerifier(
    opts.rootCaDerCerts,
    opts.enableOnlineChecks === true,
    opts.environment,
    bundleId,
    opts.appAppleId
  );
  return {
    verifyAndDecodeTransaction: (jws) => mapVerify(() => inner.verifyAndDecodeTransaction(jws)),
    verifyAndDecodeRenewalInfo: (jws) => mapVerify(() => inner.verifyAndDecodeRenewalInfo(jws)),
    verifyAndDecodeNotification: (jws) => mapVerify(() => inner.verifyAndDecodeNotification(jws)),
  };
}

async function mapVerify<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw mapVerificationException(err);
  }
}

export function mapVerificationException(err: unknown): BillingError {
  if (err instanceof BillingError) return err;
  const retryable =
    err instanceof VerificationException &&
    err.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE;
  if (retryable) {
    return new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: "apple_verification_temporary_unavailable",
      retryable: true,
    });
  }
  let causeCode = "apple_jws_verification_failed";
  if (err instanceof VerificationException) {
    if (err.status === VerificationStatus.INVALID_APP_IDENTIFIER) {
      causeCode = "apple_app_identifier_mismatch";
    } else if (err.status === VerificationStatus.INVALID_ENVIRONMENT) {
      causeCode = "apple_environment_mismatch";
    } else if (
      err.status === VerificationStatus.INVALID_CERTIFICATE ||
      err.status === VerificationStatus.INVALID_CHAIN_LENGTH
    ) {
      causeCode = "apple_certificate_mismatch";
    }
  }
  return new BillingError({
    clientCode: "verification_failed",
    causeCode,
  });
}
