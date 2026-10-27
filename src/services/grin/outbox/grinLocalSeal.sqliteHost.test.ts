/**
 * GRIN local bodies use the account payload seal.
 * Legacy plaintext still opens. Another account's key does not.
 */
import assert from "node:assert/strict";
import { randomFillSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { execStatements, migrateToV7, migrateToV8, migrateToV9 } from "@/localDb/migrate";
import { migrateToV10 } from "@/localDb/migrateGrin";
import { MIGRATIONS_V1 } from "@/localDb/schema";
import { __setNativeSecureRandomForTests } from "@/services/accountDeletion/nativeSecureRandom";
import {
  bindLocalDataKey,
  migrateGrinOwnedPayloads,
  readOwnedJson,
  requireSealedLocalPayloadForTests,
  unbindLocalDataKey,
} from "@/services/accountDeletion/localPayload";
import { openHostSqlite, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { GrinOutbox } from "@/services/grin/outbox/outbox";
import { createFakeGrinServerPort } from "@/services/grin/outbox/fakePorts";
import type { GrinSqlDb } from "@/services/grin/outbox/hostSqlite";

function asMigrateDb(db: GrinSqlDb): Parameters<typeof migrateToV9>[0] {
  return db as unknown as Parameters<typeof migrateToV9>[0];
}

async function main(): Promise<void> {
  __setNativeSecureRandomForTests((length) => {
    const bytes = new Uint8Array(length);
    randomFillSync(bytes);
    return bytes;
  });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-seal-"));
  const dbPath = path.join(tmp, "grin-seal.sqlite");
  const db: HostSqlite = openHostSqlite(dbPath);
  try {
    execStatements(asMigrateDb(db), MIGRATIONS_V1, "v1");
    migrateToV7(asMigrateDb(db));
    migrateToV8(asMigrateDb(db));
    migrateToV9(asMigrateDb(db));
    migrateToV10(asMigrateDb(db));
    requireSealedLocalPayloadForTests();
    const key = new Uint8Array(32).fill(9);
    bindLocalDataKey("owner_a", key);
    const box = new GrinOutbox({ db, server: createFakeGrinServerPort() });
    const session = box.beginOwnerSession("owner_a");
    const queued = box.persistDraftAndQueue(session, {
      ledgerId: "ledger_1",
      receiptId: "grcp_seal_1",
      commandId: "gcmd_seal_01",
      body: sampleRegisterBody({
        receiptId: "grcp_seal_1",
        remarks: { kind: "present", value: "sealed yard note" },
      }),
    });
    assert.equal(queued.localState, "queued");
    const stored = db.getFirstSync<{ payload_json: string; frozen_payload_json: string }>(
      `SELECT receipts.payload_json AS payload_json, commands.frozen_payload_json AS frozen_payload_json
         FROM grin_local_receipts receipts
         JOIN grin_outbox_commands commands
           ON commands.owner_uid = receipts.owner_uid
          AND commands.command_id = receipts.command_id
        WHERE receipts.owner_uid = ? AND receipts.receipt_id = ?`,
      ["owner_a", "grcp_seal_1"]
    );
    assert.equal(stored?.payload_json.startsWith("vyd1:"), true);
    assert.equal(stored?.frozen_payload_json.startsWith("vyd1:"), true);
    assert.equal(stored?.payload_json.includes("sealed yard note"), false);
    const opened = readOwnedJson("owner_a", stored!.payload_json) as {
      remarks?: { value?: string };
    };
    assert.equal(opened.remarks?.value, "sealed yard note");

    db.runSync(
      `UPDATE grin_local_receipts SET payload_json = ? WHERE owner_uid = ? AND receipt_id = ?`,
      [JSON.stringify({ remarks: { value: "legacy note" } }), "owner_a", "grcp_seal_1"]
    );
    const legacy = readOwnedJson(
      "owner_a",
      db.getFirstSync<{ payload_json: string }>(
        "SELECT payload_json FROM grin_local_receipts WHERE owner_uid = ? AND receipt_id = ?",
        ["owner_a", "grcp_seal_1"]
      )!.payload_json
    ) as { remarks?: { value?: string } };
    assert.equal(legacy.remarks?.value, "legacy note");
    const migrated = migrateGrinOwnedPayloads(db, "owner_a");
    assert.equal(migrated.sealed >= 1, true);
    const resealed = db.getFirstSync<{ payload_json: string }>(
      "SELECT payload_json FROM grin_local_receipts WHERE owner_uid = ? AND receipt_id = ?",
      ["owner_a", "grcp_seal_1"]
    );
    assert.equal(resealed?.payload_json.startsWith("vyd1:"), true);
    assert.equal(resealed?.payload_json.includes("legacy note"), false);

    unbindLocalDataKey("owner_a");
    bindLocalDataKey("owner_b", new Uint8Array(32).fill(4));
    assert.throws(() => readOwnedJson("owner_b", resealed!.payload_json));
  } finally {
    unbindLocalDataKey("owner_a");
    unbindLocalDataKey("owner_b");
    requireSealedLocalPayloadForTests();
    __setNativeSecureRandomForTests(null);
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log("grin local seal passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
