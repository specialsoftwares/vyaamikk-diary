/**
 * SQLITE_HOST: v9 diary file through the production initializer / orchestrator.
 * Does not copy applyInitV10Sequence. Host reopen is not NATIVE_DEVICE process-death proof.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { applyPendingLocalMigrations, initializeLocalDatabase, resetLocalDatabaseInitStateForStartup } from "./init";
import { closeLocalDatabaseForTests, setLocalDatabaseForTests } from "./database";
import { execStatements, migrateToV7, migrateToV8, migrateToV9, tableExists, tableHasColumn } from "./migrate";
import { GRIN_V10_INDEXES, grinV10TablesPresent } from "./migrateGrin";
import { DB_VERSION, MIGRATIONS_V1 } from "./schema";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";
import type { GrinSqlDb } from "@/services/grin/outbox/hostSqlite";
import { isGoodsEvidenceEnabled } from "@/goodsEvidence/featureFlag";

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

function indexExists(db: GrinSqlDb, name: string): boolean {
  const row = db.getFirstSync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
    [name]
  );
  return Boolean(row?.name);
}

function seedV9Diary(db: GrinSqlDb): void {
  applyDiaryV9(db);
  db.runSync(
    `INSERT INTO entries_local (id, user_id, payload_json, sync_status, local_updated_at, remote_updated_at, version_number)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["v9_keep_1", "u_v9", JSON.stringify({ id: "v9_keep_1", title: "pre-v10 note" }), "pending", 1, null, 1]
  );
  db.runSync(
    `INSERT INTO sync_queue (id, user_id, op, entity, entity_id, payload_json, created_at, attempts, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
    ["v9_sync_1", "u_v9", "create", "entry", "v9_keep_1", "{\"id\":\"v9_keep_1\"}", 1]
  );
  db.runSync(
    `INSERT INTO form_drafts (id, user_id, draft_kind, scope_key, entry_id, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["v9_draft_1", "u_v9", "note", "scope", null, "{\"kept\":true}", 1]
  );
  db.runSync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ["schema_version", "9"]);
}

function assertDiaryPreserved(db: GrinSqlDb): void {
  const kept = db.getFirstSync<{ id: string; payload_json: string }>(
    "SELECT id, payload_json FROM entries_local WHERE id = ?",
    ["v9_keep_1"]
  );
  assert.equal(kept?.id, "v9_keep_1");
  assert.ok(kept?.payload_json.includes("pre-v10 note"));
  const queue = db.getFirstSync<{ entity_id: string }>("SELECT entity_id FROM sync_queue WHERE id = ?", ["v9_sync_1"]);
  assert.equal(queue?.entity_id, "v9_keep_1");
  const draft = db.getFirstSync<{ id: string }>("SELECT id FROM form_drafts WHERE id = ?", ["v9_draft_1"]);
  assert.equal(draft?.id, "v9_draft_1");
}

function assertRequiredGrinV10(db: GrinSqlDb): void {
  const migrateDb = asMigrateDb(db);
  assert.equal(tableExists(migrateDb, "grin_local_receipts"), true);
  assert.equal(tableExists(migrateDb, "grin_outbox_commands"), true);
  assert.equal(tableExists(migrateDb, "grin_owner_runtime"), true);
  assert.equal(tableExists(migrateDb, "grin_local_evidence_files"), true);
  assert.equal(tableHasColumn(migrateDb, "grin_local_evidence_files", "category"), true);
  assert.equal(tableHasColumn(migrateDb, "grin_outbox_commands", "lease_attempt_id"), true);
  for (const name of GRIN_V10_INDEXES) {
    assert.equal(indexExists(db, name), true, `missing index ${name}`);
  }
  assert.equal(grinV10TablesPresent(migrateDb), true);
  assert.equal(readSchemaVersion(db), 10);
  assert.equal(DB_VERSION, 10);
  assertDiaryPreserved(db);
}

async function withHostFile(run: (db: HostSqlite, dbPath: string) => Promise<void> | void): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t3-v9-"));
  const dbPath = path.join(tmp, "diary-v9.sqlite");
  let db: HostSqlite | null = null;
  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    await run(db, dbPath);
  } finally {
    resetLocalDatabaseInitStateForStartup();
    closeLocalDatabaseForTests();
    db?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function runProductionInit(db: HostSqlite): Promise<void> {
  resetLocalDatabaseInitStateForStartup();
  setLocalDatabaseForTests(db);
  await initializeLocalDatabase();
}

async function main(): Promise<void> {
  const previousFlag = process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
  delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;

  console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
  console.log(`NATIVE_DEVICE=not_claimed`);
  console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

  try {
    assert.notEqual(process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED, "1");
    assert.equal(isGoodsEvidenceEnabled(), false);

    await withHostFile(async (db, dbPath) => {
      seedV9Diary(db);
      assert.equal(readSchemaVersion(db), 9);
      assert.equal(grinV10TablesPresent(asMigrateDb(db)), false);
      assert.equal(tableExists(asMigrateDb(db), "grin_local_receipts"), false);
      assert.equal(tableExists(asMigrateDb(db), "grin_outbox_commands"), false);
      assert.equal(tableExists(asMigrateDb(db), "grin_owner_runtime"), false);
      assert.equal(tableExists(asMigrateDb(db), "grin_local_evidence_files"), false);

      await runProductionInit(db);
      assertRequiredGrinV10(db);

      applyPendingLocalMigrations(asMigrateDb(db));
      assertRequiredGrinV10(db);

      db.close();
      closeLocalDatabaseForTests();
      resetLocalDatabaseInitStateForStartup();
      const reopened = openHostSqlite(dbPath);
      try {
        assert.equal(reopened.executionLabel, SQLITE_HOST);
        await runProductionInit(reopened);
        assertRequiredGrinV10(reopened);
      } finally {
        reopened.close();
        closeLocalDatabaseForTests();
        resetLocalDatabaseInitStateForStartup();
      }
    });

    await withHostFile(async (db) => {
      seedV9Diary(db);
      db.execSync(`
        CREATE TABLE IF NOT EXISTS grin_local_receipts (
          id TEXT PRIMARY KEY NOT NULL,
          owner_uid TEXT NOT NULL,
          ledger_id TEXT NOT NULL,
          receipt_id TEXT NOT NULL,
          command_id TEXT NOT NULL,
          digest TEXT,
          local_state TEXT NOT NULL,
          issued_number TEXT,
          server_registered_at_utc TEXT,
          dispatch_generation INTEGER NOT NULL DEFAULT 0,
          payload_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      assert.equal(readSchemaVersion(db), 9);
      assert.equal(grinV10TablesPresent(asMigrateDb(db)), false);
      applyPendingLocalMigrations(asMigrateDb(db));
      assertRequiredGrinV10(db);
    });

    await withHostFile(async (db) => {
      seedV9Diary(db);
      applyPendingLocalMigrations(asMigrateDb(db));
      assertRequiredGrinV10(db);
      db.execSync("DROP TABLE grin_owner_runtime");
      db.execSync("DROP INDEX IF EXISTS idx_grin_outbox_dispatch");
      assert.equal(grinV10TablesPresent(asMigrateDb(db)), false);
      assert.equal(readSchemaVersion(db), 10);
      applyPendingLocalMigrations(asMigrateDb(db));
      assertRequiredGrinV10(db);
    });

    await withHostFile(async (db) => {
      seedV9Diary(db);
      applyPendingLocalMigrations(asMigrateDb(db));
      db.execSync("DROP TABLE grin_local_evidence_files");
      db.execSync(`
        CREATE TABLE grin_local_evidence_files (
          id TEXT PRIMARY KEY NOT NULL,
          owner_uid TEXT NOT NULL,
          ledger_id TEXT NOT NULL,
          receipt_id TEXT NOT NULL,
          evidence_id TEXT NOT NULL,
          role TEXT NOT NULL,
          local_path TEXT NOT NULL,
          claimed_sha256 TEXT,
          byte_size INTEGER,
          upload_state TEXT NOT NULL,
          original_durable INTEGER NOT NULL DEFAULT 0,
          retain_local INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      assert.equal(tableHasColumn(asMigrateDb(db), "grin_local_evidence_files", "category"), false);
      assert.equal(grinV10TablesPresent(asMigrateDb(db)), false);
      applyPendingLocalMigrations(asMigrateDb(db));
      assert.equal(tableHasColumn(asMigrateDb(db), "grin_local_evidence_files", "category"), true);
      assertRequiredGrinV10(db);
    });

    process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = "0";
    assert.notEqual(process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED, "1");
    assert.equal(isGoodsEvidenceEnabled(), false);
    await withHostFile(async (db) => {
      seedV9Diary(db);
      await runProductionInit(db);
      assertRequiredGrinV10(db);
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
