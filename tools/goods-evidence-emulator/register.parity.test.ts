import assert from "node:assert/strict";

import { freezeCommand } from "../../src/goodsEvidence/command";
import { InMemoryGoodsLedger } from "../../src/goodsEvidence/ledger";
import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { GoodsEvidenceRegisterAdapter } from "./adapter";
import { adminDb, fixedClock, seedOwner, wrapAdminFirestore } from "./harness";
import { eventPath, receiptPath } from "./paths";

const OWNER = "owner_parity";
const LEDGER = "ledger_parity";
const NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);

function stripPersistence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPersistence);
  if (value != null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === "firestoreCommitTime") continue;
      out[key] = stripPersistence(nested);
    }
    return out;
  }
  return value;
}

async function main(): Promise<void> {
  const db = adminDb();
  const fs = wrapAdminFirestore(db);
  await seedOwner(db, OWNER, LEDGER);

  const memoryClock = fixedClock(NOW);
  const adapterClock = fixedClock(NOW);
  const memory = new InMemoryGoodsLedger(OWNER, LEDGER, memoryClock, "simulated-domain-test");
  const adapter = new GoodsEvidenceRegisterAdapter(fs, adapterClock);

  const frozen = freezeCommand({
    commandId: "parity001",
    type: "registerGoodsReceipt",
    ownerUid: OWNER,
    ledgerId: LEDGER,
    body: sampleRegisterBody({ receiptId: "parity_receipt" }),
  });

  const memResult = memory.register(frozen);
  const adapterResult = await adapter.register(
    { uid: OWNER },
    {
      commandId: frozen.commandId,
      type: frozen.type,
      ownerUid: frozen.ownerUid,
      ledgerId: frozen.ledgerId,
      body: frozen.body,
      digest: frozen.digest,
    }
  );

  assert.equal(memResult.ok, true);
  assert.equal(adapterResult.ok, true);
  if (!memResult.ok || !adapterResult.ok) throw new Error("expected both ok");
  assert.equal(adapterResult.issuedNumber, memResult.issuedNumber);
  assert.equal(adapterResult.serial, memResult.serial);
  assert.equal(adapterResult.serverRegisteredAtUtc, memResult.serverRegisteredAtUtc);
  assert.equal(adapterResult.eventVersion, memResult.eventVersion);
  assert.equal(adapterResult.headHash, memResult.headHash);
  assert.equal(adapterResult.replayed, memResult.replayed);

  const snap = await db.doc(receiptPath(OWNER, LEDGER, "parity_receipt")).get();
  const stored = snap.data() as {
    original: ReturnType<InMemoryGoodsLedger["getOriginal"]>;
    view: ReturnType<InMemoryGoodsLedger["getView"]>;
    lineLedgers: Record<string, ReturnType<InMemoryGoodsLedger["getLineLedger"]>>;
  };
  assert.deepEqual(stripPersistence(stored.original), stripPersistence(memory.getOriginal("parity_receipt")));
  assert.deepEqual(stripPersistence(stored.view), stripPersistence(memory.getView("parity_receipt")));
  assert.deepEqual(
    stripPersistence(stored.lineLedgers.line_1),
    stripPersistence(memory.getLineLedger("parity_receipt", "line_1"))
  );

  const memEvent = memory.getEvents("parity_receipt")[0]!;
  const eventSnap = await db.doc(eventPath(OWNER, LEDGER, "parity_receipt", memEvent.eventId)).get();
  assert.deepEqual(stripPersistence(eventSnap.data()), stripPersistence(memEvent));

  console.log("tools/goods-evidence-emulator/register.parity.test.ts: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
