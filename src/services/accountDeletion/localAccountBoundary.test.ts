/**
 * SQLITE_HOST plus the production retention and search functions.
 * Host restart is not native-device proof.
 */
import assert from "node:assert/strict";
import { randomFillSync } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { MIGRATIONS_V1 } from "@/localDb/schema";
import { execStatements } from "@/localDb/migrate";
import { openHostSqlite } from "@/services/grin/outbox/hostSqlite";
import { createMemoryLocalKeyStore } from "@/services/accountDeletion/localDataKey";
import { __setNativeSecureRandomForTests } from "@/services/accountDeletion/nativeSecureRandom";
import {
  deleteLocalOwnerRows,
  listOwnedIds,
  logoutDisposition,
  retainLocalAccountOnLogout,
  staleLocalWorkerMayContinue,
} from "@/services/accountDeletion/localAccountBoundary";
import { clearRecentSearches, getRecentSearches, pushRecentSearch } from "@/services/search/recentSearches";
import { mayIssueRemoteWork, syncSessionOwnership } from "@/sync/syncSessionOwnership";

const dbPath = path.join(os.tmpdir(), `vyd-local-boundary-${process.pid}.sqlite`);
const db = openHostSqlite(dbPath);
execStatements(db, MIGRATIONS_V1, "v1");
db.runSync(
  `INSERT INTO entries_local (id, user_id, payload_json, sync_status, local_updated_at, remote_updated_at, version_number)
   VALUES (?, ?, ?, 'pending', 1, NULL, 1)`,
  ["a-row", "owner-a", "{\"title\":\"warehouse\"}"]
);
db.runSync(
  `INSERT INTO entries_local (id, user_id, payload_json, sync_status, local_updated_at, remote_updated_at, version_number)
   VALUES (?, ?, ?, 'pending', 1, NULL, 1)`,
  ["b-row", "owner-b", "{\"title\":\"other\"}"]
);
db.runSync(
  `INSERT INTO sync_queue (id, user_id, op, entity, entity_id, payload_json, created_at, attempts, last_error)
   VALUES ('q-a', 'owner-a', 'create', 'entry', 'a-row', '{}', 1, 0, NULL)`
);

assert.deepEqual(listOwnedIds(db, "entries_local", "owner-a"), ["a-row"]);
assert.deepEqual(listOwnedIds(db, "entries_local", "owner-b"), ["b-row"]);
assert.equal(logoutDisposition("pending_sync"), "retain");
assert.equal(logoutDisposition("draft"), "retain");
assert.equal(logoutDisposition("diagnostic"), "drop_memory");
assert.equal(retainLocalAccountOnLogout("owner-a"), "retained");
assert.deepEqual(listOwnedIds(db, "entries_local", "owner-a"), ["a-row"]);
assert.deepEqual(listOwnedIds(db, "sync_queue", "owner-a"), ["q-a"]);

syncSessionOwnership.resetForTests();
const first = syncSessionOwnership.beginSession("owner-a");
syncSessionOwnership.endSession();
const second = syncSessionOwnership.beginSession("owner-a");
assert.equal(mayIssueRemoteWork(first, "owner-a"), false);
assert.equal(staleLocalWorkerMayContinue(first, second), false);
assert.equal(mayIssueRemoteWork(second, "owner-a"), true);
assert.equal(mayIssueRemoteWork(second, "owner-b"), false);
assert.deepEqual(listOwnedIds(db, "entries_local", "owner-a"), ["a-row"]);

deleteLocalOwnerRows(db, "owner-a");
assert.deepEqual(listOwnedIds(db, "entries_local", "owner-a"), []);
assert.deepEqual(listOwnedIds(db, "sync_queue", "owner-a"), []);
assert.deepEqual(listOwnedIds(db, "entries_local", "owner-b"), ["b-row"]);
db.close?.();

const reopened = openHostSqlite(dbPath);
assert.deepEqual(listOwnedIds(reopened, "entries_local", "owner-b"), ["b-row"]);
reopened.close?.();

async function searchCase(): Promise<void> {
  __setNativeSecureRandomForTests((length) => {
    const bytes = new Uint8Array(length);
    randomFillSync(bytes);
    return bytes;
  });
  const storage = new Map<string, string>();
const memory = {
  async getItem(key: string) {
    return storage.get(key) ?? null;
  },
  async setItem(key: string, value: string) {
    storage.set(key, value);
  },
  async removeItem(key: string) {
    storage.delete(key);
  },
};
const keys = createMemoryLocalKeyStore();
await pushRecentSearch("owner-a", "priya warehouse", memory, keys);
await pushRecentSearch("owner-b", "other party", memory, keys);
assert.deepEqual(await getRecentSearches("owner-a", memory, keys), ["priya warehouse"]);
assert.deepEqual(await getRecentSearches("owner-b", memory, keys), ["other party"]);
const stored = storage.get("vyd_search_recent_v1_owner-a") ?? "";
assert.equal(stored.includes("priya"), false);
assert.equal(retainLocalAccountOnLogout("owner-a"), "retained");
assert.deepEqual(await getRecentSearches("owner-a", memory, keys), ["priya warehouse"]);
await clearRecentSearches("owner-a", memory, keys);
assert.deepEqual(await getRecentSearches("owner-a", memory, keys), []);
assert.deepEqual(await getRecentSearches("owner-b", memory, keys), ["other party"]);
syncSessionOwnership.resetForTests();
  __setNativeSecureRandomForTests(null);
}

searchCase().then(() => {
  console.log("local account boundary: sqlite retention, stale worker, and sealed searches passed");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
