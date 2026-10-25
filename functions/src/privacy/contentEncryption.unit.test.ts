import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  assertContentBinding,
  classifyStoredRecord,
  loadContentKey,
  migrateContentKeyBatch,
  openContent,
  openStoredContent,
  executeKeyRetirement,
  keyRetirementAllowed,
  planContentKeyMigration,
  resumeKeyMigrationCheckpoint,
  rowsFromInclusiveCursor,
  runOwnedMigration,
  sealMatchesSourcePath,
  createMemoryMigrationCheckpointStore,
  sealContent,
  sealContentV2,
  CONTENT_MIGRATION_UNCOVERED,
  type ContentSeal,
} from "./contentEncryption";
import { coverageEvidence, deletionDeadlinePopulations } from "./coverageRequirements";
import { boundaryFor } from "./privateFieldCoverage";

const key = randomBytes(32);
const title = "Warehouse gate replacement";

function bind(revision = 7) {
  return {
    key,
    uid: "owner-a",
    collection: "entries",
    recordId: "rec-1",
    revision,
    purpose: "diary",
  };
}

function clientA(): ContentSeal {
  return sealContent({ ...bind(), plaintext: Buffer.from(title, "utf8") });
}

function clientB(seal: ContentSeal, overrides: Partial<ReturnType<typeof bind>> = {}): string {
  return openContent({ ...bind(), ...overrides, seal }).toString("utf8");
}

const sealed = clientA();
assert.equal(clientB(sealed), title);
assert.equal(sealed.ciphertext.includes(Buffer.from(title).toString("base64")), false);
assert.equal(JSON.stringify(sealed).includes(title), false);

assert.throws(() => clientB(sealed, { uid: "owner-b" }), /wrong_owner/);
assert.throws(() => clientB(sealed, { revision: 8 }), /stale_revision/);
const tampered = { ...sealed, ciphertext: Buffer.from("tampered-bytes").toString("base64") };
assert.throws(() => clientB(tampered), /content_tampered/);
assert.throws(() => loadContentKey({} as NodeJS.ProcessEnv), /content_key_unavailable/);
assert.throws(() => loadContentKey({ CONTENT_DATA_KEY: key.toString("base64") + "!" }), /content_key_unavailable/);
for (const size of [0, 4, 8, 12, 15]) {
  assert.throws(() => clientB({ ...sealed, tag: Buffer.from(sealed.tag, "base64").subarray(0, size).toString("base64") }), /content_tampered/);
}
assert.throws(() => clientB({ ...sealed, nonce: Buffer.alloc(8).toString("base64") }), /content_tampered/);
assert.throws(() => clientB({ ...sealed, ciphertext: sealed.ciphertext + "!" }), /content_tampered/);
assert.throws(() => clientB(sealed, { key: randomBytes(32) }), /content_tampered/);
assert.throws(() => clientB(sealed, { recordId: "rec-2" }), /wrong_record/);
assert.throws(() => clientB(sealed, { collection: "attachments" }), /wrong_collection/);
assert.throws(() => clientB(sealed, { purpose: "attachment" }), /wrong_purpose/);

const legacy = { id: "old", title: "plain invoice" };
const mixed = [legacy, { id: "new", contentSeal: sealed }];
assert.deepEqual(mixed.map((row) => classifyStoredRecord(row)), ["legacy", "sealed"]);
assert.equal(classifyStoredRecord(legacy), "legacy");
assert.equal(clientB(sealed), title);

const source = readFileSync(resolve(__dirname, "contentEncryption.ts"), "utf8");
const callable = readFileSync(resolve(__dirname, "ownerContent.ts"), "utf8");
assert.doesNotMatch(source, /console\./);
assert.doesNotMatch(callable, /console\./);
assert.doesNotMatch(callable, /plaintextBase64\}/);

const keyA = randomBytes(32);
const keyB = randomBytes(32);
const v2 = sealContentV2({ ...bind(), key: keyA, keyId: "k-a", plaintext: Buffer.from(title) });
assert.equal(v2.v, 2);
assert.equal(openContent({ ...bind(), key: keyB, seal: v2, resolveKey: (id) => (id === "k-a" ? keyA : null) }).toString(), title);
let lookedUp: string[] = [];
assert.throws(() => openContent({
  ...bind(),
  key: keyA,
  seal: { ...v2, keyId: "k-b" },
  resolveKey: (id) => {
    lookedUp.push(id);
    return id === "k-b" ? keyB : keyA;
  },
}), /content_tampered|unknown_key/);
assert.deepEqual(lookedUp, ["k-b"]);
assert.throws(() => openContent({ ...bind(), key, seal: { ...sealed, v: 9 as 1 } }), /unsupported_seal/);
const plan = planContentKeyMigration([{ contentSeal: null }, { contentSeal: sealed }, { contentSeal: v2 }, { contentSeal: { v: 9 } }]);
assert.deepEqual(plan, { mode: "count-only", counts: { plaintext: 1, v1: 1, v2: 1, unknown: 1 }, writes: 0 });
assert.throws(() => assertContentBinding({ collection: "entries", purpose: "attachment", revision: 1 }), /binding_rejected/);
assert.throws(() => assertContentBinding({ collection: "entries", purpose: "diary", revision: 1.5 }), /binding_rejected/);
const named = Buffer.from("b".repeat(32));
const v2Only = sealContentV2({ ...bind(), key: named, keyId: "named-key", plaintext: Buffer.from(title) });
assert.equal(openStoredContent({
  env: { CONTENT_DATA_KEYS: JSON.stringify({ "named-key": named.toString("base64") }) },
  ...bind(),
  seal: v2Only,
}).toString(), title);
assert.equal(boundaryFor("exports").boundary, "user_requested_export");
assert.equal(boundaryFor("storage_object_names").boundary, "routing_metadata");
assert.equal(boundaryFor("party_ledger_projections").boundary, "owner_rules");
assert.equal(CONTENT_MIGRATION_UNCOVERED.includes("party_ledger_projections"), true);
assert.equal(boundaryFor("grin_evidence").privateFields.includes("image bytes"), true);
const coverage = coverageEvidence();
assert.equal(coverage.grin.encryption, false);
assert.equal(coverage.grin.implemented, "owner_rules");
assert.equal(coverage.partyLedger.encryption, false);
assert.equal(coverage.partyLedger.storedPlaintextProjection, false);
assert.equal(coverage.partyLedger.clientRead, "denied");
assert.equal(coverage.partyLedger.releaseReadPath, "recomputed_on_device");
assert.equal(coverage.partyLedger.deletion, "purged_with_the_account");
assert.equal(coverage.grin.releaseReachable, false);
assert.equal(coverage.localQueue.encryption, true);
assert.equal(coverage.localQueue.keyStore, "os_secure_store");
assert.equal(coverage.localQueue.nativeDeviceVerified, false);
assert.equal(coverage.localQueue.sealedFields.includes("sync_queue.payload_json"), true);
assert.equal(coverage.localQueue.insightJoinKeys, "account_bound_hmac");
assert.equal(coverage.localQueue.grinLocal.storeRuntimeCanOpen, false);
assert.equal(coverage.localQueue.grinLocal.bodiesEncrypted, false);
assert.equal(coverage.localQueue.grinLocal.accountDeletionRemovesOwnerRows, true);
assert.equal(coverage.localQueue.mockDiary.productionRepository, "firebase");
assert.equal(coverage.localQueue.mockDiary.silentFallback, false);
assert.equal(coverage.localQueue.mockDiary.retainedCopiesSealed, true);
assert.equal(coverage.localQueue.unresolvedOwnerDecision.length, 0);
assert.equal(coverage.localQueue.logoutCleanupProven, false);
assert.equal(coverage.localQueue.logoutRetainsUnsynced, true);
assert.equal(coverage.localQueue.accountIsolated, true);
assert.notEqual(boundaryFor("exports").boundary, "content_seal");
const clocks = deletionDeadlinePopulations();
assert.equal(clocks.legacyGraceMs, 45 * 24 * 60 * 60 * 1000);
assert.equal(clocks.newRequestErasureDays, 15);
assert.equal(clocks.sameValue, false);
const owned = { id: "a", updatedAt: sealed.revision, contentSeal: sealed, path: "users/owner-a/entries/rec-1" };
const ownedB = { ...owned, id: "b" };
const keys = (id: string) => (id === "named-key" ? named : id === "legacy" ? key : null);

void (async () => {
  await assert.rejects(() => migrateContentKeyBatch({
    rows: [owned],
    toKeyId: "named-key",
    resolveKey: () => named,
    dryRun: false,
  }), /migration_disabled/);
  const dry = await migrateContentKeyBatch({
    rows: [owned, { id: "b", updatedAt: 2, contentSeal: v2Only }],
    toKeyId: "named-key",
    resolveKey: (id) => (id === "named-key" ? named : null),
    dryRun: true,
  });
  assert.equal(dry.written, 0);
  assert.equal(dry.skipped, 1);
  process.env.CONTENT_KEY_MIGRATION_ENABLED = "true";
  await assert.rejects(() => migrateContentKeyBatch({
    rows: [owned],
    toKeyId: "named-key",
    resolveKey: keys,
    dryRun: false,
  }), /migration_writer_required/);
  const persisted: string[] = [];
  const applied = await migrateContentKeyBatch({
    rows: [owned],
    toKeyId: "named-key",
    resolveKey: keys,
    dryRun: false,
    writer: async (row) => {
      persisted.push(row.id);
      return "persisted";
    },
  });
  assert.equal(applied.written, 1);
  assert.deepEqual(persisted, ["a"]);
  const rejected = await migrateContentKeyBatch({
    rows: [owned],
    toKeyId: "named-key",
    resolveKey: keys,
    dryRun: false,
    writer: async () => "rejected",
  });
  assert.equal(rejected.written, 0);
  assert.equal(rejected.nextCursor, "a");
  assert.equal(rejected.stopped, "rejected");
  const lost = await migrateContentKeyBatch({
    rows: [owned, ownedB],
    toKeyId: "named-key",
    resolveKey: keys,
    dryRun: false,
    writer: async (row) => (row.id === "a" ? "persisted" : "unknown"),
  });
  assert.equal(lost.written, 1);
  assert.deepEqual(lost.unknown, ["b"]);
  assert.equal(lost.nextCursor, "b");
  const thrown = await migrateContentKeyBatch({
    rows: [owned, ownedB],
    toKeyId: "named-key",
    resolveKey: keys,
    dryRun: false,
    writer: async (row) => {
      if (row.id === "b") throw new Error("adapter down");
      return "persisted";
    },
  });
  assert.equal(thrown.written, 1);
  assert.equal(thrown.stopped, "writer_threw");
  assert.equal(thrown.nextCursor, "b");
  const previous = { cursor: null, toKeyId: "named-key", conflicts: [] as string[] };
  const conflicted = await migrateContentKeyBatch({
    rows: [owned, ownedB],
    toKeyId: "named-key",
    resolveKey: keys,
    dryRun: false,
    writer: (row) => (row.id === "a" ? "conflict" : "persisted"),
  });
  assert.deepEqual(conflicted.conflicts, ["a"]);
  assert.equal(conflicted.written, 0);
  assert.equal(conflicted.nextCursor, "a");
  const resumed = resumeKeyMigrationCheckpoint(previous, conflicted);
  assert.equal(resumed.cursor, "a");
  assert.deepEqual(rowsFromInclusiveCursor([owned, ownedB], "a").map((row) => row.id), ["a", "b"]);
  assert.equal(sealMatchesSourcePath({ ...owned, path: "users/other/entries/rec-1" }), false);
  const store = createMemoryMigrationCheckpointStore();
  const first = await runOwnedMigration({
    store,
    runId: "run-1",
    now: 1_000,
    leaseMs: 500,
    rows: [owned, ownedB],
    toKeyId: "named-key",
    resolveKey: keys,
    writer: async (row) => (row.id === "b" ? "unknown" : "persisted"),
  });
  assert.equal(first.status, "stored");
  if (first.status === "stored") assert.equal(first.cursor, "b");
  const blocked = await runOwnedMigration({
    store,
    runId: "run-2",
    now: 1_100,
    leaseMs: 500,
    rows: [owned, ownedB],
    toKeyId: "named-key",
    resolveKey: keys,
    writer: async () => "persisted",
  });
  assert.equal(blocked.status, "owned_by_other");
  const replay = await runOwnedMigration({
    store,
    runId: "run-1",
    now: 2_000,
    leaseMs: 500,
    rows: [owned, ownedB],
    toKeyId: "named-key",
    resolveKey: keys,
    writer: async (row) => {
      assert.equal(row.id, "b");
      return "persisted";
    },
  });
  assert.equal(replay.status, "stored");
  if (replay.status === "stored") {
    assert.equal(replay.batch.written, 1);
    assert.equal(replay.cursor, null);
  }
  const unbound = await runOwnedMigration({
    store: createMemoryMigrationCheckpointStore(),
    runId: "run-3",
    now: 3_000,
    leaseMs: 500,
    rows: [owned],
    toKeyId: "named-key",
    ring: ["legacy"],
    resolveKey: keys,
    writer: async () => "persisted",
  });
  assert.equal(unbound.status, "key_not_in_ring");
  const mismatched = await migrateContentKeyBatch({
    rows: [{ ...owned, path: "users/owner-b/entries/rec-1" }],
    toKeyId: "named-key",
    resolveKey: keys,
    dryRun: false,
    writer: async () => "persisted",
  });
  assert.equal(mismatched.written, 0);
  assert.deepEqual(mismatched.quarantined, ["a"]);
  delete process.env.CONTENT_KEY_MIGRATION_ENABLED;
  let interrupted = previous;
  try {
    await migrateContentKeyBatch({
      rows: [owned],
      toKeyId: "named-key",
      resolveKey: () => named,
      dryRun: false,
    });
  } catch {
    interrupted = resumeKeyMigrationCheckpoint(previous, null);
  }
  assert.equal(interrupted.cursor, null);
  assert.equal(keyRetirementAllowed({
    keyId: "legacy",
    ring: ["legacy", "named-key"],
    activeUses: 0,
    uncovered: [],
  }).reason, "backup_observation_missing");
  assert.equal(keyRetirementAllowed({
    keyId: "legacy",
    ring: ["legacy"],
    activeUses: 1,
    uncovered: ["exports"],
  }).reason, "active_records_remain");
  const ready = keyRetirementAllowed({
    keyId: "legacy",
    ring: ["legacy"],
    activeUses: 0,
    uncovered: [],
    now: 10_000,
    observation: {
      keyId: "legacy",
      source: "backup_inventory",
      scope: "key-ring:legacy",
      observedAt: 9_000,
      copies: 0,
    },
  });
  assert.equal(ready.allowed, true);
  assert.equal(executeKeyRetirement({
    keyId: "legacy",
    ring: ["legacy"],
    activeUses: 0,
    uncovered: [],
    now: 10_000,
    observation: {
      keyId: "legacy",
      source: "backup_inventory",
      scope: "key-ring:legacy",
      observedAt: 9_000,
      copies: 0,
    },
  }).reason, "retirement_executor_not_bound");
  console.log("contentEncryption.unit.test.ts: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
