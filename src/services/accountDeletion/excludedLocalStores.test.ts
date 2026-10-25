/**
 * Production selection of the mock diary and the excluded GRIN local tables.
 * Host evidence. It does not open a Play-installed binary.
 */
import assert from "node:assert/strict";

import { buildResolvedEnvironment } from "@/config/runtimeEnvironment";
import { diaryRepositoryKind } from "@/services/diary";
import { mockDiaryPayloadState, sealRetainedMockDiary } from "@/services/diary/mockDiarySeal";
import { productionGrinLocalAccess } from "@/services/grin/repository/appBinding";
import {
  deleteGrinLocalOwnerRows,
  retainLocalAccountOnLogout,
} from "@/services/accountDeletion/localAccountBoundary";
import { bindLocalDataKey, unbindLocalDataKey } from "@/services/accountDeletion/localPayload";

async function main(): Promise<void> {
const store = buildResolvedEnvironment({
  bundledAppModeRaw: "production",
  devBackendRaw: "shared-dev",
  firebaseConfigured: true,
  signals: { appOwnership: "standalone", isDev: false, platform: "ios" },
});
assert.equal(store.getActiveBackend(), "firebase-production");
assert.equal(diaryRepositoryKind(store.getActiveBackend()), "firebase");
assert.equal(diaryRepositoryKind("local-mock"), "mock");
assert.equal(diaryRepositoryKind("not-configured"), "mock");

assert.equal(productionGrinLocalAccess({ storeBlocked: true, enabled: true }), "denied");
assert.equal(productionGrinLocalAccess({ storeBlocked: true, enabled: false }), "denied");
assert.equal(productionGrinLocalAccess({ storeBlocked: false, enabled: false }), "denied");
assert.equal(productionGrinLocalAccess({ storeBlocked: false, enabled: true }), "open");

assert.equal(mockDiaryPayloadState("vyd1:sealed"), "sealed");
assert.equal(mockDiaryPayloadState("[{\"id\":\"a\"}]"), "json");

const key = new Uint8Array(32).fill(7);
bindLocalDataKey("owner-a", key);
const storage = new Map<string, string>();
const memory = {
  async getItem(name: string) {
    return storage.get(name) ?? null;
  },
  async setItem(name: string, value: string) {
    storage.set(name, value);
  },
};
storage.set("vyd_diary_v2_owner-a", "[{\"id\":\"note\"}]");
assert.equal(await sealRetainedMockDiary(memory, "owner-a"), "sealed");
assert.equal(storage.get("vyd_diary_v2_owner-a")?.startsWith("vyd1:"), true);
assert.equal(storage.get("vyd_diary_v2_owner-a")?.includes("note"), false);
assert.equal(await sealRetainedMockDiary(memory, "owner-a"), "already_sealed");
assert.equal(storage.has("vyd_diary_v2_owner-a"), true);
unbindLocalDataKey("owner-a");
storage.set("vyd_diary_v2_owner-b", "[{\"id\":\"keep\"}]");
await assert.rejects(() => sealRetainedMockDiary(memory, "owner-b"));
assert.equal(storage.get("vyd_diary_v2_owner-b"), "[{\"id\":\"keep\"}]");

type Row = { id: string; owner_uid: string };
const grin = new Map<string, Row>();
const db = {
  runSync(sql: string, params?: unknown[]) {
    const uid = String(params?.[0] ?? "");
    if (sql.includes("grin_local_receipts")) {
      for (const [id, row] of grin) {
        if (row.owner_uid === uid) grin.delete(id);
      }
      return;
    }
    if (sql.includes("grin_outbox_commands") || sql.includes("grin_owner_runtime") || sql.includes("grin_local_evidence_files")) {
      return;
    }
    throw new Error(`unexpected sql ${sql}`);
  },
  getAllSync<T>(): T[] {
    return [] as T[];
  },
};
grin.set("r1", { id: "r1", owner_uid: "owner-a" });
grin.set("r2", { id: "r2", owner_uid: "owner-b" });
assert.equal(retainLocalAccountOnLogout("owner-a"), "retained");
assert.equal(grin.has("r1"), true);
deleteGrinLocalOwnerRows(db, "owner-a");
assert.equal(grin.has("r1"), false);
assert.equal(grin.has("r2"), true);

console.log("excluded local stores passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
