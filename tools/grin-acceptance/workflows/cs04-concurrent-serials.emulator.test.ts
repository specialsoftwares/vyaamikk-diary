/**
 * CS-04 FIRESTORE_EMULATOR concurrent serials. Run only under
 * firebase emulators:exec (FIRESTORE_EMULATOR_HOST set). Not a G6 pass.
 */
import assert from "node:assert/strict";

import { freezeCommand } from "@/goodsEvidence/command";
import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";

import { GoodsEvidenceRegisterAdapter } from "../../goods-evidence-emulator/adapter";
import {
  adminDb,
  makeReadBarrier,
  mutableClock,
  seedOwner,
  wrapAdminFirestore,
} from "../../goods-evidence-emulator/harness";
import { serialPath } from "../../goods-evidence-emulator/paths";
import { logWorkflowExecution } from "../workflowEvidence";

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);

function envelope(commandId: string, receiptId: string, ownerUid: string, ledgerId: string) {
  const frozen = freezeCommand({
    commandId,
    type: "registerGoodsReceipt",
    ownerUid,
    ledgerId,
    body: sampleRegisterBody({ receiptId }),
  });
  return {
    commandId: frozen.commandId,
    type: frozen.type,
    ownerUid: frozen.ownerUid,
    ledgerId: frozen.ledgerId,
    body: frozen.body,
    digest: frozen.digest,
  };
}

async function main(): Promise<void> {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.log("CS-04 emulator skipped: FIRESTORE_EMULATOR_HOST unset");
    return;
  }
  const db = adminDb();
  const fs = wrapAdminFirestore(db);
  await seedOwner(db, "owner_cs04e", "ledger_cs04e");
  const clock = mutableClock(NOW);
  const barrier = makeReadBarrier(2);
  const a = new GoodsEvidenceRegisterAdapter(fs, clock, { afterReads: barrier });
  const b = new GoodsEvidenceRegisterAdapter(fs, clock, { afterReads: barrier });
  const [ra, rb] = await Promise.all([
    a.register(
      { uid: "owner_cs04e" },
      envelope("command_cs04ea", "receipt_cs04ea", "owner_cs04e", "ledger_cs04e")
    ),
    b.register(
      { uid: "owner_cs04e" },
      envelope("command_cs04eb", "receipt_cs04eb", "owner_cs04e", "ledger_cs04e")
    ),
  ]);
  assert.equal(ra.ok && rb.ok, true);
  if (!ra.ok || !rb.ok) throw new Error("expected two serials");
  const issued = [ra.issuedNumber, rb.issuedNumber].sort();
  assert.deepEqual(issued, ["GRIN/MAIN/FY2026-27/000001", "GRIN/MAIN/FY2026-27/000002"]);
  const serial = await db.doc(serialPath("owner_cs04e", "ledger_cs04e", "FY2026-27")).get();
  assert.equal(serial.data()?.lastIssuedSerial, 2);
  logWorkflowExecution("CS-04", ["FIRESTORE_EMULATOR"]);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
