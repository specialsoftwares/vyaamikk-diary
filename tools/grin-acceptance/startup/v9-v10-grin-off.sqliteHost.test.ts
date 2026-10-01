/**
 * ER-4 Team 5 QA: SQLITE_HOST v9→v10 startup with GRIN admission off.
 * Does not edit migrateGrin.ts / outbox.ts / init.ts.
 * Not NATIVE_DEVICE. Not a CS-01 combined workflow.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isGoodsEvidenceEnabled } from "@/goodsEvidence/featureFlag";
import { execStatements, migrateToV7, migrateToV8, migrateToV9, tableExists } from "@/localDb/migrate";
import { grinV10TablesPresent, migrateToV10 } from "@/localDb/migrateGrin";
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
  const row = database.getFirstSync<{ value: string }>(
    "SELECT value FROM meta WHERE key = ?",
    ["schema_version"]
  );
  return row ? parseInt(row.value, 10) || 1 : 1;
}

/** Same v10 sequence `src/localDb/init.ts` uses after the v9 block. */
function applyInitV10Sequence(database: GrinSqlDb): void {
  let version = readSchemaVersion(database);
  if (version < 10) {
    migrateToV10(asMigrateDb(database));
    version = 10;
  }
  if (version >= 10 && !tableExists(asMigrateDb(database), "grin_local_receipts")) {
    migrateToV10(asMigrateDb(database));
  }
  database.runSync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [
    "schema_version",
    String(DB_VERSION),
  ]);
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

    applyInitV10Sequence(db);

    assert.equal(readSchemaVersion(db), 10);
    assert.equal(DB_VERSION, 10);
    assert.equal(grinV10TablesPresent(asMigrateDb(db)), true);
    const kept = db.getFirstSync<{ id: string; payload_json: string }>(
      "SELECT id, payload_json FROM entries_local WHERE id = ?",
      ["keep_er4_diary"]
    );
    assert.equal(kept?.id, "keep_er4_diary");
    assert.ok(kept?.payload_json.includes("ER-4 diary keep"));
    assert.notEqual(process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED, "1");
    assert.equal(isGoodsEvidenceEnabled(), false);

    repair = openHostSqlite(repairPath);
    seedV9Diary(repair, "keep_er4_repair");
    repair.runSync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ["schema_version", "10"]);
    assert.equal(readSchemaVersion(repair), 10);
    assert.equal(tableExists(asMigrateDb(repair), "grin_local_receipts"), false);
    applyInitV10Sequence(repair);
    assert.equal(grinV10TablesPresent(asMigrateDb(repair)), true);
    const repairedDiary = repair.getFirstSync<{ id: string }>(
      "SELECT id FROM entries_local WHERE id = ?",
      ["keep_er4_repair"]
    );
    assert.equal(repairedDiary?.id, "keep_er4_repair");
    assert.equal(isGoodsEvidenceEnabled(), false);

    console.log("tools/grin-acceptance/startup/v9-v10-grin-off.sqliteHost.test.ts: ok");
  } finally {
    db?.close();
    repair?.close();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
