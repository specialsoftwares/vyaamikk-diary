/**
 * ER-4 Team 5 QA: SQLITE_HOST v9→v10 startup with GRIN admission off.
 * Calls production applyPendingLocalMigrations / initializeLocalDatabase.
 * Does not copy applyInitV10Sequence. Not NATIVE_DEVICE. Not a CS-01 combined workflow.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isGoodsEvidenceEnabled } from "@/goodsEvidence/featureFlag";
import { closeLocalDatabaseForTests, setLocalDatabaseForTests } from "@/localDb/database";
import { applyPendingLocalMigrations, initializeLocalDatabase, resetLocalDatabaseInitStateForStartup } from "@/localDb/init";
import { execStatements, migrateToV7, migrateToV8, migrateToV9, tableExists, tableHasColumn } from "@/localDb/migrate";
import { GRIN_V10_INDEXES, grinV10TablesPresent } from "@/localDb/migrateGrin";
import { DB_VERSION, MIGRATIONS_V1 } from "@/localDb/schema";
import { openHostSqlite, SQLITE_HOST, type GrinSqlDb, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";

function asMigrateDb(db: GrinSqlDb): Parameters<typeof migrateToV9>[0] {
  return db as unknown as Parameters<typeof migrateToV9>[0];
}

function applyDiaryV9(db: GrinSqlDb): void {
  execStatements(asMigrateDb(db), MIGRATIONS_V1, "v1");
  migrateToV7(asMigrateDb(db));
  migrateToV8(asMigrateDb(db));
  migrateToV9(asMigrateDb(db));
}

function readSchemaVersion(database: GrinSqlDb): number {
  const row = database.getFirstSync<{ value: string }>("SELECT value FROM meta WHERE key = ?", ["schema_version"]);
  return row ? parseInt(row.value, 10) || 1 : 1;
}

function indexExists(db: GrinSqlDb, name: string): boolean {
  const row = db.getFirstSync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
    [name]
  );
  return Boolean(row?.name);
}

function seedV9Diary(db: GrinSqlDb, entryId: string): void {
  applyDiaryV9(db);
  db.runSync(
    `INSERT INTO entries_local (id, user_id, payload_json, sync_status, local_updated_at, remote_updated_at, version_number)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [entryId, "u_er4", JSON.stringify({ id: entryId, title: "ER-4 diary keep" }), "pending", 1, null, 1]
  );
  db.runSync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ["schema_version", "9"]);
}

function assertRequiredGrinV10(db: GrinSqlDb, diaryId: string): void {
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
  const kept = db.getFirstSync<{ id: string; payload_json: string }>(
    "SELECT id, payload_json FROM entries_local WHERE id = ?",
    [diaryId]
  );
  assert.equal(kept?.id, diaryId);
  assert.ok(kept?.payload_json.includes("ER-4 diary keep"));
}

async function runProductionInit(db: HostSqlite): Promise<void> {
  resetLocalDatabaseInitStateForStartup();
  setLocalDatabaseForTests(db);
  await initializeLocalDatabase();
}

async function main(): Promise<void> {
  delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
  assert.notEqual(process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED, "1");
  assert.equal(isGoodsEvidenceEnabled(), false);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t5-er4-"));
  const dbPath = path.join(tmp, "v9-startup.sqlite");
  const repairPath = path.join(tmp, "v10-repair.sqlite");
  let db: HostSqlite | null = null;
  let repair: HostSqlite | null = null;

  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    seedV9Diary(db, "keep_er4_diary");
    assert.equal(readSchemaVersion(db), 9);
    assert.equal(grinV10TablesPresent(asMigrateDb(db)), false);
    assert.equal(tableExists(asMigrateDb(db), "grin_local_receipts"), false);

    await runProductionInit(db);
    assertRequiredGrinV10(db, "keep_er4_diary");
    applyPendingLocalMigrations(asMigrateDb(db));
    assertRequiredGrinV10(db, "keep_er4_diary");
    assert.notEqual(process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED, "1");
    assert.equal(isGoodsEvidenceEnabled(), false);

    repair = openHostSqlite(repairPath);
    seedV9Diary(repair, "keep_er4_repair");
    repair.runSync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ["schema_version", "10"]);
    assert.equal(readSchemaVersion(repair), 10);
    assert.equal(tableExists(asMigrateDb(repair), "grin_local_receipts"), false);
    applyPendingLocalMigrations(asMigrateDb(repair));
    assertRequiredGrinV10(repair, "keep_er4_repair");
    assert.equal(isGoodsEvidenceEnabled(), false);

    db.execSync("DROP TABLE grin_outbox_commands");
    assert.equal(grinV10TablesPresent(asMigrateDb(db)), false);
    applyPendingLocalMigrations(asMigrateDb(db));
    assertRequiredGrinV10(db, "keep_er4_diary");
    assert.equal(isGoodsEvidenceEnabled(), false);

    console.log("tools/grin-acceptance/startup/v9-v10-grin-off.sqliteHost.test.ts: ok");
  } finally {
    resetLocalDatabaseInitStateForStartup();
    closeLocalDatabaseForTests();
    db?.close();
    repair?.close();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
