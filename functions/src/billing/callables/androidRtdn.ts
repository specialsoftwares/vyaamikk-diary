/**
 * androidRtdn — HTTP Pub/Sub push handler for Google Play RTDN (VYD-32).
 *
 * Authenticated via OIDC (PLAY_RTDN_PUSH_SERVICE_ACCOUNT / AUDIENCE).
 * Production is fail-closed while PLAY_BILLING_ENABLED is not true.
 */

import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

import { createProductionCredentialCipher } from "../crypto";
import { diagnosticUidHmac } from "../diagnosticUid";
import { FirestoreBillingStore } from "../firestoreBillingStore";
import { rtdnHttpStatusForError } from "../google/billingHttps";
import { GoogleCloudKmsKeyClient } from "../google/kmsAdcClient";
import type { AndroidBillingDeps } from "../google/androidSubscriptionAdapter";
import {
  billingKmsKeyNameFromEnv,
  isPlayBillingEnabled,
  playPackageNameFromEnv,
} from "../google/playConstants";
import {
  getAndroidPublisherAccessTokenFromAdc,
  PlayApiClient,
} from "../google/playApiClient";
import {
  createGoogleOidcVerifier,
  rtdnOidcExpectationFromEnv,
  verifyPubSubPushOidc,
  type OidcTokenVerifier,
} from "../google/pubsubOidc";
import { handleAndroidRtdn } from "../google/rtdn";
import { BillingError, BILLING_CLIENT_MESSAGES } from "../errors";

function productionDeps(): AndroidBillingDeps {
  const store = new FirestoreBillingStore(getFirestore());
  const secret = process.env.BILLING_DIAG_UID_SECRET ?? "";
  return {
    store,
    play: new PlayApiClient({
      getAccessToken: getAndroidPublisherAccessTokenFromAdc,
      packageName: playPackageNameFromEnv(),
    }),
    cipher: createProductionCredentialCipher({
      kms: new GoogleCloudKmsKeyClient(),
      keyName: billingKmsKeyNameFromEnv(),
    }),
    diagnosticUidFor: (uid) => diagnosticUidHmac(secret, uid),
    nowMs: () => Date.now(),
  };
}

export async function handleAndroidRtdnHttp(opts: {
  authorizationHeader: string | undefined;
  body: unknown;
  deps: AndroidBillingDeps;
  oidcVerifier: OidcTokenVerifier;
  playBillingEnabled: boolean;
  oidcExpected: { audience: string; serviceAccountEmail: string };
}): Promise<{ status: number; body: { ok: boolean; action?: string } }> {
  if (!opts.playBillingEnabled) {
    throw new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: "play_billing_disabled",
      retryable: true,
    });
  }
  await verifyPubSubPushOidc(opts.oidcVerifier, opts.authorizationHeader, opts.oidcExpected);
  const result = await handleAndroidRtdn(opts.deps, opts.body);
  return { status: result.httpStatus, body: { ok: true, action: result.action } };
}

export const androidRtdn = onRequest({ region: "asia-south1" }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  try {
    const enabled = isPlayBillingEnabled();
    const result = await handleAndroidRtdnHttp({
      authorizationHeader: req.get("authorization") ?? req.get("Authorization") ?? undefined,
      body: req.body,
      deps: enabled ? productionDeps() : ({} as AndroidBillingDeps),
      oidcVerifier: createGoogleOidcVerifier(),
      playBillingEnabled: enabled,
      oidcExpected: rtdnOidcExpectationFromEnv(),
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    const status = rtdnHttpStatusForError(err);
    res.status(status).json({
      ok: false,
      message: BILLING_CLIENT_MESSAGES.verification_failed,
    });
  }
});
