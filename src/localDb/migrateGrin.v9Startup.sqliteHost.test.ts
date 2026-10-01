/**
 * SQLITE_HOST: v9 diary file through the init.ts v10 sequence, including GRIN-off.
 * Does not edit init.ts. Host reopen is not NATIVE_DEVICE process-death proof.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";
import { execStatements, migrateToV7, migrateToV8, migrateToV9, tableExists } from "./migrate";
import { grinV10TablesPresent, migrateToV10 } from "./migrateGrin";
import { DB_VERSION, MIGRATIONS_V1 } from "./schema";
import type { GrinSqlDb } from "@/services/grin/outbox/hostSqlite";

function asMigrateDb(db: GrinSqlDb): Parameters<typeof migrateToV9>[0] {
  return db as unknown as Parameters<typeof migrateToV9>[0];
}

function applyDiaryV9(db: GrinSqlDb): void {
  execStatements(asMigrateDb(db), MIGRATIONS_V1, "v1");
  migrateToV7(asMigrateDb(db));
  migrateToV8(asMigrateDb(db));
  migrateToV9(asMigrateDb(db));
}

function readSchemaVersion(db: GrinSqlDb): number {
  const row = db.getFirstSync<{ value: string }>(
    "SELECT value FROM meta WHERE key = ?",
    ["schema_version"]
  );
  return row ? parseInt(row.value, 10) || 1 : 1;
}

/**
 * Same v10 steps as `src/localDb/init.ts` (version < 10 migrate; version >= 10
 * repair missing grin_local_receipts; write schema_version DB_VERSION).
 * Coordinator owns init.ts — this test copies that slice, it does not import init.
 */
function applyInitV10Sequence(db: GrinSqlDb): void {
  let version = readSchemaVersion(db);
  if (version < 10) {
    migrateToV10(asMigrateDb(db));
    version = 10;
  }
  if (version >= 10 && !tableExists(asMigrateDb(db), "grin_local_receipts")) {
    migrateToV10(asMigrateDb(db));
  }
  db.runSync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [
    "schema_version",
    String(DB_VERSION),
  ]);
}

function seedV9Diary(db: GrinSqlDb): void {
  applyDiaryV9(db);
  db.runSync(
    `INSERT INTO entries_local (id, user_id, payload_json, sync_status, local_updated_at, remote_updated_at, version_number)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["v9_keep_1", "u_v9", JSON.stringify({ id: "v9_keep_1", title: "pre-v10 note" }), "pending", 1, null, 1]
  );
  db.runSync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ["schema_version", "9"]);
}

function assertV10(db: GrinSqlDb): void {
  assert.equal(tableExists(asMigrateDb(db), "grin_outbox_commands"), true);
  assert.equal(tableExists(asMigrateDb(db), "grin_local_receipts"), true);
  assert.equal(tableExists(asMigrateDb(db), "grin_owner_runtime"), true);
  assert.equal(grinV10TablesPresent(asMigrateDb(db)), true);
  const kept = db.getFirstSync<{ id: string; payload_json: string }>(
    "SELECT id, payload_json FROM entries_local WHERE id = ?",
    ["v9_keep_1"]
  );
  assert.equal(kept?.id, "v9_keep_1");
  assert.ok(kept?.payload_json.includes("pre-v10 note"));
  assert.equal(readSchemaVersion(db), 10);
  assert.equal(DB_VERSION, 10);
}

async function withHostFile(run: (db: HostSqlite) => void): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t3-v9-"));
  const dbPath = path.join(tmp, "diary-v9.sqlite");
  let db: HostSqlite | null = null;
  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    run(db);
  } finally {
    db?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const previousFlag = process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
  delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;

  console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
  console.log(`NATIVE_DEVICE=not_claimed`);
  console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

  try {
    assert.notEqual(process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED, "1");

    await withHostFile((db) => {
      seedV9Diary(db);
      assert.equal(readSchemaVersion(db), 9);
      assert.equal(tableExists(asMigrateDb(db), "grin_local_receipts"), false);
      assert.equal(tableExists(asMigrateDb(db), "grin_outbox_commands"), false);
      assert.equal(tableExists(asMigrateDb(db), "grin_owner_runtime"), false);
      applyInitV10Sequence(db);
      assertV10(db);

      db.execSync("DROP TABLE grin_local_receipts");
      assert.equal(tableExists(asMigrateDb(db), "grin_local_receipts"), false);
      assert.equal(readSchemaVersion(db), 10);
      applyInitV10Sequence(db);
      assertV10(db);
    });

    process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = "0";
    assert.notEqual(process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED, "1");
    await withHostFile((db) => {
      seedV9Diary(db);
      applyInitV10Sequence(db);
      assertV10(db);
    });
  } finally {
    if (previousFlag == null) delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
    else process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = previousFlag;
  }

  console.log("migrateGrin.v9Startup.sqliteHost.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
