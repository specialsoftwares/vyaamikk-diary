/**
 * VYD-39 maintenance (stale company) and ledger commission reporting.
 */
import assert from "node:assert/strict";

import { companyBillingPath, financialLedgerPath, sanitizeDocId } from "./paths";
import {
  collectStaleCompanyRows,
  isStaleCompanyWatermark,
  memoryStaleCompanyScanner,
  recordMaintenanceBackoff,
  runStaleCompanyMaintenance,
  MAINTENANCE_BACKOFF_MS,
} from "./reconciliationMaintenance";
import {
  summarizeLedgerCommissions,
  reportLedgerCommissionsForMonth,
  persistRevenueReport,
  memoryLedgerMonthScanner,
} from "./reconciliationReporting";
import { MemoryBillingStore } from "./store";
import type { BillingEventLedgerDoc, CompanyBillingDoc } from "./types";
import type { StoreRevalidateOutcome } from "./reconciliationConsumer";

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
    assert.equal(month.complete, true);
    assert.equal(month.sampleTruncated, false);
    assert.equal(month.persisted, false);
  }

  {
    const store = new MemoryBillingStore();
    store.docs.set(
      companyBillingPath("acct-a"),
      company({ uid: "acct-a", latestOrderId: "GPA.A" }) as unknown as Record<string, unknown>
    );
    store.docs.set(
      companyBillingPath("acct-b"),
      company({ uid: "acct-b", latestOrderId: "GPA.B", credentialFingerprint: "fp-b" }) as unknown as Record<
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
        if (input.uid === "acct-a") throw new Error("decrypt failed");
        return { kind: "verified", resultSummary: "ok" };
      },
      nowMs: () => NOW,
    });
    assert.equal(result.failed, 1);
    assert.equal(result.verified, 1);
    assert.deepEqual(calls.sort(), ["acct-a", "acct-b"]);
  }

  {
    const store = new MemoryBillingStore();
    for (let i = 0; i < 11; i++) {
      const uid = `never-${String(i).padStart(2, "0")}`;
      store.docs.set(
        companyBillingPath(uid),
        company({
          uid,
          lastReconciledAt: null,
          latestOrderId: `GPA.N${i}`,
          credentialFingerprint: `fp-n${i}`,
        }) as unknown as Record<string, unknown>
      );
    }
    const first: string[] = [];
    await runStaleCompanyMaintenance({
      enabled: true,
      store,
      scanner: memoryStaleCompanyScanner(store),
      revalidate: async (input) => {
        first.push(input.uid);
        return { kind: "terminal", resultSummary: "dead", causeCode: "gone" };
      },
      nowMs: () => NOW,
      maxItems: 10,
      leaseOwner: "tick-1",
      useDocumentIdScan: true,
      scanPageSize: 5,
    });
    assert.equal(first.length, 10);
    const second: string[] = [];
    await runStaleCompanyMaintenance({
      enabled: true,
      store,
      scanner: memoryStaleCompanyScanner(store),
      revalidate: async (input) => {
        second.push(input.uid);
        return { kind: "verified", resultSummary: "ok" };
      },
      nowMs: () => NOW,
      maxItems: 10,
      leaseOwner: "tick-2",
      useDocumentIdScan: true,
      scanPageSize: 5,
    });
    assert.ok(second.includes("never-10"), `later account visited on tick 2, got ${second.join(",")}`);
    assert.equal(second.includes("never-00"), false);
  }

  {
    const store = new MemoryBillingStore();
    const omitted: Record<string, unknown> = { ...company({ uid: "omit-1", latestOrderId: "GPA.OMIT" }) };
    delete omitted.lastReconciledAt;
    store.docs.set(companyBillingPath("omit-1"), omitted);
    store.docs.set(
      companyBillingPath("fresh-1"),
      company({ uid: "fresh-1", lastReconciledAt: NOW - 1_000, latestOrderId: "GPA.FRESH" }) as unknown as Record<
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
      leaseOwner: "omit-tick",
      useDocumentIdScan: true,
    });
    assert.deepEqual(calls, ["omit-1"]);
    assert.equal(result.attempted, 1);
  }

  {
    const store = new MemoryBillingStore();
    store.docs.set(
      companyBillingPath(UID),
      company() as unknown as Record<string, unknown>
    );
    let release!: (value: StoreRevalidateOutcome) => void;
    const hold = new Promise<StoreRevalidateOutcome>((resolve) => {
      release = resolve;
    });
    const first = runStaleCompanyMaintenance({
      enabled: true,
      store,
      scanner: memoryStaleCompanyScanner(store),
      revalidate: async () => hold,
      nowMs: () => NOW,
      leaseOwner: "owner-live",
      useDocumentIdScan: true,
    });
    for (let i = 0; i < 40; i++) {
      const lease = store.docs.get("_billingOps/staleMaintenanceLease");
      if (lease && lease.owner === "owner-live") break;
      await new Promise((r) => setImmediate(r));
    }
    const overlapping = await runStaleCompanyMaintenance({
      enabled: true,
      store,
      scanner: memoryStaleCompanyScanner(store),
      revalidate: async () => {
        throw new Error("overlapping tick must not revalidate");
      },
      nowMs: () => NOW,
      leaseOwner: "owner-other",
      useDocumentIdScan: true,
    });
    assert.equal(overlapping.overlappingSkipped, true);
    assert.equal(overlapping.attempted, 0);
    release({ kind: "pending", resultSummary: "held" });
    const finished = await first;
    assert.equal(finished.overlappingSkipped, false);
  }

  {
    const store = new MemoryBillingStore();
    for (let i = 0; i < 201; i++) {
      const id = `android:purchase:GPA.PAGE-${String(i).padStart(3, "0")}`;
      store.docs.set(
        financialLedgerPath(sanitizeDocId(id)),
        ledger({
          financialEventId: id,
          grossAmountInPaise: 100,
          actualPlatformCommissionInPaise: i === 0 ? null : 15,
          estimatedPlatformCommissionInPaise: 15,
        }) as unknown as Record<string, unknown>
      );
    }
    store.docs.set(
      financialLedgerPath(sanitizeDocId("android:purchase:GPA.OTHER-MONTH")),
      ledger({
        financialEventId: "android:purchase:GPA.OTHER-MONTH",
        monthKey: "2026-08",
        grossAmountInPaise: 9999,
      }) as unknown as Record<string, unknown>
    );
    store.docs.set(
      financialLedgerPath(sanitizeDocId("android:refund:GPA.PAGE-000")),
      ledger({
        financialEventId: "android:refund:GPA.PAGE-000",
        eventType: "refund",
        relatedFinancialEventId: "android:purchase:GPA.PAGE-000",
        grossAmountInPaise: 100,
        actualPlatformCommissionInPaise: 0,
        estimatedPlatformCommissionInPaise: 0,
      }) as unknown as Record<string, unknown>
    );
    const month = await reportLedgerCommissionsForMonth({
      scanner: memoryLedgerMonthScanner(store),
      monthKey: "2026-09",
      pageSize: 50,
      persistTo: store,
      nowMs: () => NOW,
    });
    assert.equal(month.eventCount, 202);
    assert.equal(month.complete, true);
    assert.equal(month.sampleTruncated, false);
    assert.equal(month.persisted, true);
    assert.equal(month.actualCommissionUnknownCount, 1);
    assert.equal(month.refundsKnownPaise, 100);
    assert.equal(month.grossKnownPaise, 201 * 100);
    const persisted = store.docs.get("_revenueReports/2026-09") as {
      financialEventCount?: number;
      netRevenueEstimateInPaise?: number | null;
      grossRevenueInPaise?: number;
      refundsInPaise?: number;
      scanStartedAt?: number;
      ledgerHighWatermark?: number;
    };
    assert.equal(persisted.financialEventCount, 202);
    assert.equal(persisted.netRevenueEstimateInPaise, null);
    assert.equal(persisted.grossRevenueInPaise, 201 * 100);
    assert.equal(persisted.refundsInPaise, 100);
    assert.equal(persisted.scanStartedAt, NOW);
    const again = await reportLedgerCommissionsForMonth({
      scanner: memoryLedgerMonthScanner(store),
      monthKey: "2026-09",
      persistTo: store,
      nowMs: () => NOW,
    });
    assert.equal(again.eventCount, 202);
    const other = await reportLedgerCommissionsForMonth({
      scanner: memoryLedgerMonthScanner(store),
      monthKey: "2026-08",
    });
    assert.equal(other.eventCount, 1);
  }

  {
    const report = summarizeLedgerCommissions(
      [
        ledger({
          financialEventId: "android:purchase:GPA.GROSS-1",
          eventType: "purchase",
          grossAmountInPaise: 20000,
          actualPlatformCommissionInPaise: 3000,
          estimatedPlatformCommissionInPaise: 3000,
        }),
        ledger({
          financialEventId: "android:refund:GPA.GROSS-1",
          eventType: "refund",
          relatedFinancialEventId: "android:purchase:GPA.GROSS-1",
          grossAmountInPaise: 20000,
          actualPlatformCommissionInPaise: 3000,
          estimatedPlatformCommissionInPaise: 3000,
        }),
      ],
      "2026-09",
      { complete: true, scanStartedAt: NOW }
    );
    assert.equal(report.grossKnownPaise, 20000);
    assert.equal(report.refundsKnownPaise, 20000);
    assert.equal(report.actualCommissionKnownPaise, 3000);
    const store = new MemoryBillingStore();
    const persisted = await persistRevenueReport({ store, report, nowMs: NOW });
    assert.equal(persisted, true);
    const doc = store.docs.get("_revenueReports/2026-09") as {
      grossRevenueInPaise?: number;
      refundsInPaise?: number;
    };
    assert.equal(doc.grossRevenueInPaise, 20000);
    assert.equal(doc.refundsInPaise, 20000);
  }

  {
    const report = summarizeLedgerCommissions(
      [
        ledger({
          financialEventId: "android:renewal:GPA.REN-1",
          eventType: "renewal",
          grossAmountInPaise: 24900,
          actualPlatformCommissionInPaise: 3700,
          estimatedPlatformCommissionInPaise: 3700,
        }),
        ledger({
          financialEventId: "android:chargeback:GPA.REN-1",
          eventType: "chargeback",
          relatedFinancialEventId: "android:renewal:GPA.REN-1",
          grossAmountInPaise: 24900,
          actualPlatformCommissionInPaise: null,
          estimatedPlatformCommissionInPaise: null,
        }),
        ledger({
          financialEventId: "android:purchase:GPA.UNK-1",
          eventType: "purchase",
          grossAmountInPaise: null as unknown as number,
          actualPlatformCommissionInPaise: null,
          estimatedPlatformCommissionInPaise: null,
        }),
      ],
      "2026-09",
      { complete: true, scanStartedAt: NOW }
    );
    assert.equal(report.grossKnownPaise, 24900);
    assert.equal(report.grossUnknownCount, 1);
    assert.equal(report.refundsKnownPaise, 24900);
    assert.equal(report.actualCommissionUnknownCount, 1);
    assert.equal(report.estimatedCommissionUnknownCount, 1);
    assert.equal(report.estimatedCommissionKnownPaise, 3700);
    const store = new MemoryBillingStore();
    assert.equal(await persistRevenueReport({ store, report, nowMs: NOW }), true);
    const doc = store.docs.get("_revenueReports/2026-09") as {
      grossRevenueInPaise?: number;
      refundsInPaise?: number;
      grossUnknownCount?: number;
      actualCommissionUnknownCount?: number;
      estimatedPlatformCommissionInPaise?: number;
      netRevenueEstimateInPaise?: number | null;
    };
    assert.equal(doc.grossRevenueInPaise, 24900);
    assert.equal(doc.refundsInPaise, 24900);
    assert.equal(doc.grossUnknownCount, 1);
    assert.equal(doc.actualCommissionUnknownCount, 1);
    assert.equal(doc.estimatedPlatformCommissionInPaise, 3700);
    assert.equal(doc.netRevenueEstimateInPaise, null);
    const again = await persistRevenueReport({ store, report, nowMs: NOW + 5 });
    assert.equal(again, true);
    assert.equal(
      (store.docs.get("_revenueReports/2026-09") as { generatedAt?: number }).generatedAt,
      NOW + 5
    );
  }

  {
    const store = new MemoryBillingStore();
    const newer = summarizeLedgerCommissions(
      [ledger({ recordedAt: 2000, grossAmountInPaise: 500 })],
      "2026-09",
      { complete: true, scanStartedAt: 2000 }
    );
    assert.equal(await persistRevenueReport({ store, report: newer, nowMs: 2000 }), true);
    const delayed = summarizeLedgerCommissions(
      [ledger({ recordedAt: 1000, grossAmountInPaise: 1 })],
      "2026-09",
      { complete: true, scanStartedAt: 1000 }
    );
    assert.equal(await persistRevenueReport({ store, report: delayed, nowMs: 1000 }), false);
    const kept = store.docs.get("_revenueReports/2026-09") as {
      scanStartedAt?: number;
      grossRevenueInPaise?: number;
      ledgerHighWatermark?: number;
    };
    assert.equal(kept.scanStartedAt, 2000);
    assert.equal(kept.grossRevenueInPaise, 500);
    assert.equal(kept.ledgerHighWatermark, 2000);
    const incomplete = summarizeLedgerCommissions([ledger()], "2026-09", {
      complete: false,
      scanStartedAt: 3000,
    });
    assert.equal(await persistRevenueReport({ store, report: incomplete, nowMs: 3000 }), false);
  }

  {
    const store = new MemoryBillingStore();
    store.docs.set(
      financialLedgerPath(sanitizeDocId("android:purchase:GPA.P1")),
      ledger({
        financialEventId: "android:purchase:GPA.P1",
        recordedAt: 10,
      }) as unknown as Record<string, unknown>
    );
    let pages = 0;
    const scanner = {
      async listForMonth() {
        return [];
      },
      async listForMonthPage(_monthKey: string, _pageSize: number, afterId: string | null) {
        pages += 1;
        if (pages === 1) {
          return {
            rows: [ledger({ financialEventId: "android:purchase:GPA.P1", recordedAt: 10 })],
            lastId: "android:purchase:GPA.P1",
            exhausted: false,
          };
        }
        store.docs.set(
          financialLedgerPath(sanitizeDocId("android:purchase:GPA.P2")),
          ledger({
            financialEventId: "android:purchase:GPA.P2",
            recordedAt: 99,
            grossAmountInPaise: 50,
          }) as unknown as Record<string, unknown>
        );
        return {
          rows: [
            ledger({
              financialEventId: "android:purchase:GPA.P2",
              recordedAt: 99,
              grossAmountInPaise: 50,
            }),
          ],
          lastId: afterId === "android:purchase:GPA.P1" ? "android:purchase:GPA.P2" : "android:purchase:GPA.P2",
          exhausted: true,
        };
      },
    };
    const month = await reportLedgerCommissionsForMonth({
      scanner,
      monthKey: "2026-09",
      pageSize: 1,
      persistTo: store,
      nowMs: () => NOW,
    });
    assert.equal(month.complete, true);
    assert.equal(month.eventCount, 2);
    assert.equal(month.ledgerHighWatermark, 99);
    assert.equal(month.persisted, true);
  }

  {
    const store = new MemoryBillingStore();
    store.docs.set(
      companyBillingPath(UID),
      company() as unknown as Record<string, unknown>
    );
    let now = NOW;
    await runStaleCompanyMaintenance({
      enabled: true,
      store,
      scanner: memoryStaleCompanyScanner(store),
      revalidate: async () => {
        now = NOW + 22_000;
        return { kind: "pending", resultSummary: "held" };
      },
      nowMs: () => now,
      leaseOwner: "tick-new",
      useDocumentIdScan: true,
    });
    const newer = store.docs.get(`_billingMaintenanceSchedule/${UID}`) as {
      lastAttemptAt?: number;
      lastOutcome?: string;
      nextEligibleAt?: number;
    };
    assert.equal(newer.lastAttemptAt, NOW + 22_000);
    assert.equal(newer.lastOutcome, "pending");
    assert.equal(newer.nextEligibleAt, NOW + 22_000 + MAINTENANCE_BACKOFF_MS);
    const retired = await recordMaintenanceBackoff({
      store,
      uid: UID,
      nowMs: NOW,
      outcome: "pending",
      leaseOwner: "tick-old",
      leaseNowMs: () => NOW + 22_000,
    });
    assert.equal(retired, false);
    const still = store.docs.get(`_billingMaintenanceSchedule/${UID}`) as {
      lastAttemptAt?: number;
      lastOutcome?: string;
    };
    assert.equal(still.lastAttemptAt, NOW + 22_000);
    assert.equal(still.lastOutcome, "pending");
    const staleClock = await recordMaintenanceBackoff({
      store,
      uid: UID,
      nowMs: NOW,
      outcome: "isolated_failure",
      leaseOwner: "tick-new",
      leaseNowMs: () => NOW + 22_000,
    });
    assert.equal(staleClock, false);
    store.docs.set("_billingOps/staleMaintenanceLease", {
      owner: "tick-held",
      expiresAt: NOW + 120_000,
      scanCursor: null,
    });
    const monotonic = await recordMaintenanceBackoff({
      store,
      uid: UID,
      nowMs: NOW,
      outcome: "pending",
      leaseOwner: "tick-held",
      leaseNowMs: () => NOW + 22_000,
    });
    assert.equal(monotonic, false);
    store.docs.set("_billingOps/staleMaintenanceLease", {
      owner: "tick-old",
      expiresAt: NOW - 1,
      scanCursor: null,
    });
    const expired = await recordMaintenanceBackoff({
      store,
      uid: UID,
      nowMs: NOW,
      outcome: "pending",
      leaseOwner: "tick-old",
      leaseNowMs: () => NOW + 22_000,
    });
    assert.equal(expired, false);
    const keptSchedule = store.docs.get(`_billingMaintenanceSchedule/${UID}`) as {
      lastAttemptAt?: number;
      lastOutcome?: string;
    };
    assert.equal(keptSchedule.lastAttemptAt, NOW + 22_000);
    assert.equal(keptSchedule.lastOutcome, "pending");
  }

  {
    const store = new MemoryBillingStore();
    store.docs.set(
      companyBillingPath(UID),
      company() as unknown as Record<string, unknown>
    );
    let oldNow = NOW;
    let releaseOld!: (value: StoreRevalidateOutcome) => void;
    const oldHold = new Promise<StoreRevalidateOutcome>((resolve) => {
      releaseOld = resolve;
    });
    const oldRun = runStaleCompanyMaintenance({
      enabled: true,
      store,
      scanner: memoryStaleCompanyScanner(store),
      revalidate: async () => oldHold,
      nowMs: () => oldNow,
      leaseOwner: "tick-old",
      useDocumentIdScan: true,
    });
    for (let i = 0; i < 40; i++) {
      const lease = store.docs.get("_billingOps/staleMaintenanceLease");
      if (lease && lease.owner === "tick-old") break;
      await new Promise((r) => setImmediate(r));
    }
    assert.equal(store.docs.get("_billingOps/staleMaintenanceLease")?.owner, "tick-old");
    const newNow = NOW + 122_000;
    const takeover = await runStaleCompanyMaintenance({
      enabled: true,
      store,
      scanner: memoryStaleCompanyScanner(store),
      revalidate: async () => ({ kind: "terminal", resultSummary: "dead", causeCode: "gone" }),
      nowMs: () => newNow,
      leaseOwner: "tick-new",
      useDocumentIdScan: true,
    });
    assert.equal(takeover.attempted, 1);
    const afterNew = store.docs.get(`_billingMaintenanceSchedule/${UID}`) as {
      lastAttemptAt?: number;
      lastOutcome?: string;
      nextEligibleAt?: number;
    };
    assert.equal(afterNew.lastAttemptAt, NOW + 122_000);
    assert.equal(afterNew.lastOutcome, "terminal");
    const cursorAfterNew = store.docs.get("_billingOps/staleMaintenanceLease")?.scanCursor ?? null;
    releaseOld({ kind: "pending", resultSummary: "held" });
    const oldFinished = await oldRun;
    assert.equal(oldFinished.pending, 1);
    const afterOld = store.docs.get(`_billingMaintenanceSchedule/${UID}`) as {
      lastAttemptAt?: number;
      lastOutcome?: string;
    };
    assert.equal(afterOld.lastAttemptAt, NOW + 122_000);
    assert.equal(afterOld.lastOutcome, "terminal");
    assert.equal(store.docs.get("_billingOps/staleMaintenanceLease")?.scanCursor ?? null, cursorAfterNew);
  }

  console.log("reconciliationMaintenance.unit.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
