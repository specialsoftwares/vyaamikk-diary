import assert from "node:assert/strict";

import { freezeCommand } from "../../src/goodsEvidence/command";
import { sampleLine, sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { GoodsEvidenceRegisterAdapter } from "./adapter";
import { adminDb, fixedClock, seedOwner, wrapAdminFirestore } from "./harness";
import { MAX_INPUT_DEPTH } from "./limits";
import { commandPath, receiptPath, serialPath } from "./paths";
import { MAX_ISSUED_SERIAL } from "./serial";

const OWNER = "owner_corr";
const LEDGER = "ledger_corr";
const NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);

function envelope(commandId: string, body = sampleRegisterBody(), ownerUid = OWNER, ledgerId = LEDGER) {
  const frozen = freezeCommand({
    commandId,
    type: "registerGoodsReceipt",
    ownerUid,
    ledgerId,
    body,
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
  const db = adminDb();
  const fs = wrapAdminFirestore(db);

  // A. Corrupt string nextSerial — zero writes, no duplicate number
  {
    await seedOwner(db, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    const first = await adapter.register(
      { uid: OWNER },
      envelope("commandc01", sampleRegisterBody({ receiptId: "receipt_c01" }))
    );
    assert.equal(first.ok, true);
    await db.doc(serialPath(OWNER, LEDGER, "FY2026-27")).set({
      fyToken: "FY2026-27",
      nextSerial: "2",
      lastIssuedSerial: 1,
    });
    const second = await adapter.register(
      { uid: OWNER },
      envelope("commandc02", sampleRegisterBody({ receiptId: "receipt_c02" }))
    );
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.code, "integrity");
    assert.equal((await db.doc(receiptPath(OWNER, LEDGER, "receipt_c02")).get()).exists, false);
    assert.equal((await db.doc(commandPath(OWNER, LEDGER, "commandc02")).get()).exists, false);
    const serial = await db.doc(serialPath(OWNER, LEDGER, "FY2026-27")).get();
    assert.equal(serial.data()?.nextSerial, "2");
    assert.equal((await db.doc(receiptPath(OWNER, LEDGER, "receipt_c01")).get()).exists, true);
  }

  // A. Missing nextSerial, fractional, inconsistent FY, exhaustion, valid next
  {
    await seedOwner(db, "owner_miss", "ledger_miss");
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    await db.doc(serialPath("owner_miss", "ledger_miss", "FY2026-27")).set({
      fyToken: "FY2026-27",
      lastIssuedSerial: 1,
    });
    const missing = await adapter.register(
      { uid: "owner_miss" },
      envelope("commandc03", sampleRegisterBody({ receiptId: "receipt_c03" }), "owner_miss", "ledger_miss")
    );
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "integrity");

    await seedOwner(db, "owner_frac", "ledger_frac");
    await db.doc(serialPath("owner_frac", "ledger_frac", "FY2026-27")).set({
      fyToken: "FY2026-27",
      nextSerial: 1.5,
      lastIssuedSerial: 1,
    });
    const frac = await adapter.register(
      { uid: "owner_frac" },
      envelope("commandc04", sampleRegisterBody({ receiptId: "receipt_c04" }), "owner_frac", "ledger_frac")
    );
    assert.equal(frac.ok, false);
    if (!frac.ok) assert.equal(frac.code, "integrity");

    await seedOwner(db, "owner_fyx", "ledger_fyx");
    await db.doc(serialPath("owner_fyx", "ledger_fyx", "FY2026-27")).set({
      fyToken: "FY2025-26",
      nextSerial: 2,
      lastIssuedSerial: 1,
    });
    const wrongFy = await adapter.register(
      { uid: "owner_fyx" },
      envelope("commandc05", sampleRegisterBody({ receiptId: "receipt_c05" }), "owner_fyx", "ledger_fyx")
    );
    assert.equal(wrongFy.ok, false);
    if (!wrongFy.ok) assert.equal(wrongFy.code, "integrity");

    await seedOwner(db, "owner_exh", "ledger_exh");
    await db.doc(serialPath("owner_exh", "ledger_exh", "FY2026-27")).set({
      fyToken: "FY2026-27",
      nextSerial: MAX_ISSUED_SERIAL + 1,
      lastIssuedSerial: MAX_ISSUED_SERIAL,
    });
    const exhausted = await adapter.register(
      { uid: "owner_exh" },
      envelope("commandc06", sampleRegisterBody({ receiptId: "receipt_c06" }), "owner_exh", "ledger_exh")
    );
    assert.equal(exhausted.ok, false);
    if (!exhausted.ok) assert.equal(exhausted.code, "serial_exhausted");

    await seedOwner(db, "owner_ok2", "ledger_ok2");
    const firstOk = await adapter.register(
      { uid: "owner_ok2" },
      envelope("commandc07a", sampleRegisterBody({ receiptId: "receipt_c07a" }), "owner_ok2", "ledger_ok2")
    );
    const secondOk = await adapter.register(
      { uid: "owner_ok2" },
      envelope("commandc07b", sampleRegisterBody({ receiptId: "receipt_c07b" }), "owner_ok2", "ledger_ok2")
    );
    assert.equal(firstOk.ok && secondOk.ok, true);
    if (firstOk.ok && secondOk.ok) {
      assert.equal(firstOk.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
      assert.equal(secondOk.issuedNumber, "GRIN/MAIN/FY2026-27/000002");
    }
  }

  // B. Line identities through Firestore JSON persistence
  {
    await seedOwner(db, "owner_line", "ledger_line");
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    const proto = await adapter.register(
      { uid: "owner_line" },
      envelope(
        "commandc08",
        sampleRegisterBody({ receiptId: "receipt_proto", lines: [sampleLine({ lineId: "__proto__" })] }),
        "owner_line",
        "ledger_line"
      )
    );
    assert.equal(proto.ok, false);
    if (!proto.ok) assert.equal(proto.code, "invalid");
    assert.equal((await db.doc(receiptPath("owner_line", "ledger_line", "receipt_proto")).get()).exists, false);

    const persisted = await adapter.register(
      { uid: "owner_line" },
      envelope(
        "commandc09",
        sampleRegisterBody({
          receiptId: "receipt_lines",
          lines: [
            sampleLine({ lineId: "line_1" }),
            sampleLine({ lineId: "toString", description: "Named toString" }),
          ],
        }),
        "owner_line",
        "ledger_line"
      )
    );
    assert.equal(persisted.ok, true);
    const snap = await db.doc(receiptPath("owner_line", "ledger_line", "receipt_lines")).get();
    const data = snap.data() as {
      original: { lines: { lineId: string; physicallyReceived: unknown }[] };
      lineLedgers: Record<string, { physicalReceived: unknown }>;
    };
    const roundTrip = JSON.parse(JSON.stringify(data)) as typeof data;
    assert.equal(Object.prototype.hasOwnProperty.call(roundTrip.lineLedgers, "line_1"), true);
    assert.equal(Object.prototype.hasOwnProperty.call(roundTrip.lineLedgers, "toString"), true);
    for (const line of roundTrip.original.lines) {
      assert.equal(Object.prototype.hasOwnProperty.call(roundTrip.lineLedgers, line.lineId), true);
      assert.deepEqual(roundTrip.lineLedgers[line.lineId]?.physicalReceived, line.physicallyReceived);
    }
  }

  // C. Malformed reconcile / deep nest leave no artifacts; later register works
  {
    await seedOwner(db, "owner_in", "ledger_in");
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    const first = await adapter.register(
      { uid: "owner_in" },
      envelope("commandc10", sampleRegisterBody({ receiptId: "receipt_in1" }), "owner_in", "ledger_in")
    );
    assert.equal(first.ok, true);
    const nullRec = await adapter.reconcile({ uid: "owner_in" }, null);
    assert.equal(nullRec.ok, false);
    if (!nullRec.ok) assert.equal(nullRec.code, "invalid");
    const rec = await adapter.reconcile({ uid: "owner_in" }, { ledgerId: "ledger_in", commandId: "commandc10" });
    assert.equal(rec.ok, true);

    let deep: unknown = { leaf: true };
    for (let i = 0; i < MAX_INPUT_DEPTH + 8; i++) deep = { nested: deep };
    const deepResult = await adapter.register({ uid: "owner_in" }, {
      commandId: "commandc11",
      type: "registerGoodsReceipt",
      ownerUid: "owner_in",
      ledgerId: "ledger_in",
      body: deep,
    });
    assert.equal(deepResult.ok, false);
    if (!deepResult.ok) assert.equal(deepResult.code, "invalid");
    assert.equal((await db.doc(receiptPath("owner_in", "ledger_in", "receipt_in2")).get()).exists, false);

    const later = await adapter.register(
      { uid: "owner_in" },
      envelope("commandc12", sampleRegisterBody({ receiptId: "receipt_in2" }), "owner_in", "ledger_in")
    );
    assert.equal(later.ok, true);
  }

  console.log("tools/goods-evidence-emulator/corrections.emulator.test.ts: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
