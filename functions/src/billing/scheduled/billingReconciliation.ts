/**
 * Scheduled billing reconciliation. Fail-closed unless
 * BILLING_RECONCILIATION_ENABLED=true. Not a public HTTP worker.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldPath, getFirestore, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";

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
import { istMonthKeyForMillis } from "../istMonthKey";
import {
  collectDueReconciliationIds,
  newReconciliationInvocationId,
  runBillingReconciliationTick,
  type StoreRevalidator,
} from "../reconciliationConsumer";
import { isBillingReconciliationEnabled } from "../reconciliationFlags";
import {
  createAndroidStoreRevalidator,
  createIosStoreRevalidator,
  createPlatformStoreRevalidator,
} from "../reconciliationStoreRevalidate";
import {
  formatCommissionReportLine,
  reportLedgerCommissionsForMonth,
} from "../reconciliationReporting";
import {
  documentIdCompanyScanner,
  runStaleCompanyMaintenance,
} from "../reconciliationMaintenance";
import type { BillingEventLedgerDoc } from "../types";

function configurationDisabled(code: string): StoreRevalidator {
  return async () => ({ kind: "configuration_disabled", resultSummary: code });
}

function firestoreDueScanner(db: Firestore) {
  return {
    async listCandidateIds(tickNow: number, limit: number) {
      return collectDueReconciliationIds({
        nowMs: tickNow,
        limit,
        pageSize: 40,
        maxPages: 8,
        async readPage(page, pageSize) {
          const col = db.collection("_billingReconciliationQueue");
          const pendingQ = col
            .where("status", "in", ["pending", "failed_retryable"])
            .orderBy("nextAttemptAt")
            .limit(pageSize)
            .offset(page * pageSize);
          const leasedQ = col
            .where("status", "==", "leased")
            .orderBy("leaseExpiresAt")
            .limit(pageSize)
            .offset(page * pageSize);
          const [pending, leased] = await Promise.all([pendingQ.get(), leasedQ.get()]);
          const rows: Array<{
            id: string;
            status: string;
            nextAttemptAt?: number;
            leaseExpiresAt?: number;
          }> = [];
          for (const doc of [...pending.docs, ...leased.docs] as QueryDocumentSnapshot[]) {
            const data = doc.data() as {
              status?: string;
              nextAttemptAt?: number;
              leaseExpiresAt?: number;
            };
            rows.push({
              id: doc.id,
              status: data.status ?? "",
              nextAttemptAt: data.nextAttemptAt,
              leaseExpiresAt: data.leaseExpiresAt,
            });
          }
          return rows;
        },
      });
    },
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
    const invocationId = newReconciliationInvocationId(process.env.K_REVISION);

    let android: StoreRevalidator = configurationDisabled("play_billing_disabled");
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

    let ios: StoreRevalidator = configurationDisabled("appstore_billing_disabled");
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
        ios = configurationDisabled("ios_revalidator_unavailable");
      }
    }

    const revalidate = createPlatformStoreRevalidator({ android, ios });
    const tallies = await runBillingReconciliationTick({
      enabled: true,
      store,
      scanner: firestoreDueScanner(db),
      revalidate,
      nowMs,
      workerId: invocationId,
      maxItems: 10,
    });

    const maintenance = await runStaleCompanyMaintenance({
      enabled: true,
      store,
      scanner: documentIdCompanyScanner(async (afterDocumentId, pageSize) => {
        let q = db
          .collection("_companyBilling")
          .orderBy(FieldPath.documentId())
          .limit(pageSize);
        if (afterDocumentId) q = q.startAfter(afterDocumentId);
        const snap = await q.get();
        return {
          docs: snap.docs.map((doc) => ({
            id: doc.id,
            data: doc.data() as Record<string, unknown>,
          })),
        };
      }),
      revalidate,
      nowMs,
      maxItems: 10,
      leaseOwner: `maint:${invocationId}`,
      useDocumentIdScan: true,
    });

    const monthKey = istMonthKeyForMillis(nowMs());
    const report = await reportLedgerCommissionsForMonth({
      scanner: {
        async listForMonth() {
          return [];
        },
        async listForMonthPage(key, pageSize, afterId) {
          let q = db
            .collection("_billingEventLedger")
            .where("monthKey", "==", key)
            .orderBy(FieldPath.documentId())
            .limit(pageSize);
          if (afterId) q = q.startAfter(afterId);
          const snap = await q.get();
          return {
            rows: snap.docs.map((d) => d.data() as BillingEventLedgerDoc),
            lastId: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].id : null,
            exhausted: snap.docs.length < pageSize,
          };
        },
      },
      monthKey,
      persistTo: store,
      nowMs,
    });

    billingLog("info", {
      diagnosticUid: "scheduler",
      platform: "android",
      correlationId: invocationId,
      result: `reconciliation_tick:${tallies.claimed}:${tallies.resolved}:${tallies.retryable}:${tallies.terminal}:${tallies.pending}:${tallies.stale}:${tallies.configuration_disabled}`,
    });
    billingLog("info", {
      diagnosticUid: "scheduler",
      platform: "android",
      correlationId: invocationId,
      result: `stale_company:${maintenance.scanned}:${maintenance.attempted}:${maintenance.verified}:${maintenance.pending}:${maintenance.skipped}`,
    });
    billingLog("info", {
      diagnosticUid: "scheduler",
      platform: "android",
      correlationId: invocationId,
      result: `commission_report:${monthKey}:${formatCommissionReportLine(report)}`,
    });
  }
);
