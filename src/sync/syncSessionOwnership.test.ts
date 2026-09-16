import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { CreateBusinessEntryInput, DiaryRepository, UpdateBusinessEntryInput } from "@/services/diary/types";
import { setDiaryRepositoryForTests } from "@/services/diary";
import { createEntryLocalFirst } from "@/services/diary/localFirst";
import { persistDiaryCreateIntent } from "@/repositories/diaryLocalIntent";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import { installMemoryLocalDatabase, uninstallMemoryLocalDatabase } from "@/localDb/testHarness";
import { __diarySyncTest } from "@/sync/syncEngine";
import { sessionSyncGate } from "@/sync/sessionSyncGate";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import { applyAuthSyncIdentityTransition } from "@/sync/syncLockIdentityPolicy";
import {
  acquireSyncActivity,
  refreshSyncPendingCounts,
  resetSyncActivityLeasesForTests,
  shouldReleaseSyncActivity,
} from "@/sync/syncUiPublication";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function noteInput(id: string, title = "Site note"): CreateBusinessEntryInput {
  return {
    clientRecordId: id,
    ueid: "VYD-2026-TEST01",
    entryType: "work_update_issue",
    title,
    entryDate: 1_700_000_000_000,
    payload: {
      workDone: "poured slab",
      issueProblem: null,
      sitePlace: null,
      quantityOutput: null,
      responsiblePerson: null,
      followUpRequired: false,
    },
  };
}

function asEntry(id: string, title = "Site note", userId = "user-a"): BusinessEntry {
  const input = noteInput(id, title);
  return {
    id,
    userId,
    ueid: input.ueid,
    entryType: input.entryType,
    title: input.title,
    entryDate: input.entryDate,
    notes: null,
    reminder: null,
    location: null,
    attachments: [],
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

function mockRepo(
  store: Map<string, BusinessEntry>,
  hooks?: {
    create?: (input: CreateBusinessEntryInput) => Promise<BusinessEntry>;
    update?: (input: UpdateBusinessEntryInput) => Promise<BusinessEntry>;
  }
): DiaryRepository {
  return {
    async create(userId, input) {
      return (await this.createWithOutcome(userId, input)).record;
    },
    async createWithOutcome(userId, input) {
      const id = input.clientRecordId!;
      const had = store.has(id);
      if (hooks?.create) {
        const record = await hooks.create(input);
        return { record, outcome: had ? "existing" : "created" };
      }
      const existing = store.get(id);
      if (existing) return { record: existing, outcome: "existing" };
      const entry = { ...asEntry(id, input.title, userId), title: input.title };
      store.set(id, entry);
      return { record: entry, outcome: "created" };
    },
    async update(userId, input) {
      if (hooks?.update) return hooks.update(input);
      const cur = store.get(input.id);
      if (!cur) throw new AppError("not_found", "missing");
      const next = { ...cur, ...input, userId, updatedAt: Date.now() } as BusinessEntry;
      store.set(input.id, next);
      return next;
    },
    async hardDelete(_userId, id) {
      store.delete(id);
    },
    async softDelete(_userId, id) {
      store.delete(id);
    },
    async getById(_userId, id) {
      return store.get(id) ?? null;
    },
    async list() {
      return [...store.values()];
    },
  };
}

function signOut() {
  return applyAuthSyncIdentityTransition({
    prevStatus: "signed_in",
    nextStatus: "signed_out",
    prevUid: syncSessionOwnership.current()?.uid ?? null,
    nextUid: null,
  });
}

async function main() {
  installMemoryLocalDatabase();
  sessionSyncGate.unlock();
  syncSessionOwnership.resetForTests();
  resetSyncActivityLeasesForTests();
  __diarySyncTest.resetFlushChain();

  try {
    // I. Real production session transition A -> B while A is pending.
    const tokenA = applyAuthSyncIdentityTransition({
      prevStatus: "signed_out",
      nextStatus: "signed_in",
      prevUid: null,
      nextUid: "user-a",
    });
    assert.ok(tokenA);
    sessionSyncGate.unlock();

    const aStore = new Map<string, BusinessEntry>();
    const aEntered = deferred();
    const aGate = deferred();
    let aCreates = 0;
    let bCreates = 0;
    setDiaryRepositoryForTests(
      mockRepo(aStore, {
        create: async (input) => {
          if (input.clientRecordId === "en_sess_a1") {
            aCreates += 1;
            aEntered.resolve();
            await aGate.promise;
            throw new AppError("session_expired", "expired");
          }
          if (input.clientRecordId === "en_sess_a2") {
            aCreates += 1;
            const entry = asEntry(input.clientRecordId, input.title, "user-a");
            aStore.set(entry.id, entry);
            return entry;
          }
          bCreates += 1;
          const entry = asEntry(input.clientRecordId!, input.title, "user-b");
          aStore.set(entry.id, entry);
          return entry;
        },
      })
    );
    persistDiaryCreateIntent(asEntry("en_sess_a1", "one", "user-a"), noteInput("en_sess_a1"));
    persistDiaryCreateIntent(asEntry("en_sess_a2", "two", "user-a"), noteInput("en_sess_a2"));
    const flushA = __diarySyncTest.processQueue("user-a", tokenA);
    await aEntered.promise;

    const tokenB = applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_in",
      prevUid: "user-a",
      nextUid: "user-b",
    });
    assert.ok(tokenB);
    assert.notEqual(tokenB.generation, tokenA!.generation);
    assert.equal(sessionSyncGate.isLocked(), false);

    aGate.resolve();
    await flushA;
    assert.equal(sessionSyncGate.isLocked(), false);
    assert.equal(aCreates, 1);

    persistDiaryCreateIntent(asEntry("en_sess_b1", "bee", "user-b"), noteInput("en_sess_b1"));
    await __diarySyncTest.processQueue("user-b", tokenB);
    assert.equal(bCreates, 1);
    assert.ok(aStore.has("en_sess_b1"));
    assert.equal(sessionSyncGate.isLocked(), false);

    // J. A -> logout -> A new session has the same stale-completion protection.
    signOut();
    const tokenA2 = applyAuthSyncIdentityTransition({
      prevStatus: "signed_out",
      nextStatus: "signed_in",
      prevUid: null,
      nextUid: "user-a",
    });
    assert.ok(tokenA2);
    assert.notEqual(tokenA2.generation, tokenA!.generation);
    sessionSyncGate.unlock();

    const jEntered = deferred();
    const jGate = deferred();
    let jCreates = 0;
    setDiaryRepositoryForTests(
      mockRepo(new Map(), {
        create: async (input) => {
          jCreates += 1;
          jEntered.resolve();
          await jGate.promise;
          throw new AppError("session_expired", "expired");
        },
      })
    );
    persistDiaryCreateIntent(asEntry("en_sess_j1", "j", "user-a"), noteInput("en_sess_j1"));
    persistDiaryCreateIntent(asEntry("en_sess_j2", "j2", "user-a"), noteInput("en_sess_j2"));
    const flushOld = __diarySyncTest.processQueue("user-a", tokenA2);
    await jEntered.promise;
    signOut();
    const tokenA3 = applyAuthSyncIdentityTransition({
      prevStatus: "signed_out",
      nextStatus: "signed_in",
      prevUid: null,
      nextUid: "user-a",
    });
    assert.ok(tokenA3);
    assert.notEqual(tokenA3.generation, tokenA2.generation);
    jGate.resolve();
    await flushOld;
    assert.equal(sessionSyncGate.isLocked(), false);
    assert.equal(jCreates, 1);

    const jStore = new Map<string, BusinessEntry>();
    setDiaryRepositoryForTests(mockRepo(jStore));
    persistDiaryCreateIntent(asEntry("en_sess_j3", "ok", "user-a"), noteInput("en_sess_j3"));
    await __diarySyncTest.processQueue("user-a", tokenA3);
    assert.ok(jStore.has("en_sess_j3"));

    // K. Delayed old counts/finally cannot alter current counts or activity ownership.
    signOut();
    const countA = applyAuthSyncIdentityTransition({
      prevStatus: "signed_out",
      nextStatus: "signed_in",
      prevUid: null,
      nextUid: "user-a",
    })!;
    persistDiaryCreateIntent(asEntry("en_count_a", "a", "user-a"), noteInput("en_count_a"));
    let published: { pendingCount: number } | null = null;
    const refreshP = refreshSyncPendingCounts(countA, (c) => {
      published = c;
    });
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_in",
      prevUid: "user-a",
      nextUid: "user-b",
    });
    await refreshP;
    assert.equal(published, null);

    const leaseA = acquireSyncActivity("flush", countA);
    const countB = syncSessionOwnership.current()!;
    const leaseB = acquireSyncActivity("flush", countB);
    assert.equal(shouldReleaseSyncActivity(leaseA), false);
    assert.equal(shouldReleaseSyncActivity(leaseB), true);

    // Direct local-first auth failure after switch must not lock B.
    signOut();
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_out",
      nextStatus: "signed_in",
      prevUid: null,
      nextUid: "user-a",
    });
    const liveEntered = deferred();
    const liveGate = deferred();
    setDiaryRepositoryForTests(
      mockRepo(new Map(), {
        create: async () => {
          liveEntered.resolve();
          await liveGate.promise;
          throw new AppError("session_expired", "expired");
        },
      })
    );
    const liveCreate = createEntryLocalFirst("user-a", noteInput("en_live_a"));
    await liveEntered.promise;
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_in",
      prevUid: "user-a",
      nextUid: "user-b",
    });
    liveGate.resolve();
    const liveResult = await liveCreate;
    assert.equal(liveResult.remoteAccepted, false);
    assert.equal(sessionSyncGate.isLocked(), false);
  } finally {
    setDiaryRepositoryForTests(null);
    sessionSyncGate.unlock();
    syncSessionOwnership.resetForTests();
    resetSyncActivityLeasesForTests();
    __diarySyncTest.resetFlushChain();
    uninstallMemoryLocalDatabase();
  }

  console.log("syncSessionOwnership.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
