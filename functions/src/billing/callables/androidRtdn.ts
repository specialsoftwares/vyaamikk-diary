/**
 * androidRtdn — HTTP Pub/Sub push handler for Google Play RTDN (VYD-32).
 *
 * Authenticated via OIDC (PLAY_RTDN_PUSH_SERVICE_ACCOUNT / AUDIENCE).
 * New grants require PLAY_BILLING_ENABLED and PLAY_BILLING_TESTER_UIDS
 * inside the adapter. Already-owned token lifecycle (renew, cancel, grace,
 * hold, expiry, refund) still runs when new admission is closed. Delist
 * does not block that lifecycle. Hidden buttons are not this control.
 */

import { onRequest } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";

import { createProductionCredentialCipher } from "../crypto";
import { diagnosticUidHmac } from "../diagnosticUid";
import { FirestoreBillingStore } from "../firestoreBillingStore";
import { rtdnHttpStatusForError } from "../google/billingHttps";
import { GoogleCloudKmsKeyClient } from "../google/kmsAdcClient";
import type { AndroidBillingDeps } from "../google/androidSubscriptionAdapter";
import {
  billingKmsKeyNameFromEnv,
  PLAY_RTDN_PUSH_AUDIENCE_URL,
  PLAY_RTDN_PUSH_SERVICE_ACCOUNT_EMAIL,
  playPackageNameFromEnv,
} from "../google/playConstants";
import {
  getAndroidPublisherAccessTokenFromAdc,
  PlayApiClient,
} from "../google/playApiClient";
import {
  createGoogleOidcVerifier,
  verifyPubSubPushOidc,
  type OidcTokenVerifier,
} from "../google/pubsubOidc";
import { handleAndroidRtdn } from "../google/rtdn";
import { BILLING_CLIENT_MESSAGES } from "../errors";
import { BILLING_DIAG_RUNTIME_SECRETS } from "../secrets";

const playRtdnPushAudience = defineString("PLAY_RTDN_PUSH_AUDIENCE", {
  default: PLAY_RTDN_PUSH_AUDIENCE_URL,
});
const playRtdnPushServiceAccount = defineString("PLAY_RTDN_PUSH_SERVICE_ACCOUNT", {
  default: PLAY_RTDN_PUSH_SERVICE_ACCOUNT_EMAIL,
});

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
    enforceRestrictedTesters: true,
    enforcePlayBillingAdmission: true,
  };
}

export async function handleAndroidRtdnHttp(opts: {
  authorizationHeader: string | undefined;
  body: unknown;
  deps: AndroidBillingDeps;
  oidcVerifier: OidcTokenVerifier;
  oidcExpected: { audience: string; serviceAccountEmail: string };
}): Promise<{ status: number; body: { ok: boolean; action?: string } }> {
  await verifyPubSubPushOidc(opts.oidcVerifier, opts.authorizationHeader, opts.oidcExpected);
  const result = await handleAndroidRtdn(opts.deps, opts.body);
  return { status: result.httpStatus, body: { ok: true, action: result.action } };
}

export const androidRtdn = onRequest(
  {
    region: "asia-south1",
    secrets: BILLING_DIAG_RUNTIME_SECRETS,
    invoker: PLAY_RTDN_PUSH_SERVICE_ACCOUNT_EMAIL,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }
    try {
      const result = await handleAndroidRtdnHttp({
        authorizationHeader: req.get("authorization") ?? req.get("Authorization") ?? undefined,
        body: req.body,
        deps: productionDeps(),
        oidcVerifier: createGoogleOidcVerifier(),
        oidcExpected: {
          audience: playRtdnPushAudience.value(),
          serviceAccountEmail: playRtdnPushServiceAccount.value(),
        },
      });
      res.status(result.status).json(result.body);
    } catch (err) {
      const status = rtdnHttpStatusForError(err);
      res.status(status).json({
        ok: false,
        message: BILLING_CLIENT_MESSAGES.verification_failed,
      });
    }
  }
);
