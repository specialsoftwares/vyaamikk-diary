/**
 * Production key migration and sealed local payloads.
 * Host SQLite is not a phone. The cipher test removes WebCrypto first.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { randomFillSync } from "node:crypto";

import { installMemoryLocalDatabase, reopenMemoryLocalDatabaseFrom, uninstallMemoryLocalDatabase } from "@/localDb/testHarness";
import { migrateToV3, migrateToV5, migrateToV6 } from "@/localDb/migrate";
import { getLocalDatabase } from "@/localDb/database";
import { toPublicError } from "@/domain/publicErrors";
import { requireReadyLocalKey } from "@/services/accountDeletion/sessionLocalReadiness";
import {
  LocalKeyUnavailable,
  createMemoryLocalKeyStore,
  createSecureLocalKeyStore,
  localCipherWorksWithoutWebCrypto,
  resolveLocalDataKey,
  type SecureKeyApi,
} from "@/services/accountDeletion/localDataKey";
import {
  bindLocalDataKey,
  migrateOwnedPayloads,
  openOwnedPayload,
  requireSealedLocalPayloadForTests,
  unbindLocalDataKey,
} from "@/services/accountDeletion/localPayload";
import { retainLocalAccountOnLogout } from "@/services/accountDeletion/localAccountBoundary";
import { writeLocalEntryRowSync, readLocalEntryRecordSync } from "@/repositories/localEntriesRepository";
import { enqueueSync, readSyncQueueItemSync } from "@/repositories/syncQueueRepository";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";
import { masterDataRepository, setMasterDataSessionUser } from "@/services/masterData/masterDataRepository";
import {
  listInsightsByKind,
  migrateInsightJoinKeys,
  upsertInsightLink,
} from "@/services/insights/businessInsightRepository";
import { mayIssueRemoteWork, syncSessionOwnership } from "@/sync/syncSessionOwnership";
import type { BusinessEntry } from "@/domain/businessEntry";

async function main(): Promise<void> {
const originalRequire = Module.prototype.require;
Module.prototype.require = function (this: unknown, id: string) {
  if (id === "expo-crypto") {
    return {
      getRandomValues(bytes: Uint8Array) {
        randomFillSync(bytes);
        return bytes;
      },
    };
  }
  return originalRequire.apply(this, [id]);
} as typeof Module.prototype.require;
try {
assert.equal(localCipherWorksWithoutWebCrypto(), true);

const legacy = new Map<string, string>();
const secure = new Map<string, string>();
const ordinary = new Map<string, string>();
const secureApi: SecureKeyApi = {
  async getItem(key) {
    return secure.get(key) ?? null;
  },
  async setItem(key, value) {
    if (ordinary.has("written")) throw new Error("ordinary storage was used");
    secure.set(key, value);
  },
  async deleteItem(key) {
    secure.delete(key);
  },
};
const legacyReader = {
  async getItem(key: string) {
    return legacy.get(key) ?? null;
  },
  async removeItem(key: string) {
    legacy.delete(key);
  },
  async setItem(key: string, value: string) {
    ordinary.set(key, value);
    throw new Error("legacy set");
  },
};
const store = createSecureLocalKeyStore({
  secure: secureApi,
  legacy: legacyReader,
  accessibility: "after_first_unlock_this_device_only",
});

const seed = Buffer.from("a".repeat(32)).toString("base64");
legacy.set("vyd_local_data_key_v1_owner-a", seed);
const moved = await resolveLocalDataKey(store, "owner-a", { legacy: legacyReader });
assert.equal(moved.state, "ready");
assert.equal(legacy.has("vyd_local_data_key_v1_owner-a"), false);
assert.equal(ordinary.size, 0);

legacy.set("vyd_local_data_key_v1_owner-b", Buffer.from("b".repeat(32)).toString("base64"));
secure.set("vyd.ldk.v1.owner-b", Buffer.from("c".repeat(32)).toString("base64"));
const conflict = await resolveLocalDataKey(store, "owner-b", { legacy: legacyReader });
assert.equal(conflict.state, "unavailable");
if (conflict.state === "unavailable") assert.equal(conflict.reason, "key_conflict");
assert.equal(legacy.has("vyd_local_data_key_v1_owner-b"), true);

secure.set("vyd.ldk.v1.owner-c", "aaaa");
const corrupt = await resolveLocalDataKey(store, "owner-c", { retainedCiphertext: true, legacy: legacyReader });
assert.equal(corrupt.state, "unavailable");
if (corrupt.state === "unavailable") assert.equal(corrupt.reason, "key_corrupt");

secure.delete("vyd.ldk.v1.owner-d");
const missing = await resolveLocalDataKey(store, "owner-d", { retainedCiphertext: true });
assert.equal(missing.state, "unavailable");
if (missing.state === "unavailable") assert.equal(missing.reason, "key_missing");
assert.equal(secure.has("vyd.ldk.v1.owner-d"), false);

const down: SecureKeyApi = {
  async getItem() {
    throw new Error("native missing");
  },
  async setItem() {
    ordinary.set("raw", "no");
    throw new Error("native missing");
  },
  async deleteItem() {
    throw new Error("native missing");
  },
};
const unavailable = await resolveLocalDataKey(
  createSecureLocalKeyStore({ secure: down, legacy: legacyReader, accessibility: "after_first_unlock_this_device_only" }),
  "owner-e"
);
assert.equal(unavailable.state, "unavailable");
if (unavailable.state === "unavailable") {
  assert.equal(unavailable.reason, "secure_store_read_failed");
  assert.equal((unavailable.cause as Error).message, "native missing");
}
assert.equal(ordinary.has("raw"), false);

const memory = createMemoryLocalKeyStore();
const [first, second] = await Promise.all([
  resolveLocalDataKey(memory, "owner-f"),
  resolveLocalDataKey(memory, "owner-f"),
]);
assert.equal(first.state, "ready");
assert.equal(second.state, "ready");
if (first.state === "ready" && second.state === "ready") {
  assert.equal(Buffer.from(first.key).toString("hex"), Buffer.from(second.key).toString("hex"));
}

const db = installMemoryLocalDatabase();
migrateToV3(db as unknown as Parameters<typeof migrateToV3>[0]);
migrateToV5(db as unknown as Parameters<typeof migrateToV5>[0]);
requireSealedLocalPayloadForTests();
if (moved.state !== "ready") throw new Error("key");
bindLocalDataKey("owner-a", moved.key);
const entry = { id: "note-1", userId: "owner-a", updatedAt: 10, title: "priya warehouse" } as BusinessEntry;
writeLocalEntryRowSync(entry, { syncStatus: "pending" }, null);
const raw = db.getFirstSync<{ payload_json: string }>("SELECT payload_json FROM entries_local WHERE id = ?", ["note-1"]);
assert.equal(raw?.payload_json.startsWith("vyd1:"), true);
assert.equal(raw?.payload_json.includes("priya"), false);
assert.equal(readLocalEntryRecordSync("owner-a", "note-1")?.entry.title, "priya warehouse");
assert.equal(readLocalEntryRecordSync("owner-b", "note-1"), null);
const other = openOwnedPayload("owner-b", raw?.payload_json ?? "");
assert.equal(other.state, "unavailable");

const queueId = enqueueSync({
  userId: "owner-a",
  op: "create",
  entity: "entry",
  entityId: "note-1",
  payload: { clientRecordId: "note-1", title: "priya warehouse" },
});
const queued = db.getFirstSync<{ payload_json: string }>("SELECT payload_json FROM sync_queue WHERE id = ?", [queueId]);
assert.equal(queued?.payload_json.includes("priya"), false);
assert.equal((readSyncQueueItemSync(queueId)?.payload as { title?: string }).title, "priya warehouse");

await formDraftsRepository.saveUserDraft({
  userId: "owner-a",
  draftKind: "composer",
  scopeKey: "movement",
  title: "priya draft",
  payload: { partyName: "Priya" },
});
const draftRow = db.getFirstSync<{ payload_json: string; title: string }>(
  "SELECT payload_json, title FROM form_drafts WHERE user_id = ?",
  ["owner-a"]
);
assert.equal(draftRow?.payload_json.includes("Priya"), false);
assert.equal(draftRow?.title.includes("priya"), false);
const loaded = await formDraftsRepository.getById("owner-a", "missing");
assert.equal(loaded, null);

setMasterDataSessionUser("owner-a");
await masterDataRepository.upsert({
  scope: { userId: "owner-a", ueid: "VYD-1" },
  fieldKey: "partyName",
  value: "Priya Stores",
});
const suggestion = db.getFirstSync<{ value: string; normalized_value: string }>(
  "SELECT value, normalized_value FROM master_data_suggestions WHERE user_id = ?",
  ["owner-a"]
);
assert.equal(suggestion?.value.includes("Priya"), false);
assert.equal(suggestion?.normalized_value.startsWith("vydh1."), true);
const found = await masterDataRepository.query({
  scope: { userId: "owner-a", ueid: "VYD-1" },
  fieldKey: "partyName",
  prefix: "Pri",
});
assert.equal(found[0]?.value, "Priya Stores");

migrateToV6(db);
db.runSync(
  `INSERT INTO business_insights
    (id, user_id, ueid, insight_kind, financial_year, normalized_key, display_label, metadata_json, record_count, last_used_at, created_at, updated_at)
   VALUES ('bi-plain', 'owner-a', 'VYD-1', 'party', 2026, 'priya stores', 'Priya Stores', '{}', 1, 5, 5, 5)`
);
db.runSync(
  `INSERT INTO business_insight_links
    (id, user_id, insight_kind, normalized_key, financial_year, source_record_type, source_record_id, record_date_ms, metadata_json)
   VALUES ('link-plain', 'owner-a', 'party', 'priya stores', 2026, 'diary_entry', 'src-1', 5, '{}')`
);
const migratedInsights = migrateInsightJoinKeys(db, "owner-a");
assert.equal(migratedInsights.migrated >= 2, true);
const storedKey = db.getFirstSync<{ normalized_key: string; display_label: string }>(
  "SELECT normalized_key, display_label FROM business_insights WHERE id = ?",
  ["bi-plain"]
);
assert.equal(storedKey?.normalized_key.startsWith("vydh1."), true);
assert.equal(storedKey?.normalized_key.includes("priya"), false);
assert.equal(storedKey?.display_label.startsWith("vyd1:"), true);
const storedLink = db.getFirstSync<{ id: string; normalized_key: string }>(
  "SELECT id, normalized_key FROM business_insight_links WHERE user_id = ? AND source_record_id = ?",
  ["owner-a", "src-1"]
);
assert.equal(storedLink?.id.startsWith("vydh1."), true);
assert.equal(storedLink?.normalized_key, storedKey?.normalized_key);
const listed = listInsightsByKind("owner-a", "party", 2026);
assert.equal(listed[0]?.displayLabel, "Priya Stores");
assert.equal(listed[0]?.normalizedKey.includes("priya"), false);

db.runSync(
  `INSERT INTO business_insight_links
    (id, user_id, insight_kind, normalized_key, financial_year, source_record_type, source_record_id, record_date_ms, metadata_json)
   VALUES ('plain-link', 'owner-a', 'party', 'other party', 2026, 'diary_entry', 'src-2', 6, '{}')`
);
assert.throws(() => migrateInsightJoinKeys({
  runSync(sql, params) {
    if ((params ?? []).includes("plain-link")) throw new Error("interrupted");
    db.runSync(sql, params);
  },
  getAllSync: (sql, params) => db.getAllSync(sql, params),
  getFirstSync: (sql, params) => db.getFirstSync(sql, params),
}, "owner-a"));
const keptPlain = db.getFirstSync<{ normalized_key: string }>(
  "SELECT normalized_key FROM business_insight_links WHERE id = ?",
  ["plain-link"]
);
assert.equal(keptPlain?.normalized_key, "other party");
migrateInsightJoinKeys(db, "owner-a");
const finishedLink = db.getFirstSync<{ normalized_key: string }>(
  "SELECT normalized_key FROM business_insight_links WHERE source_record_id = ?",
  ["src-2"]
);
assert.equal(finishedLink?.normalized_key.startsWith("vydh1."), true);
assert.equal(finishedLink?.normalized_key.includes("other"), false);
const again = migrateInsightJoinKeys(db, "owner-a");
assert.equal(again.migrated, 0);
assert.equal(listInsightsByKind("owner-a", "party", 2026).length, 1);

await upsertInsightLink({
  userId: "owner-a",
  ueid: "VYD-1",
  kind: "party",
  normalizedKey: "priya stores",
  financialYear: 2026,
  displayLabel: "Priya Stores",
  metadata: { partyName: "Priya Stores", pin: null, locality: null, state: null, sources: ["diary"] },
  sourceRecordType: "diary_entry",
  sourceRecordId: "src-3",
  recordDateMs: 7,
});
const deduped = db.getAllSync<{ id: string }>(
  "SELECT id FROM business_insights WHERE user_id = ? AND insight_kind = 'party' AND financial_year = 2026",
  ["owner-a"]
);
assert.equal(deduped.length, 1);
assert.equal(listInsightsByKind("owner-a", "party", 2026)[0]?.recordCount, 2);

unbindLocalDataKey("owner-a");
db.runSync(
  `INSERT INTO business_insight_links
    (id, user_id, insight_kind, normalized_key, financial_year, source_record_type, source_record_id, record_date_ms, metadata_json)
   VALUES ('left-plain', 'owner-a', 'pin', '560001', 2026, 'diary_entry', 'src-4', 8, '{}')`
);
assert.throws(() => migrateInsightJoinKeys(db, "owner-a"));
assert.equal(
  db.getFirstSync<{ normalized_key: string }>("SELECT normalized_key FROM business_insight_links WHERE id = ?", ["left-plain"])?.normalized_key,
  "560001"
);
bindLocalDataKey("owner-a", moved.key);

assert.equal(retainLocalAccountOnLogout("owner-a"), "retained");
assert.equal(readLocalEntryRecordSync("owner-a", "note-1")?.entry.title, "priya warehouse");

db.runSync(
  `INSERT INTO entries_local (id, user_id, payload_json, sync_status, local_updated_at, remote_updated_at, version_number)
   VALUES ('plain-1', 'owner-a', '{"title":"kept offline"}', 'pending', 2, NULL, 1)`
);
assert.throws(() => migrateOwnedPayloads(
  {
    runSync: (sql, params) => {
      if ((params ?? []).includes("plain-1")) throw new Error("interrupted");
      db.runSync(sql, params);
    },
    getAllSync: (sql, params) => db.getAllSync(sql, params),
  },
  "owner-a"
));
const stillPlain = db.getFirstSync<{ payload_json: string }>("SELECT payload_json FROM entries_local WHERE id = ?", ["plain-1"]);
assert.equal(stillPlain?.payload_json.includes("kept offline"), true);
const finished = migrateOwnedPayloads(db, "owner-a");
assert.equal(finished.sealed >= 1, true);
assert.equal(readLocalEntryRecordSync("owner-a", "plain-1")?.entry.title, "kept offline");
const sealedPlain = db.getFirstSync<{ payload_json: string }>("SELECT payload_json FROM entries_local WHERE id = ?", ["plain-1"]);
assert.equal(sealedPlain?.payload_json.includes("kept offline"), false);

unbindLocalDataKey("owner-a");
assert.throws(() => readLocalEntryRecordSync("owner-a", "note-1"), (error: unknown) => {
  return error instanceof LocalKeyUnavailable && error.reason === "key_missing";
});
assert.equal(db.getFirstSync<{ id: string }>("SELECT id FROM entries_local WHERE id = ?", ["note-1"])?.id, "note-1");
assert.throws(() => writeLocalEntryRowSync(entry, { syncStatus: "pending" }, null), (error: unknown) => error instanceof LocalKeyUnavailable);

bindLocalDataKey("owner-a", moved.key);
syncSessionOwnership.resetForTests();
const generation = syncSessionOwnership.beginSession("owner-a");
syncSessionOwnership.endSession();
const replacement = syncSessionOwnership.beginSession("owner-a");
assert.equal(mayIssueRemoteWork(generation, "owner-a"), false);
assert.equal(readLocalEntryRecordSync("owner-a", "note-1")?.entry.title, "priya warehouse");
assert.equal(replacement.uid, "owner-a");

const restarted = reopenMemoryLocalDatabaseFrom(db);
requireSealedLocalPayloadForTests();
assert.equal(getLocalDatabase(), restarted);
assert.equal(readLocalEntryRecordSync("owner-a", "note-1")?.entry.title, "priya warehouse");

restarted.runSync("DELETE FROM entries_local WHERE user_id = ?", ["owner-a"]);
restarted.runSync("DELETE FROM sync_queue WHERE user_id = ?", ["owner-a"]);
restarted.runSync("DELETE FROM form_drafts WHERE user_id = ?", ["owner-a"]);
restarted.runSync("DELETE FROM master_data_suggestions WHERE user_id = ?", ["owner-a"]);
unbindLocalDataKey("owner-a");
await store.delete("owner-a");
assert.equal(restarted.getFirstSync<{ id: string }>("SELECT id FROM entries_local WHERE user_id = ?", ["owner-a"]), null);
assert.equal(secure.has("vyd.ldk.v1.owner-a"), false);

assert.throws(
  () => requireReadyLocalKey({ state: "unavailable", reason: "secure_store_read_failed" }),
  (error: unknown) => error instanceof LocalKeyUnavailable && error.reason === "secure_store_read_failed"
);

const hostRandom = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
let hostCalls = 0;
globalThis.crypto.getRandomValues = ((bytes: Uint8Array) => {
  hostCalls += 1;
  return hostRandom(bytes);
}) as typeof globalThis.crypto.getRandomValues;
Module.prototype.require = function (this: unknown, id: string) {
  if (id === "expo-crypto") {
    return {
      getRandomValues() {
        throw new Error("native module missing");
      },
    };
  }
  return originalRequire.apply(this, [id]);
} as typeof Module.prototype.require;
try {
  await assert.rejects(resolveLocalDataKey(createMemoryLocalKeyStore(), "owner-rng"), (error: unknown) => {
    assert.ok(error instanceof LocalKeyUnavailable);
    assert.equal(error.reason, "secure_random_unavailable");
    const shown = toPublicError(error).message;
    assert.equal(shown.includes("secure_"), false);
    assert.equal(shown.includes("native module"), false);
    assert.match(shown, /secure storage/i);
    return true;
  });
  assert.equal(hostCalls, 0);
} finally {
  globalThis.crypto.getRandomValues = hostRandom;
}

uninstallMemoryLocalDatabase();
console.log("local key and payload protection passed");
} finally {
  Module.prototype.require = originalRequire;
}
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
