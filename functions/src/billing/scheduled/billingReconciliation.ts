/**
 * Scheduled billing reconciliation. Fail-closed unless
 * BILLING_RECONCILIATION_ENABLED=true. Not a public HTTP worker.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";

import { createAppleSignedDataVerifier } from "../apple/appleVerifier";
import { createAppStoreServerApiClient } from "../apple/appleApiClient";
import { loadAppStoreRuntimeConfig } from "../apple/appleConfig";
import { isAppStoreBillingEnabled } from "../apple/appleConstants";
import { createProductionCredentialCipher } from "../crypto";
import { diagnosticUidHmac } from "../diagnosticUid";
import { FirestoreBillingStore } from "../firestoreBillingStore";
import { GoogleCloudKmsKeyClient } from "../google/kmsAdcClient";
import {
  billingKmsKeyNameFromEnv,
  isPlayBillingEnabled,
  playPackageNameFromEnv,
} from "../google/playConstants";
import {
  getAndroidPublisherAccessTokenFromAdc,
  PlayApiClient,
} from "../google/playApiClient";
import { billingLog } from "../log";
import { BillingError } from "../errors";
import { runBillingReconciliationTick } from "../reconciliationConsumer";
import { isBillingReconciliationEnabled } from "../reconciliationFlags";
import {
  createAndroidStoreRevalidator,
  createIosStoreRevalidator,
  createPlatformStoreRevalidator,
} from "../reconciliationStoreRevalidate";
import type { StoreRevalidator } from "../reconciliationConsumer";

function unavailable(code: string): StoreRevalidator {
  return async () => {
    throw new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: code,
      retryable: true,
    });
  };
}

export const scheduledBillingReconciliation = onSchedule(
  {
    region: "asia-south1",
    schedule: "every 5 minutes",
    timeoutSeconds: 120,
  },
  async () => {
    if (!isBillingReconciliationEnabled()) {
      return;
    }
    const db = getFirestore();
    const store = new FirestoreBillingStore(db);
    const secret = process.env.BILLING_DIAG_UID_SECRET ?? "";
    const diagnosticUidFor = (uid: string) => diagnosticUidHmac(secret, uid);
    const nowMs = () => Date.now();

    let android: StoreRevalidator = unavailable("play_billing_disabled");
    if (isPlayBillingEnabled()) {
      const androidDeps = {
        store,
        play: new PlayApiClient({
          getAccessToken: getAndroidPublisherAccessTokenFromAdc,
          packageName: playPackageNameFromEnv(),
        }),
        cipher: createProductionCredentialCipher({
          kms: new GoogleCloudKmsKeyClient(),
          keyName: billingKmsKeyNameFromEnv(),
        }),
        diagnosticUidFor,
        nowMs,
      };
      android = createAndroidStoreRevalidator(androidDeps, androidDeps.cipher);
    }

    let ios: StoreRevalidator = unavailable("appstore_billing_disabled");
    if (isAppStoreBillingEnabled()) {
      try {
        const cfg = loadAppStoreRuntimeConfig();
        ios = createIosStoreRevalidator({
          store,
          verifier: createAppleSignedDataVerifier({
            rootCaDerCerts: cfg.rootCaDerCerts,
            environment: cfg.environment,
            bundleId: cfg.bundleId,
            appAppleId: cfg.appAppleId,
            enableOnlineChecks: cfg.enableOnlineChecks === true,
          }),
          api: createAppStoreServerApiClient(cfg),
          diagnosticUidFor,
          nowMs,
        });
      } catch {
        ios = unavailable("ios_revalidator_unavailable");
      }
    }

    const scanner = {
      async listCandidateIds(tickNow: number) {
        const col = db.collection("_billingReconciliationQueue");
        const pending = await col
          .where("status", "in", ["pending", "failed_retryable", "leased"])
          .limit(40)
          .get();
        const ids: string[] = [];
        for (const doc of pending.docs) {
          const data = doc.data() as {
            nextAttemptAt?: number;
            status?: string;
            leaseExpiresAt?: number;
          };
          if ((data.nextAttemptAt ?? 0) > tickNow) continue;
          if (data.status === "leased" && (data.leaseExpiresAt ?? 0) > tickNow) continue;
          ids.push(doc.id);
        }
        return ids;
      },
    };

    const tallies = await runBillingReconciliationTick({
      enabled: true,
      store,
      scanner,
      revalidate: createPlatformStoreRevalidator({ android, ios }),
      nowMs,
      workerId: `scheduler:${process.env.K_REVISION ?? "local"}`,
      maxItems: 10,
    });
    billingLog("info", {
      diagnosticUid: "scheduler",
      platform: "android",
      result: `reconciliation_tick:${tallies.claimed}:${tallies.resolved}:${tallies.retryable}:${tallies.terminal}`,
    });
  }
);
