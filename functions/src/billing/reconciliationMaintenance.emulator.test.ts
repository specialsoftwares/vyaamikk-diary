/**
 * Firestore-emulator proof of VYD-39 stale-company maintenance scanner:
 * document-id pagination, omitted watermarks, isolated failures, fairness
 * across ticks, and overlapping leases. Not a live Play/RTDN test.
 *
 * Run:
 *   cd <repo> && firebase emulators:exec --only firestore --project demo-vyaamikk \
 *     "npx --yes tsx functions/src/billing/reconciliationMaintenance.emulator.test.ts"
 */
import assert from "node:assert/strict";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";

import { FirestoreBillingStore } from "./firestoreBillingStore";
import { companyBillingPath, financialLedgerPath, revenueReportPath, sanitizeDocId } from "./paths";
import {
  documentIdCompanyScanner,
  runStaleCompanyMaintenance,
} from "./reconciliationMaintenance";
import { reportLedgerCommissionsForMonth } from "./reconciliationReporting";
import type { BillingEventLedgerDoc, CompanyBillingDoc } from "./types";

const NOW = 1_900_000_000_000;

function baseCompany(uid: string, over: Partial<CompanyBillingDoc> = {}): CompanyBillingDoc {
  return {
    uid,
    platform: "android",
    canonicalSku: "vyd_starter_monthly",
    productId: "vyd_starter",
    basePlanId: "monthly",
    latestOrderId: `GPA.${uid}`,
    originalTransactionId: null,
    credentialFingerprint: `fp-${uid}`,
    encryptedPurchaseCredential: {
      ciphertext: "cipher",
      keyVersion: "1",
      algorithm: "TEST",
    },
    invalidatedCredentialFingerprints: [],
    lastReconciledAt: NOW - 48 * 60 * 60 * 1000,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

async function main() {
  assert.ok(
    process.env.FIRESTORE_EMULATOR_HOST,
    "FIRESTORE_EMULATOR_HOST required (use firebase emulators:exec)"
  );
  if (getApps().length === 0) {
    initializeApp({ projectId: "demo-vyaamikk" });
  }
  const db = getFirestore();
  const store = new FirestoreBillingStore(db);
  const prefix = `maint-${Date.now()}-`;

  const scanner = documentIdCompanyScanner(async (afterDocumentId, pageSize) => {
    let q = db.collection("_companyBilling").orderBy(FieldPath.documentId()).limit(pageSize);
    if (afterDocumentId) q = q.startAfter(afterDocumentId);
    const snap = await q.get();
    return {
      docs: snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> })),
    };
  });

  const uids = Array.from({ length: 12 }, (_, i) => `${prefix}${String(i).padStart(2, "0")}`);
  for (const [i, uid] of uids.entries()) {
    if (i === 0) {
      const omitted = { ...baseCompany(uid) } as Record<string, unknown>;
      delete omitted.lastReconciledAt;
      await db.doc(companyBillingPath(uid)).set(omitted);
      continue;
    }
    if (i === 1) {
      await db.doc(companyBillingPath(uid)).set(baseCompany(uid, { lastReconciledAt: null }));
      continue;
    }
    if (i === 11) {
      await db.doc(companyBillingPath(uid)).set(baseCompany(uid, { lastReconciledAt: NOW - 1_000 }));
      continue;
    }
    await db.doc(companyBillingPath(uid)).set(baseCompany(uid));
  }

  const firstCalls: string[] = [];
  const first = await runStaleCompanyMaintenance({
    enabled: true,
    store,
    scanner,
    revalidate: async (input) => {
      firstCalls.push(input.uid);
      if (input.uid.endsWith("00")) throw new Error("poisoned omitted row");
      if (input.uid.endsWith("01")) return { kind: "pending", resultSummary: "pending" };
      return { kind: "terminal", resultSummary: "dead", causeCode: "gone" };
    },
    nowMs: () => NOW,
    maxItems: 10,
    leaseOwner: `${prefix}tick-1`,
    useDocumentIdScan: true,
    scanPageSize: 4,
  });
  assert.equal(first.failed, 1);
  assert.ok(firstCalls.length >= 1);
  assert.ok(firstCalls.includes(`${prefix}00`));
  assert.equal(firstCalls.includes(`${prefix}11`), false);

  const secondCalls: string[] = [];
  const second = await runStaleCompanyMaintenance({
    enabled: true,
    store,
    scanner,
    revalidate: async (input) => {
      secondCalls.push(input.uid);
      return { kind: "verified", resultSummary: "ok" };
    },
    nowMs: () => NOW,
    maxItems: 10,
    leaseOwner: `${prefix}tick-2`,
    useDocumentIdScan: true,
    scanPageSize: 4,
  });
  assert.ok(
    secondCalls.some((uid) => uid.endsWith("10")),
    `aged account beyond the first page must be visited, got ${secondCalls.join(",")}`
  );
  assert.equal(secondCalls.includes(`${prefix}11`), false);
  assert.equal(second.overlappingSkipped, false);

  let release!: (value: { kind: "pending"; resultSummary: string }) => void;
  const hold = new Promise<{ kind: "pending"; resultSummary: string }>((resolve) => {
    release = resolve;
  });
  const live = runStaleCompanyMaintenance({
    enabled: true,
    store,
    scanner,
    revalidate: async () => hold,
    nowMs: () => NOW,
    maxItems: 1,
    leaseOwner: `${prefix}live`,
    useDocumentIdScan: true,
  });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 50));
  const overlap = await runStaleCompanyMaintenance({
    enabled: true,
    store,
    scanner,
    revalidate: async () => {
      throw new Error("overlap");
    },
    nowMs: () => NOW,
    leaseOwner: `${prefix}other`,
    useDocumentIdScan: true,
  });
  assert.equal(overlap.overlappingSkipped, true);
  release({ kind: "pending", resultSummary: "held" });
  await live;

  for (let i = 0; i < 201; i++) {
    const id = `${prefix}ledger-${String(i).padStart(3, "0")}`;
    const row: BillingEventLedgerDoc = {
      financialEventId: id,
      platform: "android",
      uid: `${prefix}ledger`,
      canonicalSku: "vyd_starter_monthly",
      eventType: "purchase",
      grossAmountInPaise: 100,
      currency: "INR",
      actualPlatformCommissionInPaise: null,
      estimatedPlatformCommissionInPaise: 15,
      occurredAt: NOW,
      monthKey: "2026-09",
      relatedFinancialEventId: null,
      recordedAt: NOW,
      recordedBy: "rtdn",
    };
    await db.doc(financialLedgerPath(sanitizeDocId(id))).set(row);
  }
  const report = await reportLedgerCommissionsForMonth({
    scanner: {
      async listForMonth() {
        return [];
      },
      async listForMonthPage(monthKey, pageSize, afterId) {
        let q = db
          .collection("_billingEventLedger")
          .where("monthKey", "==", monthKey)
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
    monthKey: "2026-09",
    pageSize: 40,
    persistTo: store,
    nowMs: () => NOW,
  });
  assert.ok(report.eventCount >= 201);
  assert.equal(report.complete, true);
  assert.equal(report.sampleTruncated, false);
  assert.equal(report.persisted, true);
  const persisted = await db.doc(revenueReportPath("2026-09")).get();
  assert.equal(persisted.exists, true);
  assert.equal(persisted.data()?.netRevenueEstimateInPaise ?? null, null);

  console.log("reconciliationMaintenance.emulator.test.ts: ok");
  for (const app of getApps()) {
    await deleteApp(app);
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
