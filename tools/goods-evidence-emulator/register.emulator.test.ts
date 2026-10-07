import assert from "node:assert/strict";

import { freezeCommand } from "../../src/goodsEvidence/command";
import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { financialYearTokenForIstInstant } from "../../src/goodsEvidence/time";
import { GoodsEvidenceRegisterAdapter, isRetryable } from "./adapter";
import {
  adminDb,
  fixedClock,
  makeReadBarrier,
  mutableClock,
  seedOwner,
  wrapAdminFirestore,
} from "./harness";
import { commandPath, receiptPath, serialPath } from "./paths";

const OWNER = "owner_g1";
const LEDGER = "ledger_g1";
const NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);

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

async function main(): Promise<void> {
  const db = adminDb();
  const fs = wrapAdminFirestore(db);
  await db.recursiveDelete(db.doc("users/owner_g1/goodsEvidenceAdmission/runtime")).catch(() => undefined);

  // 1. Valid first register
  {
    await seedOwner(db, OWNER, LEDGER);
    const clock = fixedClock(NOW);
    const adapter = new GoodsEvidenceRegisterAdapter(fs, clock);
    const first = await adapter.register({ uid: OWNER }, envelope("command01", sampleRegisterBody({ receiptId: "receipt01" })));
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error("expected first register");
    assert.equal(first.replayed, false);
    assert.equal(first.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
    assert.equal(first.serial, 1);
    assert.equal(first.eventVersion, 1);
  }

  // 2. Concurrent identical command delivery
  {
    await seedOwner(db, "owner_dup", "ledger_dup");
    const clock = fixedClock(NOW);
    const barrier = makeReadBarrier(2);
    const env = envelope("command02", sampleRegisterBody({ receiptId: "receipt02" }), "owner_dup", "ledger_dup");
    const a = new GoodsEvidenceRegisterAdapter(fs, clock, { afterReads: barrier });
    const b = new GoodsEvidenceRegisterAdapter(fs, clock, { afterReads: barrier });
    const [ra, rb] = await Promise.all([
      a.register({ uid: "owner_dup" }, env),
      b.register({ uid: "owner_dup" }, env),
    ]);
    assert.equal(ra.ok && rb.ok, true);
    if (!ra.ok || !rb.ok) throw new Error("expected concurrent identical success");
    const numbers = [ra.issuedNumber, rb.issuedNumber];
    assert.deepEqual(numbers.sort(), ["GRIN/MAIN/FY2026-27/000001", "GRIN/MAIN/FY2026-27/000001"]);
    assert.equal(ra.replayed || rb.replayed, true);
    assert.equal(ra.replayed && rb.replayed, false);
    const serial = await db.doc(serialPath("owner_dup", "ledger_dup", "FY2026-27")).get();
    assert.equal(serial.data()?.lastIssuedSerial, 1);
    assert.equal(serial.data()?.nextSerial, 2);
  }

  // 3. Concurrent distinct registrations sharing the counter
  {
    await seedOwner(db, "owner_two", "ledger_two");
    const clock = mutableClock(NOW);
    const barrier = makeReadBarrier(2);
    const a = new GoodsEvidenceRegisterAdapter(fs, clock, { afterReads: barrier });
    const b = new GoodsEvidenceRegisterAdapter(fs, clock, { afterReads: barrier });
    const [ra, rb] = await Promise.all([
      a.register({ uid: "owner_two" }, envelope("command03a", sampleRegisterBody({ receiptId: "receipt03a" }), "owner_two", "ledger_two")),
      b.register({ uid: "owner_two" }, envelope("command03b", sampleRegisterBody({ receiptId: "receipt03b" }), "owner_two", "ledger_two")),
    ]);
    assert.equal(ra.ok && rb.ok, true);
    if (!ra.ok || !rb.ok) throw new Error("expected two serials");
    const issued = [ra.issuedNumber, rb.issuedNumber].sort();
    assert.deepEqual(issued, ["GRIN/MAIN/FY2026-27/000001", "GRIN/MAIN/FY2026-27/000002"]);
    assert.equal(ra.replayed || rb.replayed, false);
  }

  // 4. Same ID with changed payload
  {
    await seedOwner(db, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    const first = await adapter.register({ uid: OWNER }, envelope("command04", sampleRegisterBody({ receiptId: "receipt04" })));
    assert.equal(first.ok, true);
    const conflict = await adapter.register(
      { uid: OWNER },
      envelope("command04", sampleRegisterBody({ receiptId: "receipt04", remarks: { kind: "present", value: "changed" } }))
    );
    assert.equal(conflict.ok, false);
    if (conflict.ok) throw new Error("expected digest_conflict");
    assert.equal(conflict.code, "digest_conflict");
  }

  // 5. Same receipt identity with a different command
  {
    await seedOwner(db, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    const first = await adapter.register({ uid: OWNER }, envelope("command05a", sampleRegisterBody({ receiptId: "receipt05" })));
    assert.equal(first.ok, true);
    const second = await adapter.register({ uid: OWNER }, envelope("command05b", sampleRegisterBody({ receiptId: "receipt05" })));
    assert.equal(second.ok, false);
    if (second.ok) throw new Error("expected receipt_exists");
    assert.equal(second.code, "receipt_exists");
  }

  // 6. Lost response after commit → replay + reconcile
  {
    await seedOwner(db, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    const env = envelope("command06", sampleRegisterBody({ receiptId: "receipt06" }));
    const first = await adapter.register({ uid: OWNER }, env);
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error("expected commit");
    const replay = await adapter.register({ uid: OWNER }, env);
    assert.equal(replay.ok && replay.replayed, true);
    if (!replay.ok) throw new Error("expected replay");
    assert.equal(replay.issuedNumber, first.issuedNumber);
    assert.equal(replay.headHash, first.headHash);
    const rec = await adapter.reconcile({ uid: OWNER }, { ledgerId: LEDGER, commandId: "command06" });
    assert.equal(rec.ok && rec.replayed, true);
    if (!rec.ok) throw new Error("expected reconcile");
    assert.equal(rec.issuedNumber, first.issuedNumber);
  }

  // 7. Failure before commit leaves no partial state
  {
    await seedOwner(db, "owner_abort", "ledger_abort");
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW), {
      afterReads: () => {
        throw new Error("abort_before_commit");
      },
    });
    await assert.rejects(
      () =>
        adapter.register(
          { uid: "owner_abort" },
          envelope("command07", sampleRegisterBody({ receiptId: "receipt07" }), "owner_abort", "ledger_abort")
        ),
      /abort_before_commit/
    );
    const serial = await db.doc(serialPath("owner_abort", "ledger_abort", "FY2026-27")).get();
    const receipt = await db.doc(receiptPath("owner_abort", "ledger_abort", "receipt07")).get();
    const command = await db.doc(commandPath("owner_abort", "ledger_abort", "command07")).get();
    assert.equal(serial.exists, false);
    assert.equal(receipt.exists, false);
    assert.equal(command.exists, false);
  }

  // 8. Transaction retry
  {
    await seedOwner(db, "owner_retry", "ledger_retry");
    let attempts = 0;
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW), {
      afterReads: (attempt) => {
        attempts += 1;
        if (attempt === 1) {
          const err = new Error("ABORTED: simulated retry");
          (err as Error & { code: number }).code = 10;
          throw err;
        }
      },
    });
    const result = await adapter.register(
      { uid: "owner_retry" },
      envelope("command08", sampleRegisterBody({ receiptId: "receipt08" }), "owner_retry", "ledger_retry")
    );
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected retry success");
    assert.equal(result.replayed, false);
    assert.equal(result.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
    assert.ok(attempts >= 2);
    assert.equal(isRetryable({ code: 10 }), true);
  }

  // 9 + 10. Unauthorized states and admission matrix
  {
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    const unauth = await adapter.register({ uid: null }, envelope("command09a", sampleRegisterBody({ receiptId: "receipt09a" })));
    assert.equal(unauth.ok, false);
    if (unauth.ok) throw new Error("expected unauthenticated");
    assert.equal(unauth.code, "unauthenticated");

    await seedOwner(db, OWNER, LEDGER);
    const cross = await adapter.register({ uid: "intruder" }, envelope("command09b", sampleRegisterBody({ receiptId: "receipt09b" }), "intruder", LEDGER));
    assert.equal(cross.ok, false);
    if (cross.ok) throw new Error("expected forbidden ledger");
    assert.equal(cross.code, "forbidden");

    await seedOwner(db, "owner_del", "ledger_del", { userStatus: "pending_deletion" });
    const pending = await adapter.register(
      { uid: "owner_del" },
      envelope("command09c", sampleRegisterBody({ receiptId: "receipt09c" }), "owner_del", "ledger_del")
    );
    assert.equal(pending.ok, false);
    if (pending.ok) throw new Error("expected pending_deletion deny");
    assert.equal(pending.code, "forbidden");
    const pendingRec = await adapter.reconcile({ uid: "owner_del" }, { ledgerId: "ledger_del", commandId: "command09c" });
    assert.equal(pendingRec.ok, false);
    if (pendingRec.ok) throw new Error("expected pending reconcile deny");
    assert.equal(pendingRec.code, "forbidden");

    await seedOwner(db, "owner_ret", "ledger_ret", { ledgerStatus: "retired" });
    const retired = await adapter.register(
      { uid: "owner_ret" },
      envelope("command09d", sampleRegisterBody({ receiptId: "receipt09d" }), "owner_ret", "ledger_ret")
    );
    assert.equal(retired.ok, false);
    if (retired.ok) throw new Error("expected retired deny");
    assert.equal(retired.code, "forbidden");
  }

  const matrix: Array<{
    name: string;
    newCommands: "allow" | "deny";
    reconciliation: "allow" | "deny";
    submitMatch: string;
    reconcileMissing: string;
  }> = [
    { name: "allow/allow", newCommands: "allow", reconciliation: "allow", submitMatch: "replay", reconcileMissing: "not_found" },
    { name: "deny/allow", newCommands: "deny", reconciliation: "allow", submitMatch: "policy_denied", reconcileMissing: "not_found" },
    { name: "allow/deny", newCommands: "allow", reconciliation: "deny", submitMatch: "replay", reconcileMissing: "policy_denied" },
    { name: "deny/deny", newCommands: "deny", reconciliation: "deny", submitMatch: "policy_denied", reconcileMissing: "policy_denied" },
  ];

  for (const row of matrix) {
    const uid = `m_${row.newCommands}_${row.reconciliation}`;
    const ledgerId = `led_${row.newCommands}_${row.reconciliation}`;
    await seedOwner(db, uid, ledgerId, {
      policy: { newCommands: "allow", reconciliation: "allow" },
    });
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    const env = envelope("command10xx", sampleRegisterBody({ receiptId: `r_${uid}` }), uid, ledgerId);
    if (row.newCommands === "allow" || row.submitMatch === "replay") {
      // Pre-commit a command while allow, then switch policy for the deny-submit rows.
      const committed = await adapter.register({ uid }, env);
      assert.equal(committed.ok, true, `${row.name} seed-register`);
    }
    await seedOwner(db, uid, ledgerId, {
      policy: { newCommands: row.newCommands, reconciliation: row.reconciliation },
    });
    if (row.newCommands === "deny") {
      // still need a committed command for submit-match rows
      await seedOwner(db, uid, ledgerId, { policy: { newCommands: "allow", reconciliation: "allow" } });
      const committed = await adapter.register({ uid }, env);
      assert.equal(committed.ok, true, `${row.name} seed`);
      await seedOwner(db, uid, ledgerId, {
        policy: { newCommands: row.newCommands, reconciliation: row.reconciliation },
      });
    }
    const submit = await adapter.register({ uid }, env);
    if (row.submitMatch === "replay") {
      assert.equal(submit.ok && submit.replayed, true, `${row.name} submit`);
    } else {
      assert.equal(submit.ok, false, `${row.name} submit deny`);
      if (!submit.ok) assert.equal(submit.code, "policy_denied");
    }
    const missing = await adapter.reconcile({ uid }, { ledgerId, commandId: "missingcmd" });
    assert.equal(missing.ok, false, `${row.name} reconcile missing`);
    if (!missing.ok) assert.equal(missing.code, row.reconcileMissing);
  }

  {
    await seedOwner(db, "owner_miss", "ledger_miss", { policy: null });
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    const missingCfg = await adapter.register(
      { uid: "owner_miss" },
      envelope("command10z", sampleRegisterBody({ receiptId: "receipt10z" }), "owner_miss", "ledger_miss")
    );
    assert.equal(missingCfg.ok, false);
    if (!missingCfg.ok) assert.equal(missingCfg.code, "policy_denied");
  }

  // 11. IST financial-year boundary
  {
    await seedOwner(db, "owner_fy", "ledger_fy");
    const clock = mutableClock(Date.UTC(2026, 2, 31, 18, 29, 59, 0));
    const adapter = new GoodsEvidenceRegisterAdapter(fs, clock);
    const before = await adapter.register(
      { uid: "owner_fy" },
      envelope("cmdbefore", sampleRegisterBody({ receiptId: "before_fy" }), "owner_fy", "ledger_fy")
    );
    assert.equal(financialYearTokenForIstInstant(clock.now), "FY2025-26");
    assert.equal(before.ok && before.issuedNumber.includes("FY2025-26"), true);
    clock.now = Date.UTC(2026, 2, 31, 18, 30, 0, 0);
    const after = await adapter.register(
      { uid: "owner_fy" },
      envelope("cmdafter1", sampleRegisterBody({ receiptId: "after_fy" }), "owner_fy", "ledger_fy")
    );
    assert.equal(financialYearTokenForIstInstant(clock.now), "FY2026-27");
    assert.equal(after.ok && after.issuedNumber.includes("FY2026-27"), true);
    if (after.ok) assert.match(after.issuedNumber, /000001/);
  }

  // 12. Malformed inputs and size limits
  {
    await seedOwner(db, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    const slash = await adapter.register({ uid: OWNER }, {
      commandId: "command12a",
      type: "registerGoodsReceipt",
      ownerUid: OWNER,
      ledgerId: LEDGER,
      body: sampleRegisterBody({ receiptId: "bad/id" }),
    });
    assert.equal(slash.ok, false);
    if (!slash.ok) assert.equal(slash.code, "invalid");

    const extra = await adapter.register({ uid: OWNER }, {
      ...envelope("command12b", sampleRegisterBody({ receiptId: "receipt12b" })),
      extra: true,
    });
    assert.equal(extra.ok, false);
    if (!extra.ok) assert.equal(extra.code, "invalid");

    const server = await adapter.register({ uid: OWNER }, {
      commandId: "command12c",
      type: "registerGoodsReceipt",
      ownerUid: OWNER,
      ledgerId: LEDGER,
      body: { ...sampleRegisterBody({ receiptId: "receipt12c" }), issuedNumber: "GRIN/MAIN/FY2026-27/000009" },
    });
    assert.equal(server.ok, false);
    if (!server.ok) assert.equal(server.code, "invalid");

    const sparseLines: unknown[] = [sampleRegisterBody().lines[0]];
    sparseLines[3] = sampleRegisterBody().lines[0];
    const sparse = await adapter.register({ uid: OWNER }, {
      commandId: "command12d",
      type: "registerGoodsReceipt",
      ownerUid: OWNER,
      ledgerId: LEDGER,
      body: { ...sampleRegisterBody({ receiptId: "receipt12d" }), lines: sparseLines },
    });
    assert.equal(sparse.ok, false);
    if (!sparse.ok) assert.equal(sparse.code, "invalid");
  }

  // Denied reconcile does not disclose whether the command exists
  {
    await seedOwner(db, "owner_disc", "ledger_disc", { policy: { newCommands: "allow", reconciliation: "allow" } });
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    const env = envelope("command_disc", sampleRegisterBody({ receiptId: "receipt_disc" }), "owner_disc", "ledger_disc");
    const committed = await adapter.register({ uid: "owner_disc" }, env);
    assert.equal(committed.ok, true);
    await seedOwner(db, "owner_disc", "ledger_disc", { policy: { newCommands: "allow", reconciliation: "deny" } });
    const existing = await adapter.reconcile(
      { uid: "owner_disc" },
      { ledgerId: "ledger_disc", commandId: "command_disc" }
    );
    const missing = await adapter.reconcile(
      { uid: "owner_disc" },
      { ledgerId: "ledger_disc", commandId: "missing_disc" }
    );
    assert.equal(existing.ok, false);
    assert.equal(missing.ok, false);
    if (!existing.ok && !missing.ok) {
      assert.equal(existing.code, "policy_denied");
      assert.equal(missing.code, "policy_denied");
    }
  }

  // Pending-deletion: no replay exception after a committed command
  {
    await seedOwner(db, "owner_pend", "ledger_pend");
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    const env = envelope("command_pend", sampleRegisterBody({ receiptId: "receipt_pend" }), "owner_pend", "ledger_pend");
    const committed = await adapter.register({ uid: "owner_pend" }, env);
    assert.equal(committed.ok, true);
    await seedOwner(db, "owner_pend", "ledger_pend", { userStatus: "pending_deletion" });
    const replay = await adapter.register({ uid: "owner_pend" }, env);
    const rec = await adapter.reconcile({ uid: "owner_pend" }, { ledgerId: "ledger_pend", commandId: "command_pend" });
    assert.equal(replay.ok, false);
    assert.equal(rec.ok, false);
    if (!replay.ok) assert.equal(replay.code, "forbidden");
    if (!rec.ok) assert.equal(rec.code, "forbidden");
  }

  // Cross-owner: stored result is not disclosed
  {
    await seedOwner(db, "owner_priv", "ledger_priv");
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    const env = envelope("command_priv", sampleRegisterBody({ receiptId: "receipt_priv" }), "owner_priv", "ledger_priv");
    const committed = await adapter.register({ uid: "owner_priv" }, env);
    assert.equal(committed.ok, true);
    await seedOwner(db, "intruder_priv", "ledger_other");
    const crossRec = await adapter.reconcile(
      { uid: "intruder_priv" },
      { ledgerId: "ledger_priv", commandId: "command_priv" }
    );
    const crossMissing = await adapter.reconcile(
      { uid: "intruder_priv" },
      { ledgerId: "ledger_priv", commandId: "no_such_command" }
    );
    assert.equal(crossRec.ok, false);
    assert.equal(crossMissing.ok, false);
    if (!crossRec.ok && !crossMissing.ok) {
      assert.equal(crossRec.code, "forbidden");
      assert.equal(crossMissing.code, "forbidden");
    }
  }

  console.log("tools/goods-evidence-emulator/register.emulator.test.ts: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
