/**
 * SQLITE_HOST. Production local commit, then a reopened database.
 * Not a phone latency measurement and not Cloud Storage.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import type { BusinessEntry } from "@/domain/businessEntry";
import type { CreateBusinessEntryInput, DiaryRepository } from "@/services/diary/types";
import { setDiaryRepositoryForTests } from "@/services/diary";
import { createEntryLocalFirst } from "@/services/diary/localFirst";
import { p50, p95 } from "@/services/diary/saveStageTiming";
import {
  listFollowUpsSync,
  resumePendingFollowUps,
  setFollowUpRunnerForTests,
  settleFollowUpSync,
} from "@/services/diary/recordFollowUps";
import { persistDiaryUpdateIntent } from "@/repositories/diaryLocalIntent";
import { installMemoryLocalDatabase, reopenMemoryLocalDatabaseFrom, uninstallMemoryLocalDatabase } from "@/localDb/testHarness";
import { sessionSyncGate } from "@/sync/sessionSyncGate";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import { __diarySyncTest } from "@/sync/syncEngine";
import { PARTY_LEDGER_BACKFILL_PLAN } from "@/services/partyLedger/backfillPlan";
import { loadLocalPartyLedger } from "@/services/partyLedger/loadLocalPartyLedger";

function cashInput(id: string, hash = "photo-a"): CreateBusinessEntryInput {
  return {
    clientRecordId: id,
    ueid: "VYD-2026-TEST01",
    entryType: "business_cash_given",
    title: "Cash paid",
    entryDate: 1_700_000_000_000,
    source: "composer",
    attachments: [
      {
        id: "cash_paid_receipt",
        uri: `file:///cash-paid-photos/u1/${hash}.jpg`,
        mimeType: "image/jpeg",
        name: "receipt.jpg",
        contentHash: hash,
        revision: hash,
        byteSize: 32,
      },
    ],
    payload: {
      amount: 500,
      givenToName: "Ravi",
      purpose: "Labour",
      paymentDate: 1_700_000_000_000,
      paymentMode: "Cash",
      settlementStatus: "pending",
      contactMobile: null,
      businessRef: null,
      siteRef: null,
      expectedSettlementDate: null,
      remarks: null,
    },
  };
}

function asEntry(input: CreateBusinessEntryInput, userId: string): BusinessEntry {
  return {
    id: input.clientRecordId!,
    userId,
    ueid: input.ueid,
    entryType: input.entryType,
    title: input.title,
    entryDate: input.entryDate,
    notes: null,
    reminder: null,
    location: null,
    attachments: input.attachments ?? [],
    payload: input.payload,
    source: "composer",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pdfUri: null,
    documentHistory: {
      firstGeneratedAt: null,
      lastGeneratedAt: null,
      lastEditedAt: null,
      versionNumber: 1,
      editHistory: [],
      pdfGenerationHistory: [],
    },
  };
}

async function main(): Promise<void> {
  const memory = installMemoryLocalDatabase();
  sessionSyncGate.unlock();
  syncSessionOwnership.resetForTests();
  syncSessionOwnership.beginSession("u1");
  __diarySyncTest.resetFlushChain();

  const store = new Map<string, BusinessEntry>();
  let createdOutcomes = 0;
  const localMs: number[] = [];
  const remoteMs: number[] = [];
  const repo: DiaryRepository = {
    async create(userId, input) {
      return (await this.createWithOutcome(userId, input)).record;
    },
    async createWithOutcome(userId, input) {
      const started = performance.now();
      const id = input.clientRecordId!;
      const existing = store.get(id);
      if (existing) {
        remoteMs.push(performance.now() - started);
        return { record: existing, outcome: "existing" };
      }
      createdOutcomes += 1;
      const entry = asEntry(input, userId);
      store.set(id, entry);
      remoteMs.push(performance.now() - started);
      return { record: entry, outcome: "created" };
    },
    async update() {
      throw new Error("update not used");
    },
    async hardDelete() {},
    async softDelete() {},
    async getById(_userId, id) {
      return store.get(id) ?? null;
    },
    async list() {
      return [];
    },
  };
  setDiaryRepositoryForTests(repo);

  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const index = readFileSync(path.join(here, "../../../functions/src/index.ts"), "utf8");
    assert.equal(index.includes("projectPartyLedgerSource"), false);
    assert.equal(index.includes("handlePartyLedgerEvent"), false);
    assert.equal(PARTY_LEDGER_BACKFILL_PLAN.executed, false);
    assert.equal(PARTY_LEDGER_BACKFILL_PLAN.compositeIndexes.length, 0);

    const insights = readFileSync(path.join(here, "../insights/insightCoverage.ts"), "utf8");
    assert.equal(insights.includes("partyLedger"), false);

    let followUpsBeforeAck = 0;
    const startedLocal = performance.now();
    const saved = await createEntryLocalFirst("u1", cashInput("voucher-1"), {
      onLocalDurable: () => {
        localMs.push(performance.now() - startedLocal);
        followUpsBeforeAck = listFollowUpsSync("u1", "voucher-1").length;
      },
    });
    assert.equal(saved.entry.id, "voucher-1");
    assert.ok(followUpsBeforeAck >= 3, "photo, pdf, and ledger rows exist before local success returns");
    const queued = listFollowUpsSync("u1", "voucher-1");
    assert.equal(queued.find((job) => job.kind === "pdf")?.status, "pending");
    assert.equal(queued.find((job) => job.kind === "ledger_hold")?.status, "held");
    const oldPdf = queued.find((job) => job.kind === "pdf");
    assert.ok(oldPdf);

    for (let i = 0; i < 20; i += 1) {
      const t0 = performance.now();
      await createEntryLocalFirst("u1", cashInput(`voucher-sample-${i}`, `hash-${i}`), {
        onLocalDurable: () => {
          localMs.push(performance.now() - t0);
        },
      });
    }
    assert.equal(localMs.length, 21);
    assert.equal(remoteMs.length, 21);
    assert.equal(createdOutcomes, 21);

    reopenMemoryLocalDatabaseFrom(memory);
    syncSessionOwnership.beginSession("u1");
    const ran: string[] = [];
    let pdfWrites = 0;
    setFollowUpRunnerForTests(async (job) => {
      ran.push(`${job.kind}:${job.recordId}`);
      if (job.kind === "pdf") pdfWrites += 1;
    });
    const resumed = await resumePendingFollowUps("u1");
    assert.equal(resumed.blocked, false);
    assert.ok(ran.some((item) => item === "pdf:voucher-1"));
    assert.equal(store.size, 21);
    assert.equal(createdOutcomes, 21);
    const again = await resumePendingFollowUps("u1");
    assert.equal(again.resumed.length, 0);

    persistDiaryUpdateIntent("u1", {
      id: "voucher-1",
      attachments: [
        {
          id: "cash_paid_receipt",
          uri: "file:///cash-paid-photos/u1/photo-b.jpg",
          mimeType: "image/jpeg",
          name: "receipt.jpg",
          contentHash: "photo-b",
          revision: "photo-b",
          byteSize: 32,
        },
      ],
    });
    let staleApplied = false;
    const stale = settleFollowUpSync(oldPdf!, "u1", () => {
      staleApplied = true;
    });
    assert.equal(stale, "stale");
    assert.equal(staleApplied, false);
    const newer = listFollowUpsSync("u1", "voucher-1").find((job) => job.kind === "pdf");
    assert.equal(newer?.attachmentRevision, "photo-b");
    assert.equal(newer?.status, "pending");

    syncSessionOwnership.beginSession("u2");
    const foreign = await resumePendingFollowUps("u1");
    assert.equal(foreign.blocked, true);
    assert.equal(foreign.resumed.length, 0);
    const blockedApply = settleFollowUpSync(newer!, "u2", () => {
      staleApplied = true;
    });
    assert.equal(blockedApply, "session_blocked");
    assert.equal(staleApplied, false);

    const ledger = await loadLocalPartyLedger("u1");
    const ravi = ledger.parties.find((party) => party.displayName === "Ravi");
    assert.ok(ravi);
    assert.equal(ravi?.provisional, true);
    assert.ok(ravi.lines.length >= 1);
    assert.equal(ledger.serverProjectionEnabled, false);

    const report = {
      label: "SQLITE_HOST",
      device: "node-memory-sqlite",
      sampleCount: localMs.length,
      localAckMs: { p50: p50(localMs), p95: p95(localMs) },
      remoteAck: "NOT_MEASURED_FAKE_REPOSITORY",
      upload: "DEVICE_PENDING",
      pdf: "HOST_CHROMIUM_SEPARATE",
      resumedPdfWrites: pdfWrites,
      fakeRemoteSamplesIgnored: remoteMs.length,
    };
    console.log(JSON.stringify(report));
    console.log("recordFollowUps.sqliteHost.test.ts ok");
  } finally {
    setFollowUpRunnerForTests(null);
    setDiaryRepositoryForTests(null);
    uninstallMemoryLocalDatabase();
    syncSessionOwnership.resetForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
