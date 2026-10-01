import assert from "node:assert/strict";

import { freezeCommand } from "../../src/goodsEvidence/command";
import { sampleLine, sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { GoodsEvidenceRegisterAdapter } from "./adapter";
import { fixedClock } from "./harness";
import { createInjectedStore, seedInjectedOwner } from "./injectedStore";
import { MAX_ENVELOPE_UTF8_BYTES, MAX_INPUT_DEPTH } from "./limits";
import { commandPath, receiptPath, serialPath } from "./paths";
import { MAX_ISSUED_SERIAL } from "./serial";

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);
const OWNER = "owner_injected";
const LEDGER = "ledger_injected";

function envelope(
  commandId: string,
  body = sampleRegisterBody(),
  ownerUid = OWNER,
  ledgerId = LEDGER
) {
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

async function captureLogs(fn: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.log;
  const previous = process.env.GRIN_G1_LOG;
  process.env.GRIN_G1_LOG = "1";
  console.log = (line: unknown) => {
    lines.push(String(line));
  };
  try {
    await fn();
    return lines;
  } finally {
    console.log = original;
    if (previous == null) delete process.env.GRIN_G1_LOG;
    else process.env.GRIN_G1_LOG = previous;
  }
}

function ownLineIds(lineLedgers: object): string[] {
  return Object.keys(lineLedgers);
}

async function main(): Promise<void> {
  // A. String nextSerial must not issue a duplicate number
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const first = await adapter.register(
      { uid: OWNER },
      envelope("command_s01", sampleRegisterBody({ receiptId: "receipt_s01" }))
    );
    assert.equal(first.ok, true);
    const serialKey = serialPath(OWNER, LEDGER, "FY2026-27");
    const before = store.snapshot.get(serialKey);
    store.snapshot.set(
      serialKey,
      JSON.stringify({ fyToken: "FY2026-27", nextSerial: "2", lastIssuedSerial: 1 })
    );
    const writes = store.appliedWrites;
    const second = await adapter.register(
      { uid: OWNER },
      envelope("command_s02", sampleRegisterBody({ receiptId: "receipt_s02" }))
    );
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.code, "integrity");
    assert.equal(store.appliedWrites, writes);
    assert.equal(store.snapshot.get(serialKey), JSON.stringify({ fyToken: "FY2026-27", nextSerial: "2", lastIssuedSerial: 1 }));
    assert.equal(store.snapshot.has(receiptPath(OWNER, LEDGER, "receipt_s02")), false);
    assert.equal(store.snapshot.has(commandPath(OWNER, LEDGER, "command_s02")), false);
    assert.ok(before);
  }

  // A. Exhausted counter
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    store.snapshot.set(
      serialPath(OWNER, LEDGER, "FY2026-27"),
      JSON.stringify({
        fyToken: "FY2026-27",
        nextSerial: MAX_ISSUED_SERIAL + 1,
        lastIssuedSerial: MAX_ISSUED_SERIAL,
      })
    );
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const writes = store.appliedWrites;
    const result = await adapter.register(
      { uid: OWNER },
      envelope("command_s03", sampleRegisterBody({ receiptId: "receipt_s03" }))
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "serial_exhausted");
    assert.equal(store.appliedWrites, writes);
  }

  // B. Prototype line IDs are rejected; toString and ordinary IDs persist as own keys
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    for (const [lineId, receiptId, commandId] of [
      ["__proto__", "r_proto", "commandpr"],
      ["constructor", "r_ctor", "commandct"],
    ] as const) {
      const denied = await adapter.register(
        { uid: OWNER },
        envelope(commandId, sampleRegisterBody({ receiptId, lines: [sampleLine({ lineId })] }))
      );
      assert.equal(denied.ok, false, lineId);
      if (!denied.ok) assert.equal(denied.code, "invalid");
      assert.equal(store.snapshot.has(receiptPath(OWNER, LEDGER, receiptId)), false);
    }

    const two = await adapter.register(
      { uid: OWNER },
      envelope(
        "command_ln2",
        sampleRegisterBody({
          receiptId: "receipt_two_lines",
          lines: [sampleLine({ lineId: "line_1" }), sampleLine({ lineId: "line_2", description: "Bales 2" })],
        })
      )
    );
    assert.equal(two.ok, true);
    const twoRaw = store.snapshot.get(receiptPath(OWNER, LEDGER, "receipt_two_lines"));
    assert.ok(twoRaw);
    const twoStored = JSON.parse(twoRaw) as { original: { lines: { lineId: string }[] }; lineLedgers: Record<string, unknown> };
    assert.deepEqual(
      twoStored.original.lines.map((line) => line.lineId).sort(),
      ownLineIds(twoStored.lineLedgers).sort()
    );
    for (const line of twoStored.original.lines) {
      assert.equal(Object.prototype.hasOwnProperty.call(twoStored.lineLedgers, line.lineId), true);
    }

    const toStringResult = await adapter.register(
      { uid: OWNER },
      envelope(
        "command_ts1",
        sampleRegisterBody({ receiptId: "receipt_tostring", lines: [sampleLine({ lineId: "toString" })] })
      )
    );
    assert.equal(toStringResult.ok, true);
    const tsRaw = store.snapshot.get(receiptPath(OWNER, LEDGER, "receipt_tostring"));
    assert.ok(tsRaw);
    const tsStored = JSON.parse(tsRaw) as {
      original: { lines: { lineId: string; physicallyReceived: unknown }[] };
      lineLedgers: Record<string, { physicalReceived: unknown }>;
      view: { custody: string };
    };
    assert.equal(Object.prototype.hasOwnProperty.call(tsStored.lineLedgers, "toString"), true);
    assert.deepEqual(tsStored.lineLedgers.toString.physicalReceived, tsStored.original.lines[0]?.physicallyReceived);
    assert.equal(tsStored.view.custody, "received");

    const dup = await adapter.register(
      { uid: OWNER },
      envelope(
        "command_dup",
        sampleRegisterBody({
          receiptId: "receipt_dup_lines",
          lines: [sampleLine({ lineId: "line_1" }), sampleLine({ lineId: "line_1", description: "dup" })],
        })
      )
    );
    assert.equal(dup.ok, false);
    if (!dup.ok) assert.equal(dup.code, "invalid");
  }

  // C. Reconcile and deep input
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const committed = await adapter.register(
      { uid: OWNER },
      envelope("command_c01", sampleRegisterBody({ receiptId: "receipt_c01" }))
    );
    assert.equal(committed.ok, true);

    const nullRec = await adapter.reconcile({ uid: OWNER }, null);
    assert.equal(nullRec.ok, false);
    if (!nullRec.ok) assert.equal(nullRec.code, "invalid");

    const arrayRec = await adapter.reconcile({ uid: OWNER }, ["ledger_injected", "command_c01"]);
    assert.equal(arrayRec.ok, false);
    if (!arrayRec.ok) assert.equal(arrayRec.code, "invalid");

    const validRec = await adapter.reconcile(
      { uid: OWNER },
      { ledgerId: LEDGER, commandId: "command_c01" }
    );
    assert.equal(validRec.ok, true);
    if (validRec.ok && committed.ok) {
      assert.equal(validRec.issuedNumber, committed.issuedNumber);
      assert.equal(validRec.replayed, true);
    }

    let deep: unknown = { leaf: true };
    for (let i = 0; i < MAX_INPUT_DEPTH + 8; i++) deep = { nested: deep };
    const deepResult = await adapter.register({ uid: OWNER }, {
      commandId: "command_deep",
      type: "registerGoodsReceipt",
      ownerUid: OWNER,
      ledgerId: LEDGER,
      body: deep,
    });
    assert.equal(deepResult.ok, false);
    if (!deepResult.ok) assert.equal(deepResult.code, "invalid");
    assert.equal(store.snapshot.has(receiptPath(OWNER, LEDGER, "receipt_deep")), false);

    const bigintResult = await adapter.register({ uid: OWNER }, {
      commandId: "command_big",
      type: "registerGoodsReceipt",
      ledgerId: LEDGER,
      body: { n: 1n },
    } as unknown as Record<string, unknown>);
    assert.equal(bigintResult.ok, false);
    if (!bigintResult.ok) assert.equal(bigintResult.code, "invalid");

    const huge = {
      commandId: "command_huge",
      type: "registerGoodsReceipt",
      ledgerId: LEDGER,
      body: { blob: "x".repeat(MAX_ENVELOPE_UTF8_BYTES) },
    };
    const hugeResult = await adapter.register({ uid: OWNER }, huge);
    assert.equal(hugeResult.ok, false);
    if (!hugeResult.ok) assert.equal(hugeResult.code, "invalid");

    const later = await adapter.register(
      { uid: OWNER },
      envelope("command_c09", sampleRegisterBody({ receiptId: "receipt_c09" }))
    );
    assert.equal(later.ok, true);
  }

  // Clock failure is not converted into invalid
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, {
      nowMs: () => {
        throw new Error("clock_failed");
      },
      uuid: () => "id_x",
    });
    await assert.rejects(
      () => adapter.register({ uid: OWNER }, envelope("command_clk", sampleRegisterBody({ receiptId: "receipt_clk" }))),
      /clock_failed/
    );
    assert.equal(store.snapshot.has(receiptPath(OWNER, LEDGER, "receipt_clk")), false);
  }

  // D. Commit logging
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    store.failNextCommit = true;
    store.failCommitError = new Error("injected_commit_rejected");
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const logs = await captureLogs(async () => {
      await assert.rejects(
        () =>
          adapter.register(
            { uid: OWNER },
            envelope("command_log1", sampleRegisterBody({ receiptId: "receipt_log1" }))
          ),
        /injected_commit_rejected/
      );
    });
    assert.equal(logs.filter((line) => line.includes("grin_g1_committed")).length, 0);
    assert.equal(store.snapshot.has(receiptPath(OWNER, LEDGER, "receipt_log1")), false);
  }

  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    store.failNextCommit = true;
    store.failCommitError = Object.assign(new Error("ABORTED: retry"), { code: 10 });
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const logs = await captureLogs(async () => {
      const result = await adapter.register(
        { uid: OWNER },
        envelope("command_log2", sampleRegisterBody({ receiptId: "receipt_log2" }))
      );
      assert.equal(result.ok, true);
    });
    assert.equal(logs.filter((line) => line.includes("grin_g1_committed")).length, 1);
  }

  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const env = envelope("command_log3", sampleRegisterBody({ receiptId: "receipt_log3" }));
    const logs = await captureLogs(async () => {
      const first = await adapter.register({ uid: OWNER }, env);
      assert.equal(first.ok && first.replayed === false, true);
      const replay = await adapter.register({ uid: OWNER }, env);
      assert.equal(replay.ok && replay.replayed, true);
    });
    assert.equal(logs.filter((line) => line.includes("grin_g1_committed")).length, 1);
  }

  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const original = console.log;
    const previous = process.env.GRIN_G1_LOG;
    process.env.GRIN_G1_LOG = "1";
    console.log = () => {
      throw new Error("sink_failed");
    };
    try {
      const result = await adapter.register(
        { uid: OWNER },
        envelope("command_log4", sampleRegisterBody({ receiptId: "receipt_log4" }))
      );
      assert.equal(result.ok, true);
      assert.equal(store.snapshot.has(receiptPath(OWNER, LEDGER, "receipt_log4")), true);
    } finally {
      console.log = original;
      if (previous == null) delete process.env.GRIN_G1_LOG;
      else process.env.GRIN_G1_LOG = previous;
    }
  }

  console.log("tools/goods-evidence-emulator/injected.unit.test.ts: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
