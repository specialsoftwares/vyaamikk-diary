/**
 * Replaying one clientRecordId keeps a single cash voucher.
 * Local durability is signalled before a stalled remote create returns.
 */

import assert from "node:assert/strict";

import type { BusinessEntry } from "@/domain/businessEntry";
import type { CreateBusinessEntryInput, DiaryRepository } from "@/services/diary/types";
import { setDiaryRepositoryForTests } from "@/services/diary";
import { createEntryLocalFirst } from "@/services/diary/localFirst";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import { installMemoryLocalDatabase, uninstallMemoryLocalDatabase } from "@/localDb/testHarness";
import { sessionSyncGate } from "@/sync/sessionSyncGate";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import { __diarySyncTest } from "@/sync/syncEngine";

function cashInput(id: string): CreateBusinessEntryInput {
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
        uri: "file:///cash-paid-photos/u1/voucher.jpg",
        mimeType: "image/jpeg",
        name: "receipt.jpg",
        contentHash: "abc",
        revision: "abc",
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
  installMemoryLocalDatabase();
  sessionSyncGate.unlock();
  syncSessionOwnership.resetForTests();
  syncSessionOwnership.beginSession("u1");
  __diarySyncTest.resetFlushChain();

  const store = new Map<string, BusinessEntry>();
  let createdOutcomes = 0;
  const repo: DiaryRepository = {
    async create(userId, input) {
      return (await this.createWithOutcome(userId, input)).record;
    },
    async createWithOutcome(userId, input) {
      const id = input.clientRecordId!;
      const existing = store.get(id);
      if (existing) return { record: existing, outcome: "existing" };
      createdOutcomes += 1;
      const entry = asEntry(input, userId);
      store.set(id, entry);
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
      return [...store.values()];
    },
  };
  setDiaryRepositoryForTests(repo);

  try {
    const first = await createEntryLocalFirst("u1", cashInput("voucher-1"));
    const second = await createEntryLocalFirst("u1", cashInput("voucher-1"));
    assert.equal(first.entry.id, "voucher-1");
    assert.equal(second.entry.id, "voucher-1");
    assert.equal(store.size, 1);
    assert.equal(createdOutcomes, 1);
    assert.equal((await localEntriesRepository.getRecord("u1", "voucher-1"))?.entry.id, "voucher-1");
    assert.equal(
      store.get("voucher-1")?.attachments?.some((item) => item.id === "cash_paid_receipt"),
      true
    );

    let releaseRemote: () => void = () => undefined;
    const remoteGate = new Promise<void>((resolve) => {
      releaseRemote = resolve;
    });
    let durableBeforeRemote = false;
    let remoteStarted = false;
    const stalled = new Map<string, BusinessEntry>();
    setDiaryRepositoryForTests({
      ...repo,
      async create(userId, input) {
        return (await this.createWithOutcome(userId, input)).record;
      },
      async createWithOutcome(userId, input) {
        remoteStarted = true;
        await remoteGate;
        const id = input.clientRecordId!;
        const entry = asEntry(input, userId);
        stalled.set(id, entry);
        return { record: entry, outcome: "created" };
      },
    });

    const pending = createEntryLocalFirst("u1", cashInput("voucher-stall"), {
      onLocalDurable: () => {
        durableBeforeRemote = !remoteStarted;
      },
    });
    assert.equal(durableBeforeRemote, true);
    assert.equal(remoteStarted, false);
    for (let i = 0; i < 8 && !remoteStarted; i += 1) await Promise.resolve();
    assert.equal(remoteStarted, true);
    const local = await localEntriesRepository.getRecord("u1", "voucher-stall");
    assert.equal(local?.entry.id, "voucher-stall");
    releaseRemote();
    const finished = await pending;
    assert.equal(finished.entry.id, "voucher-stall");
    assert.equal(stalled.size, 1);

    console.log("cashVoucherReplay.test.ts ok");
  } finally {
    setDiaryRepositoryForTests(null);
    uninstallMemoryLocalDatabase();
    syncSessionOwnership.resetForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
