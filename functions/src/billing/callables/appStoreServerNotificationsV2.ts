/**
 * appStoreServerNotificationsV2 — HTTP handler for App Store Server
 * Notifications V2 (VYD-33).
 *
 * First action is SignedDataVerifier.verifyAndDecodeNotification.
 * No mutation before successful verification. Production is fail-closed
 * while APPSTORE_BILLING_ENABLED is not true.
 */

import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

import { createAppStoreServerApiClient } from "../apple/appleApiClient";
import { loadAppStoreRuntimeConfig } from "../apple/appleConfig";
import { isAppStoreBillingEnabled, assertAppStoreLiveBillingAllowed } from "../apple/appleConstants";
import { processIosNotification, type IosBillingDeps } from "../apple/appleSubscriptionAdapter";
import { createAppleSignedDataVerifier } from "../apple/appleVerifier";
import { diagnosticUidHmac } from "../diagnosticUid";
import { BILLING_CLIENT_MESSAGES, BillingError } from "../errors";
import { FirestoreBillingStore } from "../firestoreBillingStore";
import { assnHttpStatusForError } from "../google/billingHttps";

export async function handleAppStoreServerNotificationsV2Http(opts: {
  body: unknown;
  deps: IosBillingDeps;
  appStoreBillingEnabled: boolean;
}): Promise<{ status: number; body: { ok: boolean; action?: string } }> {
  if (!opts.appStoreBillingEnabled) {
    throw new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: "appstore_billing_disabled",
      retryable: true,
    });
  }
  const raw = opts.body;
  const signedPayload =
    raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>).signedPayload
      : undefined;
  const result = await processIosNotification(opts.deps, signedPayload);
  return { status: 200, body: { ok: true, action: result.action } };
}

function productionDeps(): IosBillingDeps {
  assertAppStoreLiveBillingAllowed();
  const cfg = loadAppStoreRuntimeConfig();
  const store = new FirestoreBillingStore(getFirestore());
  const secret = process.env.BILLING_DIAG_UID_SECRET ?? "";
  return {
    store,
    verifier: createAppleSignedDataVerifier({
      rootCaDerCerts: cfg.rootCaDerCerts,
      environment: cfg.environment,
      bundleId: cfg.bundleId,
      appAppleId: cfg.appAppleId,
      enableOnlineChecks: cfg.enableOnlineChecks === true,
    }),
    api: createAppStoreServerApiClient(cfg),
    diagnosticUidFor: (uid) => diagnosticUidHmac(secret, uid),
    nowMs: () => Date.now(),
  };
}

export const appStoreServerNotificationsV2 = onRequest(
  { region: "asia-south1" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }
    try {
      const enabled = isAppStoreBillingEnabled();
      const result = await handleAppStoreServerNotificationsV2Http({
        body: req.body,
        deps: enabled ? productionDeps() : ({} as IosBillingDeps),
        appStoreBillingEnabled: enabled,
      });
      res.status(result.status).json(result.body);
    } catch (err) {
      const status = assnHttpStatusForError(err);
      res.status(status).json({
        ok: false,
        message: BILLING_CLIENT_MESSAGES.verification_failed,
      });
    }
  }
);
