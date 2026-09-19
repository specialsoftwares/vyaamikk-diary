/**
 * VYD-39 maintenance (stale company) and ledger commission reporting.
 */
import assert from "node:assert/strict";

import { companyBillingPath, financialLedgerPath, sanitizeDocId } from "./paths";
import {
  collectStaleCompanyRows,
  isStaleCompanyWatermark,
  memoryStaleCompanyScanner,
  runStaleCompanyMaintenance,
} from "./reconciliationMaintenance";
import {
  summarizeLedgerCommissions,
  reportLedgerCommissionsForMonth,
  memoryLedgerMonthScanner,
} from "./reconciliationReporting";
import { MemoryBillingStore } from "./store";
import type { BillingEventLedgerDoc, CompanyBillingDoc } from "./types";

const NOW = 1_900_000_000_000;
const UID = "user-stale-1";

function company(over: Partial<CompanyBillingDoc> = {}): CompanyBillingDoc {
  return {
    uid: UID,
    platform: "android",
    canonicalSku: "vyd_starter_monthly",
    productId: "vyd_starter",
    basePlanId: "monthly",
    latestOrderId: "GPA.STALE-1",
    originalTransactionId: null,
    credentialFingerprint: "live-fp",
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

function ledger(over: Partial<BillingEventLedgerDoc> = {}): BillingEventLedgerDoc {
  return {
    financialEventId: "android:purchase:GPA.STALE-1",
    platform: "android",
    uid: UID,
    canonicalSku: "vyd_starter_monthly",
    eventType: "purchase",
    grossAmountInPaise: 9900,
    currency: "INR",
    actualPlatformCommissionInPaise: null,
    estimatedPlatformCommissionInPaise: 1485,
    occurredAt: NOW,
    monthKey: "2026-09",
    relatedFinancialEventId: null,
    recordedAt: NOW,
    recordedBy: "rtdn",
    ...over,
  };
}

async function main() {
  {
    const store = new MemoryBillingStore();
    store.docs.set(companyBillingPath(UID), company() as unknown as Record<string, unknown>);
    const calls: string[] = [];
    const result = await runStaleCompanyMaintenance({
      enabled: true,
      store,
      scanner: memoryStaleCompanyScanner(store),
      revalidate: async (input) => {
        calls.push(input.credentialFingerprint ?? "");
        assert.equal(input.reason, "stale_company_revalidation");
        return { kind: "verified", resultSummary: "ok" };
      },
      nowMs: () => NOW,
      staleAfterMs: 36 * 60 * 60 * 1000,
    });
    assert.equal(result.scanned, 1);
    assert.equal(result.attempted, 1);
    assert.equal(result.verified, 1);
    assert.deepEqual(calls, ["live-fp"]);
  }

  {
    const store = new MemoryBillingStore();
    store.docs.set(
      companyBillingPath(UID),
      company({ lastReconciledAt: NOW - 1_000 }) as unknown as Record<string, unknown>
    );
    const result = await runStaleCompanyMaintenance({
      enabled: true,
      store,
      scanner: memoryStaleCompanyScanner(store),
      revalidate: async () => {
        throw new Error("fresh company must not revalidate");
      },
      nowMs: () => NOW,
      staleAfterMs: 36 * 60 * 60 * 1000,
    });
    assert.equal(result.scanned, 0);
    assert.equal(result.attempted, 0);
  }

  {
    assert.equal(isStaleCompanyWatermark(null, NOW, 36 * 60 * 60 * 1000), true);
    assert.equal(isStaleCompanyWatermark(undefined, NOW, 36 * 60 * 60 * 1000), true);
    assert.equal(isStaleCompanyWatermark(NOW - 1_000, NOW, 36 * 60 * 60 * 1000), false);
    const merged = collectStaleCompanyRows({
      neverReconciled: [{ uid: "never", platform: "android", lastReconciledAt: null, credentialFingerprint: "fp", latestOrderId: "GPA.N", originalTransactionId: null }],
      aged: [
        { uid: "aged", platform: "android", lastReconciledAt: NOW - 48 * 60 * 60 * 1000, credentialFingerprint: "fp", latestOrderId: "GPA.A", originalTransactionId: null },
        { uid: "never", platform: "android", lastReconciledAt: NOW - 48 * 60 * 60 * 1000, credentialFingerprint: "fp", latestOrderId: "GPA.N", originalTransactionId: null },
      ],
      maxItems: 10,
    });
    assert.deepEqual(
      merged.map((r) => r.uid),
      ["never", "aged"]
    );
  }

  {
    const store = new MemoryBillingStore();
    store.docs.set(
      companyBillingPath("user-never"),
      company({ uid: "user-never", lastReconciledAt: null, latestOrderId: "GPA.NEVER" }) as unknown as Record<
        string,
        unknown
      >
    );
    const calls: string[] = [];
    const result = await runStaleCompanyMaintenance({
      enabled: true,
      store,
      scanner: memoryStaleCompanyScanner(store),
      revalidate: async (input) => {
        calls.push(input.uid);
        return { kind: "verified", resultSummary: "ok" };
      },
      nowMs: () => NOW,
      staleAfterMs: 36 * 60 * 60 * 1000,
    });
    assert.equal(result.scanned, 1);
    assert.equal(result.attempted, 1);
    assert.deepEqual(calls, ["user-never"]);
  }

  {
    const report = summarizeLedgerCommissions([
      ledger(),
      ledger({
        financialEventId: "android:purchase:GPA.STALE-2",
        actualPlatformCommissionInPaise: 1770,
        estimatedPlatformCommissionInPaise: null,
        grossAmountInPaise: 24900,
      }),
    ], "2026-09");
    assert.equal(report.eventCount, 2);
    assert.equal(report.grossKnownPaise, 9900 + 24900);
    assert.equal(report.actualCommissionKnownPaise, 1770);
    assert.equal(report.actualCommissionUnknownCount, 1);
    assert.equal(report.estimatedCommissionKnownPaise, 1485);
    assert.equal(report.estimatedCommissionUnknownCount, 1);
  }

  {
    const store = new MemoryBillingStore();
    store.docs.set(
      financialLedgerPath(sanitizeDocId("android:purchase:GPA.STALE-1")),
      ledger() as unknown as Record<string, unknown>
    );
    const month = await reportLedgerCommissionsForMonth({
      scanner: memoryLedgerMonthScanner(store),
      monthKey: "2026-09",
    });
    assert.equal(month.actualCommissionUnknownCount, 1);
    assert.equal(month.estimatedCommissionKnownPaise, 1485);
  }

  console.log("reconciliationMaintenance.unit.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
