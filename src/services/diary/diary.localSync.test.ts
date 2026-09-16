import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { CreateBusinessEntryInput, DiaryRepository, UpdateBusinessEntryInput } from "@/services/diary/types";
import { setDiaryRepositoryForTests } from "@/services/diary";
import { createEntryLocalFirst, updateEntryLocalFirst } from "@/services/diary/localFirst";
import { localEntriesRepository, writeLocalEntryRowSync } from "@/repositories/localEntriesRepository";
import { syncQueueRepository } from "@/repositories/syncQueueRepository";
import { persistDiaryCreateIntent } from "@/repositories/diaryLocalIntent";
import { installMemoryLocalDatabase, uninstallMemoryLocalDatabase } from "@/localDb/testHarness";
import { getLocalDatabase } from "@/localDb/database";
import { openMemorySqlite } from "@/localDb/memorySqlite";
import { execStatements, migrateToV7 } from "@/localDb/migrate";
import { MIGRATIONS_V1 } from "@/localDb/schema";
import { __diarySyncTest, syncEngine } from "@/sync/syncEngine";
import { sessionSyncGate } from "@/sync/sessionSyncGate";
import { stableRecordId } from "@/services/records/stableRecordId";
import { classifyAtomicCreateError } from "@/billing/optionC/classifyCreateError";

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

function asEntry(id: string, title = "Site note"): BusinessEntry {
  const input = noteInput(id, title);
  return {
    id,
    userId: "u1",
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

function mockRepo(store: Map<string, BusinessEntry>, hooks?: {
  create?: (input: CreateBusinessEntryInput) => Promise<BusinessEntry>;
  update?: (input: UpdateBusinessEntryInput) => Promise<BusinessEntry>;
}): DiaryRepository {
  return {
    async create(userId, input) {
      if (hooks?.create) return hooks.create(input);
      const id = input.clientRecordId!;
      const existing = store.get(id);
      if (existing) return existing;
      const entry = { ...asEntry(id, input.title), userId };
      store.set(id, entry);
      return entry;
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

async function main() {
  installMemoryLocalDatabase();
  sessionSyncGate.unlock();
  __diarySyncTest.resetFlushChain();

  try {
    // C. Offline create then flush — same ID, mark synced only after accept.
    const store = new Map<string, BusinessEntry>();
    setDiaryRepositoryForTests(
      mockRepo(store, {
        create: async () => {
          throw new AppError("network", "offline");
        },
      })
    );
    const offline = await createEntryLocalFirst("u1", noteInput("en_off_1"));
    assert.equal(offline.remoteAccepted, false);
    assert.equal(offline.failureKind, "network");
    assert.equal(offline.entry.id, "en_off_1");
    const localAfterOffline = await localEntriesRepository.getRecord("u1", "en_off_1");
    assert.equal(localAfterOffline?.meta.remoteConfirmed, false);
    assert.equal(localAfterOffline?.meta.pendingOp, "create");
    assert.equal((await syncQueueRepository.listForUser("u1")).length, 1);

    setDiaryRepositoryForTests(mockRepo(store));
    const flushed = await __diarySyncTest.processQueue("u1");
    assert.equal(flushed.synced, 1);
    assert.ok(store.has("en_off_1"));
    const afterFlush = await localEntriesRepository.getRecord("u1", "en_off_1");
    assert.equal(afterFlush?.meta.remoteConfirmed, true);
    assert.equal(afterFlush?.meta.syncStatus, "synced");

    // D. Quota exhausted — retain local, no session lock, no auto retry.
    sessionSyncGate.unlock();
    setDiaryRepositoryForTests(
      mockRepo(new Map(), {
        create: async () => {
          throw new AppError("quota_exhausted", "Monthly record limit reached.");
        },
      })
    );
    const quota = await createEntryLocalFirst("u1", noteInput("en_quota_1"));
    assert.equal(quota.remoteAccepted, false);
    assert.equal(quota.failureKind, "quota_exhausted");
    assert.equal(sessionSyncGate.isLocked(), false);
    const quotaRow = await localEntriesRepository.getRecord("u1", "en_quota_1");
    assert.equal(quotaRow?.entry.title, "Site note");
    assert.equal(quotaRow?.meta.autoRetry, false);
    assert.equal(quotaRow?.meta.syncErrorCode, "quota_exhausted");
    const quotaQueue = (await syncQueueRepository.listForUser("u1")).filter((q) => q.entityId === "en_quota_1");
    assert.equal(quotaQueue.length, 0);
    const autoFlush = await __diarySyncTest.processQueue("u1");
    assert.equal(autoFlush.synced, 0);

    // Quota-blocked item must not prevent unrelated permissible work.
    const otherStore = new Map<string, BusinessEntry>();
    setDiaryRepositoryForTests(mockRepo(otherStore));
    persistDiaryCreateIntent(asEntry("en_unrelated"), noteInput("en_unrelated"));
    const unrelatedFlush = await __diarySyncTest.processQueue("u1");
    assert.equal(unrelatedFlush.synced, 1);
    assert.ok(otherStore.has("en_unrelated"));
    assert.equal((await localEntriesRepository.getRecord("u1", "en_quota_1"))?.meta.autoRetry, false);
    assert.equal((await localEntriesRepository.getRecord("u1", "en_quota_1"))?.meta.remoteConfirmed, false);

    // E. Restart: durable state survives re-read.
    const restarted = await localEntriesRepository.getRecord("u1", "en_quota_1");
    assert.equal(restarted?.meta.pendingOp, "create");
    assert.equal(restarted?.entry.id, "en_quota_1");

    // F. Explicit retry after availability.
    const retryStore = new Map<string, BusinessEntry>();
    setDiaryRepositoryForTests(mockRepo(retryStore));
    await syncEngine.retryUnsyncedEntry("u1", "en_quota_1");
    await __diarySyncTest.processQueue("u1");
    assert.ok(retryStore.has("en_quota_1"));
    const afterRetry = await localEntriesRepository.getRecord("u1", "en_quota_1");
    assert.equal(afterRetry?.meta.remoteConfirmed, true);

    // G. Ambiguous response: server has record, local ack lost, replay does not duplicate.
    const gStore = new Map<string, BusinessEntry>([["en_amb", asEntry("en_amb")]]);
    let createCalls = 0;
    setDiaryRepositoryForTests(
      mockRepo(gStore, {
        create: async (input) => {
          createCalls += 1;
          return gStore.get(input.clientRecordId!)!;
        },
      })
    );
    persistDiaryCreateIntent(asEntry("en_amb"), noteInput("en_amb"));
    await __diarySyncTest.processQueue("u1");
    assert.equal(createCalls, 1);
    assert.equal(gStore.size, 1);
    const gRow = await localEntriesRepository.getRecord("u1", "en_amb");
    assert.equal(gRow?.meta.remoteConfirmed, true);

    // H. Missing queue, non-local_ id reconstructs CREATE.
    const hStore = new Map<string, BusinessEntry>();
    setDiaryRepositoryForTests(mockRepo(hStore));
    persistDiaryCreateIntent(asEntry("en_recon"), noteInput("en_recon"));
    await syncQueueRepository.removeForEntity("u1", "entry", "en_recon");
    await __diarySyncTest.ensurePendingQueued("u1");
    const reconstructed = (await syncQueueRepository.listForUser("u1")).find((q) => q.entityId === "en_recon");
    assert.equal(reconstructed?.op, "create");
    assert.equal((reconstructed?.payload as CreateBusinessEntryInput).clientRecordId, "en_recon");
    await __diarySyncTest.processQueue("u1");
    assert.ok(hStore.has("en_recon"));

    // I. local_ identity is reused as the cloud id.
    const iStore = new Map<string, BusinessEntry>();
    let seenId: string | undefined;
    setDiaryRepositoryForTests(
      mockRepo(iStore, {
        create: async (input) => {
          seenId = input.clientRecordId;
          const entry = asEntry(input.clientRecordId!, input.title);
          iStore.set(entry.id, entry);
          return entry;
        },
      })
    );
    persistDiaryCreateIntent(asEntry("local_legacy_1"), noteInput("local_legacy_1"));
    await __diarySyncTest.processQueue("u1");
    assert.equal(seenId, "local_legacy_1");
    assert.ok(iStore.has("local_legacy_1"));

    // J. Edit while pending CREATE keeps latest content and same id.
    const jStore = new Map<string, BusinessEntry>();
    setDiaryRepositoryForTests(
      mockRepo(jStore, {
        create: async () => {
          throw new AppError("network", "offline");
        },
      })
    );
    await createEntryLocalFirst("u1", noteInput("en_edit", "First title"));
    await updateEntryLocalFirst("u1", { id: "en_edit", title: "Edited title" });
    const edited = await localEntriesRepository.getRecord("u1", "en_edit");
    assert.equal(edited?.entry.title, "Edited title");
    assert.equal(edited?.meta.pendingOp, "create");
    const queued = (await syncQueueRepository.listForUser("u1")).find((q) => q.entityId === "en_edit");
    assert.equal(queued?.op, "create");
    assert.equal((queued?.payload as CreateBusinessEntryInput).title, "Edited title");

    setDiaryRepositoryForTests(mockRepo(jStore));
    const jFlush = await __diarySyncTest.processQueue("u1");
    assert.equal(jFlush.synced, 1);
    assert.equal(jStore.get("en_edit")?.title, "Edited title");
    const jRow = await localEntriesRepository.getRecord("u1", "en_edit");
    assert.equal(jRow?.meta.remoteConfirmed, true);
    assert.equal(jRow?.entry.title, "Edited title");

    // L. Generic permission vs auth vs network.
    sessionSyncGate.unlock();
    setDiaryRepositoryForTests(
      mockRepo(new Map(), {
        create: async () => {
          throw new AppError("permission_denied", "denied");
        },
      })
    );
    const perm = await createEntryLocalFirst("u1", noteInput("en_perm"));
    assert.equal(perm.failureKind, "permission_denied");
    assert.equal(sessionSyncGate.isLocked(), false);
    const permRow = await localEntriesRepository.getRecord("u1", "en_perm");
    assert.equal(permRow?.meta.autoRetry, false);

    setDiaryRepositoryForTests(
      mockRepo(new Map(), {
        create: async () => {
          throw new AppError("session_expired", "expired");
        },
      })
    );
    const auth = await createEntryLocalFirst("u1", noteInput("en_auth"));
    assert.equal(auth.failureKind, "unauthenticated");
    assert.equal(sessionSyncGate.isLocked(), true);
    sessionSyncGate.unlock();

    setDiaryRepositoryForTests(
      mockRepo(new Map(), {
        create: async () => {
          throw new AppError("quota_state_invalid", "Usage state is unreadable.");
        },
      })
    );
    const invalid = await createEntryLocalFirst("u1", noteInput("en_invalid"));
    assert.equal(invalid.failureKind, "quota_state_invalid");
    assert.equal(sessionSyncGate.isLocked(), false);
    assert.equal((await localEntriesRepository.getRecord("u1", "en_invalid"))?.entry.title, "Site note");
    assert.equal((await localEntriesRepository.getRecord("u1", "en_invalid"))?.meta.autoRetry, false);
    assert.equal(classifyAtomicCreateError(new AppError("quota_state_invalid", "bad")), "quota_state_invalid");

    // M. Account switch during delayed flush — no cross-user mutation.
    const aStore = new Map<string, BusinessEntry>();
    let releaseCreate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    setDiaryRepositoryForTests(
      mockRepo(aStore, {
        create: async (input) => {
          await gate;
          const entry = asEntry(input.clientRecordId!, input.title);
          entry.userId = "user-a";
          aStore.set(entry.id, entry);
          return entry;
        },
      })
    );
    persistDiaryCreateIntent({ ...asEntry("en_a"), userId: "user-a" }, noteInput("en_a"));
    persistDiaryCreateIntent({ ...asEntry("en_b"), userId: "user-b" }, noteInput("en_b"));
    const flushA = __diarySyncTest.processQueue("user-a");
    releaseCreate();
    await flushA;
    const bRow = await localEntriesRepository.getRecord("user-b", "en_b");
    assert.equal(bRow?.meta.remoteConfirmed, false);
    assert.equal(aStore.has("en_b"), false);
    assert.ok(aStore.has("en_a"));

    // N. Identical-looking separate entries both survive heuristic purge.
    persistDiaryCreateIntent(asEntry("local_twin_1", "Same title"), noteInput("local_twin_1", "Same title"));
    persistDiaryCreateIntent(asEntry("local_twin_2", "Same title"), noteInput("local_twin_2", "Same title"));
    await localEntriesRepository.markSynced(asEntry("cloud_same", "Same title"));
    await __diarySyncTest.purgeSupersededLocalPlaceholders("u1");
    assert.ok(await localEntriesRepository.getById("u1", "local_twin_1"));
    assert.ok(await localEntriesRepository.getById("u1", "local_twin_2"));
    persistDiaryCreateIntent(asEntry("en_ident_1", "Same title"), noteInput("en_ident_1", "Same title"));
    persistDiaryCreateIntent(asEntry("en_ident_2", "Same title"), noteInput("en_ident_2", "Same title"));
    await __diarySyncTest.purgeSupersededLocalPlaceholders("u1");
    assert.ok(await localEntriesRepository.getById("u1", "en_ident_1"));
    assert.ok(await localEntriesRepository.getById("u1", "en_ident_2"));

    // Crash between local row + queue write rolls both back.
    const db = getLocalDatabase();
    try {
      db.withTransactionSync(() => {
        persistDiaryCreateIntent(asEntry("en_crash"), noteInput("en_crash"));
        throw new Error("simulated crash");
      });
    } catch (e) {
      assert.equal((e as Error).message, "simulated crash");
    }
    assert.equal(await localEntriesRepository.getById("u1", "en_crash"), null);
    assert.equal(
      (await syncQueueRepository.listForUser("u1")).some((q) => q.entityId === "en_crash"),
      false
    );

    // Ambiguous legacy pending non-local_ id reconstructs CREATE with the same id.
    writeLocalEntryRowSync(
      asEntry("en_legacy_amb"),
      {
        syncStatus: "pending",
        pendingOp: null,
        remoteConfirmed: false,
        syncErrorCode: null,
        autoRetry: true,
      },
      null
    );
    await __diarySyncTest.ensurePendingQueued("u1");
    const ambQueued = (await syncQueueRepository.listForUser("u1")).find((q) => q.entityId === "en_legacy_amb");
    assert.equal(ambQueued?.op, "create");
    assert.equal((ambQueued?.payload as CreateBusinessEntryInput).clientRecordId, "en_legacy_amb");

    // V7 migration retains existing rows and queue data.
    const migrated = openMemorySqlite();
    execStatements(migrated as unknown as Parameters<typeof execStatements>[0], MIGRATIONS_V1, "v1");
    migrated.runSync(
      `INSERT INTO entries_local (id, user_id, payload_json, sync_status, local_updated_at, remote_updated_at, version_number)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["keep_1", "u1", JSON.stringify(asEntry("keep_1")), "pending", 1, null, 1]
    );
    migrated.runSync(
      `INSERT INTO sync_queue (id, user_id, op, entity, entity_id, payload_json, created_at, attempts, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
      ["sync_keep", "u1", "create", "entry", "keep_1", JSON.stringify(noteInput("keep_1")), 1]
    );
    migrateToV7(migrated as unknown as Parameters<typeof migrateToV7>[0]);
    const kept = migrated.getFirstSync<{ id: string; payload_json: string }>(
      "SELECT id, payload_json FROM entries_local WHERE id = ?",
      ["keep_1"]
    );
    assert.equal(kept?.id, "keep_1");
    assert.ok(kept?.payload_json.includes("keep_1"));
    const keptQueue = migrated.getFirstSync<{ entity_id: string }>(
      "SELECT entity_id FROM sync_queue WHERE id = ?",
      ["sync_keep"]
    );
    assert.equal(keptQueue?.entity_id, "keep_1");

    // O. Local persistence is not remote confirmation.
    assert.equal((await localEntriesRepository.getRecord("u1", "en_off_1"))?.meta.remoteConfirmed, true);
    assert.equal(offline.remoteAccepted, false);

    // Identity is resolved once (stableRecordId).
    assert.equal(stableRecordId("en_off_1", "en"), "en_off_1");
    const generated = stableRecordId(undefined, "en");
    assert.match(generated, /^en_/);
  } finally {
    setDiaryRepositoryForTests(null);
    sessionSyncGate.unlock();
    __diarySyncTest.resetFlushChain();
    uninstallMemoryLocalDatabase();
  }

  console.log("diary.localSync.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
