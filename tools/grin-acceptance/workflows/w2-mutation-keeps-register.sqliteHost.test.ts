/**
 * Coordinator e94b78c glue: persistMutationAndQueue must not overwrite register payload_json.
 * SQLITE_HOST. Not NATIVE_DEVICE.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { createFakeGrinServerPort } from "@/services/grin/outbox/fakePorts";
import { openHostSqlite, SQLITE_HOST } from "@/services/grin/outbox/hostSqlite";
import { GrinOutbox } from "@/services/grin/outbox/outbox";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t5-mut-"));
  const db = openHostSqlite(path.join(tmp, "mut.sqlite"));
  try {
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);
    const box = new GrinOutbox({ db, server: createFakeGrinServerPort({ mutate: true }) });
    box.ensureSchema();
    const session = box.beginOwnerSession("owner_mut");
    const registerBody = sampleRegisterBody({ receiptId: "grcp_keep_reg" });
    box.persistDraftAndQueue(session, {
      ledgerId: "ledger_1",
      receiptId: "grcp_keep_reg",
      commandId: "gcmd_keep_reg",
      body: registerBody,
    });
    const before = db.getFirstSync<{ payload_json: string }>(
      `SELECT payload_json FROM grin_local_receipts WHERE owner_uid = ? AND receipt_id = ?`,
      ["owner_mut", "grcp_keep_reg"]
    );
    assert.ok(before?.payload_json.includes("grcp_keep_reg"));
    box.persistMutationAndQueue(session, {
      ledgerId: "ledger_1",
      receiptId: "grcp_keep_reg",
      type: "amendFields",
      commandId: "gcmd_keep_amend",
      body: { receiptId: "grcp_keep_reg", expectedVersion: 0, reason: "keep original", changes: { warehouse: { kind: "present", value: "Bay Q" } } },
    });
    const after = db.getFirstSync<{ payload_json: string }>(
      `SELECT payload_json FROM grin_local_receipts WHERE owner_uid = ? AND receipt_id = ?`,
      ["owner_mut", "grcp_keep_reg"]
    );
    assert.equal(after?.payload_json, before?.payload_json);
    const queuedMut = db.getFirstSync<{ frozen_payload_json: string }>(
      `SELECT frozen_payload_json FROM grin_outbox_commands WHERE command_id = ?`,
      ["gcmd_keep_amend"]
    );
    assert.ok(queuedMut?.frozen_payload_json.includes("Bay Q"));
    assert.doesNotMatch(after?.payload_json ?? "", /Bay Q/);
    console.log("w2-mutation-keeps-register.sqliteHost.test.ts: ok (SQLITE_HOST; not a matrix pass)");
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
