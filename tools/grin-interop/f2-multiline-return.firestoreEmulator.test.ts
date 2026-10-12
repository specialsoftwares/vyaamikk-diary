/**
 * Joined user path: production dispatchReturnSequence (no test drain) through
 * SQLite/outbox and GoodsEvidenceRegisterAdapter on the Firestore emulator.
 *
 * One Save-equivalent call confirms two return lines, including one lost
 * mutate response reconciled by the outbox. A later intent returns again.
 *
 * Evidence labels: FIRESTORE_EMULATOR + SQLITE_HOST. Not NATIVE_DEVICE.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sampleLine, sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { quantity } from "@/goodsEvidence/quantities";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { GrinOutbox } from "@/services/grin/outbox/outbox";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";
import { GrinApplicationRepository } from "@/services/grin/repository/GrinApplicationRepository";
import { resetGrinMutationFlightForTests } from "@/services/grin/repository/grinMutationFlight";

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0, 0);
const OWNER = "owner_mlret_emu";
const LEDGER = "primary";
const RECEIPT = "grcp_mlret_emu_1";

async function main(): Promise<void> {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST required");
  }
  const { adminDb, fixedClock, resetAdmin, seedOwner, wrapAdminFirestore } = await import(
    "../goods-evidence-emulator/harness"
  );
  const { GoodsEvidenceRegisterAdapter } = await import("../goods-evidence-emulator/adapter");
  const { createInjectedGrinServerPort } = await import("../goods-evidence-emulator/serverPort");

  await resetAdmin();
  const db = adminDb();
  await seedOwner(db, OWNER, LEDGER);
  const adapter = new GoodsEvidenceRegisterAdapter(wrapAdminFirestore(db), fixedClock(NOW));
  const port = createInjectedGrinServerPort(adapter);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-mlret-emu-"));
  const sqlite = openHostSqlite(path.join(tmp, "emu.sqlite"));
  resetGrinMutationFlightForTests();
  let dropped = false;
  const originalMutate = port.mutate.bind(port);
  port.mutate = async (input) => {
    const result = await originalMutate(input);
    if (!dropped && input.envelope.type === "dispatchReturn") {
      dropped = true;
      const err = new Error("lost_server_response");
      (err as { code?: string }).code = "network_ambiguous";
      throw err;
    }
    return result;
  };

  try {
    assert.equal(sqlite.executionLabel, SQLITE_HOST);
    console.log("EVIDENCE=FIRESTORE_EMULATOR");
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log("ADAPTER=GoodsEvidenceRegisterAdapter");
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    const box = new GrinOutbox({ db: sqlite, server: port });
    box.ensureSchema();
    const session = box.beginOwnerSession(OWNER);
    const repo = new GrinApplicationRepository({
      outbox: box,
      db: sqlite,
      ownerUid: OWNER,
      ledgerId: LEDGER,
      session,
    });

    repo.createQueued(
      sampleRegisterBody({
        receiptId: RECEIPT,
        lines: [
          sampleLine({ lineId: "line_1", physicallyReceived: quantity("10", "bags") }),
          sampleLine({ lineId: "line_2", physicallyReceived: quantity("6", "bags") }),
        ],
      })
    );
    const registered = await box.dispatchDue(session, "worker_mlret_emu_register");
    assert.equal(registered.results.some((row) => row.localState === "issued"), true);
    const before = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    assert.ok(before);
    assert.equal(before.eventVersion, 1);
    const originalJson = JSON.stringify(before.original);

    const plan = await repo.dispatchReturnSequence({
      receiptId: RECEIPT,
      reason: "two line emulator return",
      intentId: "gint_emu_two",
      lines: [
        { lineId: "line_1", returnQty: quantity("3", "bags") },
        { lineId: "line_2", returnQty: quantity("1", "bags") },
      ],
    });
    assert.equal(dropped, true, "first return response must be dropped after commit");
    assert.equal(plan.lines[0]?.status, "confirmed");
    assert.equal(plan.lines[1]?.status, "confirmed");
    assert.notEqual(plan.lines[0]?.commandId, plan.lines[1]?.commandId);
    const after = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    assert.ok(after);
    assert.equal(after.eventVersion, 3);
    assert.equal(JSON.stringify(after.original), originalJson);
    const returnCmds = box.listCommandsForReceipt(OWNER, LEDGER, RECEIPT).filter(
      (row) => row.commandType === "dispatchReturn"
    );
    assert.equal(returnCmds.length, 2);
    assert.equal(returnCmds.every((row) => row.localState === "issued"), true);

    const later = await repo.dispatchReturnSequence({
      receiptId: RECEIPT,
      reason: "second independent return",
      intentId: "gint_emu_later",
      lines: [{ lineId: "line_1", returnQty: quantity("1", "bags") }],
    });
    assert.equal(later.lines[0]?.status, "confirmed");
    assert.notEqual(later.lines[0]?.commandId, plan.lines[0]?.commandId);
    assert.equal(box.getConfirmedProjection(OWNER, LEDGER, RECEIPT)?.eventVersion, 4);
    assert.equal(
      JSON.stringify(box.getConfirmedProjection(OWNER, LEDGER, RECEIPT)?.original),
      originalJson
    );

    console.log("f2-multiline-return.firestoreEmulator.test.ts FIRESTORE_EMULATOR+SQLITE_HOST: ok");
  } finally {
    sqlite.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    resetGrinMutationFlightForTests();
    await resetAdmin();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
