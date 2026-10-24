/**
 * Joined proof: a return line answered by the server with a RETRYABLE failure
 * (e.g. "unavailable") is retried through the production return path without
 * rebuilding its command.
 *
 * The outbox row is durably `failed_retryable`. On Save-again (same intent) or
 * continueReturnPlan, advanceReturnPlan must drive the existing row through
 * outbox.dispatchDue — never call dispatchReturn again for a persisted
 * commandId (a rebuilt body would carry a new clientObservedAtUtc → new digest →
 * digest conflict → illegal_outbox_transition:failed_retryable->conflicted).
 *
 * Also: a PERMANENT server failure stays terminal for that line and is never
 * re-queued; a line whose commandId has no row (queue failure before
 * persistence) is still submitted once.
 *
 * Evidence: SQLITE_HOST + INJECTED (in-memory G1 adapter). Not NATIVE_DEVICE.
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
import { loadReturnPlan } from "@/services/grin/repository/grinReturnPlan";

import { createInjectedStore, seedInjectedOwner } from "../goods-evidence-emulator/injectedStore";
import type { G1Clock } from "../goods-evidence-emulator/types";
import { INJECTED_PORT, createInjectedGrinServerPort } from "./injectedG1ServerPort";

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0, 0);
const OWNER = "owner_f2_mlret_retry";
const LEDGER = "ledger_f2_mlret_retry";

function interopClock(nowMs: number): G1Clock {
  let seq = 0;
  return {
    nowMs: () => nowMs,
    uuid: () => `evtrt${String(++seq).padStart(8, "0")}`,
  };
}

type CommandRow = { command_id: string; local_state: string; digest: string; last_error_code: string | null };

function returnRows(db: HostSqlite, receiptId: string): CommandRow[] {
  return db.getAllSync<CommandRow>(
    `SELECT command_id, local_state, digest, last_error_code FROM grin_outbox_commands
      WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ? AND command_type = 'dispatchReturn'
      ORDER BY created_at ASC`,
    [OWNER, LEDGER, receiptId]
  );
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t3-mlret-retry-"));
  let db: HostSqlite | null = null;
  resetGrinMutationFlightForTests();

  const store = createInjectedStore();
  seedInjectedOwner(store, OWNER, LEDGER);
  const server = await createInjectedGrinServerPort({ store, clock: interopClock(NOW) });
  assert.equal(server.portKind, "INJECTED");

  try {
    db = openHostSqlite(path.join(tmp, "grin-mlret-retry.sqlite"));
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`PORT_KIND=${INJECTED_PORT}`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    const box = new GrinOutbox({ db, server });
    box.ensureSchema();
    const session = box.beginOwnerSession(OWNER);
    const repo = new GrinApplicationRepository({ outbox: box, db, ownerUid: OWNER, ledgerId: LEDGER, session });

    // Observe the production path: every dispatchReturn call and every throw.
    const dispatchReturnCalls: string[] = [];
    const dispatchReturnThrew: string[] = [];
    const originalDispatchReturn = repo.dispatchReturn.bind(repo);
    repo.dispatchReturn = ((input) => {
      dispatchReturnCalls.push(input.commandId ?? "<minted>");
      try {
        return originalDispatchReturn(input);
      } catch (caught) {
        dispatchReturnThrew.push(caught instanceof Error ? caught.message : String(caught));
        throw caught;
      }
    }) as typeof repo.dispatchReturn;

    const originalMutate = server.mutate.bind(server);
    let failNextReturnWith: string | null = null;
    server.mutate = (async (input) => {
      if (failNextReturnWith && input.envelope.type === "dispatchReturn") {
        const code = failNextReturnWith;
        failNextReturnWith = null;
        return { ok: false, code, detail: "simulated" } as Awaited<ReturnType<typeof originalMutate>>;
      }
      return originalMutate(input);
    }) as typeof server.mutate;

    async function registerTwoLines(receiptId: string): Promise<void> {
      repo.createQueued(
        sampleRegisterBody({
          receiptId,
          lines: [
            sampleLine({ lineId: "line_1", physicallyReceived: quantity("40", "bags") }),
            sampleLine({ lineId: "line_2", physicallyReceived: quantity("20", "bags") }),
          ],
        })
      );
      await box.dispatchDue(session, `worker_reg_${receiptId}`);
      assert.equal(repo.returnEligibility(receiptId).ok, true);
      assert.equal(box.getConfirmedProjection(OWNER, LEDGER, receiptId)?.eventVersion, 1);
    }

    const picks = [
      { lineId: "line_1", returnQty: quantity("2", "bags") },
      { lineId: "line_2", returnQty: quantity("1", "bags") },
    ];

    /** Transient failure on line_1 → line_1 failed (retryable), line_2 untouched, one row. */
    async function transientFirstAttempt(receiptId: string, intentId: string) {
      failNextReturnWith = "unavailable";
      const first = await repo.dispatchReturnSequence({ receiptId, reason: "transient", intentId, lines: picks });
      assert.equal(failNextReturnWith, null, "transient failure was delivered");
      assert.deepEqual(
        first.lines.map((l) => [l.lineId, l.status, l.lastError]),
        [
          ["line_1", "failed", "failed_retryable"],
          ["line_2", "pending_submit", null],
        ]
      );
      assert.equal(first.lines[0]?.lastErrorCode, "unavailable", "retryable lastErrorCode exposes the server code");
      const rows = returnRows(db!, receiptId);
      assert.equal(rows.length, 1, "exactly one dispatchReturn row after the transient failure");
      assert.equal(rows[0]!.command_id, first.lines[0]!.commandId);
      assert.equal(rows[0]!.local_state, "failed_retryable");
      assert.equal(rows[0]!.last_error_code, "unavailable");
      assert.ok(loadReturnPlan(db!, OWNER, LEDGER, receiptId), "plan stays open for retry");
      return { commandId: rows[0]!.command_id, digest: rows[0]!.digest, line2CommandId: first.lines[1]!.commandId };
    }

    function assertRecovered(
      receiptId: string,
      plan: { lines: { lineId: string; status: string; commandId: string }[] } | null,
      before: { commandId: string; digest: string; line2CommandId: string },
      callsBefore: number
    ) {
      assert.deepEqual(dispatchReturnThrew, [], "no illegal_outbox_transition or other throw on retry");
      assert.ok(plan);
      assert.deepEqual(
        plan.lines.map((l) => [l.lineId, l.status]),
        [
          ["line_1", "confirmed"],
          ["line_2", "confirmed"],
        ]
      );
      assert.equal(plan.lines[0]!.commandId, before.commandId, "line_1 keeps its commandId");
      assert.equal(plan.lines[1]!.commandId, before.line2CommandId, "line_2 keeps its planned commandId");
      const rows = returnRows(db!, receiptId);
      assert.equal(rows.length, 2, "exactly two dispatchReturn rows after recovery");
      assert.equal(rows[0]!.command_id, before.commandId);
      assert.equal(rows[0]!.digest, before.digest, "line_1 frozen digest is never rewritten");
      assert.equal(rows[0]!.local_state, "issued");
      assert.equal(rows[1]!.local_state, "issued");
      const callsDuringRetry = dispatchReturnCalls.slice(callsBefore);
      assert.equal(
        callsDuringRetry.includes(before.commandId),
        false,
        "a persisted command is never re-queued through dispatchReturn"
      );
      assert.deepEqual(callsDuringRetry, [before.line2CommandId], "only the never-persisted line_2 is queued");
      const confirmed = box.getConfirmedProjection(OWNER, LEDGER, receiptId);
      assert.ok(confirmed);
      assert.equal(confirmed.eventVersion, 3, "server confirmed both returns (no invented versions)");
      assert.equal(confirmed.events.filter((e) => e.type === "return_dispatched").length, 2);
      assert.equal(loadReturnPlan(db!, OWNER, LEDGER, receiptId), null, "fully confirmed plan is cleared");
    }

    // ---- Variant A: Save again with the SAME intent (what the screen does).
    const RECEIPT_A = "grcp_f2_retry_save_again";
    await registerTwoLines(RECEIPT_A);
    const beforeA = await transientFirstAttempt(RECEIPT_A, "gint_retry_a");
    const callsBeforeA = dispatchReturnCalls.length;
    const retried = await repo.dispatchReturnSequence({
      receiptId: RECEIPT_A,
      reason: "transient",
      intentId: "gint_retry_a",
      lines: picks,
    });
    assertRecovered(RECEIPT_A, retried, beforeA, callsBeforeA);
    console.log(`VARIANT_A save_again: line_1=${retried.lines[0]!.status} line_2=${retried.lines[1]!.status}`);

    // ---- Variant B: leave and reopen the screen → continueReturnPlan.
    resetGrinMutationFlightForTests();
    const RECEIPT_B = "grcp_f2_retry_resume";
    await registerTwoLines(RECEIPT_B);
    const beforeB = await transientFirstAttempt(RECEIPT_B, "gint_retry_b");
    const callsBeforeB = dispatchReturnCalls.length;
    const resumed = await repo.continueReturnPlan(RECEIPT_B);
    assertRecovered(RECEIPT_B, resumed, beforeB, callsBeforeB);
    console.log(`VARIANT_B continue: line_1=${resumed!.lines[0]!.status} line_2=${resumed!.lines[1]!.status}`);

    // ---- Variant C: PERMANENT failure stays terminal; never re-queued; later lines do not submit.
    resetGrinMutationFlightForTests();
    const RECEIPT_C = "grcp_f2_retry_permanent";
    await registerTwoLines(RECEIPT_C);
    failNextReturnWith = "invalid";
    const permanent = await repo.dispatchReturnSequence({
      receiptId: RECEIPT_C,
      reason: "permanent",
      intentId: "gint_retry_c",
      lines: picks,
    });
    assert.deepEqual(
      permanent.lines.map((l) => [l.lineId, l.status, l.lastError]),
      [
        ["line_1", "failed", "failed_permanent"],
        ["line_2", "pending_submit", null],
      ]
    );
    assert.equal(permanent.lines[0]?.lastErrorCode, "invalid");
    const permanentRowsBefore = returnRows(db, RECEIPT_C);
    assert.equal(permanentRowsBefore.length, 1);
    assert.equal(permanentRowsBefore[0]!.local_state, "failed_permanent");
    const callsBeforeC = dispatchReturnCalls.length;
    const permanentRetry = await repo.dispatchReturnSequence({
      receiptId: RECEIPT_C,
      reason: "permanent",
      intentId: "gint_retry_c",
      lines: picks,
    });
    assert.deepEqual(
      permanentRetry.lines.map((l) => [l.lineId, l.status, l.lastError]),
      [
        ["line_1", "failed", "failed_permanent"],
        ["line_2", "pending_submit", null],
      ]
    );
    assert.deepEqual(dispatchReturnCalls.slice(callsBeforeC), [], "permanent failure: nothing is re-queued");
    assert.deepEqual(dispatchReturnThrew, []);
    const permanentRowsAfter = returnRows(db, RECEIPT_C);
    assert.equal(permanentRowsAfter.length, 1, "permanent failure: no new rows");
    assert.equal(permanentRowsAfter[0]!.digest, permanentRowsBefore[0]!.digest);
    assert.equal(box.getConfirmedProjection(OWNER, LEDGER, RECEIPT_C)?.eventVersion, 1);

    console.log("f2-multiline-return-transient-retry.sqliteHost.test.ts SQLITE_HOST+INJECTED: ok");
  } finally {
    db?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    resetGrinMutationFlightForTests();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
