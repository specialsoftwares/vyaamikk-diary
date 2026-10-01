/**
 * CS-03 QA slice: SQLITE_HOST outbox owner isolation (no cross-owner list/dispatch).
 * Not STORAGE_EMULATOR, not UI export, not NATIVE_DEVICE account-switch.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { execStatements, migrateToV7, migrateToV8, migrateToV9 } from "@/localDb/migrate";
import { migrateToV10 } from "@/localDb/migrateGrin";
import { MIGRATIONS_V1 } from "@/localDb/schema";
import { createFakeEvidenceUploadPort, createFakeGrinServerPort } from "@/services/grin/outbox/fakePorts";
import { openHostSqlite, SQLITE_HOST, type GrinSqlDb, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { GrinOutbox } from "@/services/grin/outbox/outbox";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";

import { logWorkflowExecution } from "../workflowEvidence";

function asMigrateDb(db: GrinSqlDb): Parameters<typeof migrateToV9>[0] {
  return db as unknown as Parameters<typeof migrateToV9>[0];
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t5-cs03-"));
  const dbPath = path.join(tmp, "cs03.sqlite");
  let db: HostSqlite | null = null;
  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);
    execStatements(asMigrateDb(db), MIGRATIONS_V1, "v1");
    migrateToV7(asMigrateDb(db));
    migrateToV8(asMigrateDb(db));
    migrateToV9(asMigrateDb(db));
    migrateToV10(asMigrateDb(db));
    const server = createFakeGrinServerPort();
    const evidence = createFakeEvidenceUploadPort();
    const box = new GrinOutbox({ db, server, evidence, maxAttempts: 2 });
    const sessionA = box.beginOwnerSession("owner_a");
    box.persistDraftAndQueue(sessionA, {
      ledgerId: "ledger_1",
      receiptId: "grcp_cs03_a",
      commandId: "gcmd_cs03_a",
      body: sampleRegisterBody({ receiptId: "grcp_cs03_a" }),
    });
    const sessionB = box.beginOwnerSession("owner_b");
    assert.equal(box.listForOwner("owner_b").length, 0);
    assert.equal(box.getRecord("owner_b", "ledger_1", "grcp_cs03_a"), null);
    const bFlush = await box.dispatchDue(sessionB, "worker_b");
    assert.equal(bFlush.processed, 0);
    assert.equal(server.serialsIssued, 0);
    const aFlush = await box.dispatchDue(sessionA, "worker_a");
    const issued = aFlush.results.find((r) => r.commandId === "gcmd_cs03_a");
    assert.equal(issued?.localState, "issued");
    assert.equal(box.getRecord("owner_a", "ledger_1", "grcp_cs03_a")?.ownerUid, "owner_a");
    assert.equal(box.getRecord("owner_b", "ledger_1", "grcp_cs03_a"), null);
    logWorkflowExecution("CS-03", ["SQLITE_HOST"]);
  } finally {
    db?.close();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
