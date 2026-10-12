/**
 * QA finding (Agent 5): a return line that the server answered with a RETRYABLE
 * failure (e.g. "unavailable") can never be retried through the production
 * return path.
 *
 * Why: the outbox row is durably `failed_retryable`. On retry (Save again with the
 * same intent, or screen remount → continueReturnPlan), advanceReturnPlan flips
 * the plan line to `pending_submit` and calls repo.dispatchReturn with the SAME
 * commandId but a freshly built body (new clientObservedAtUtc → new digest).
 * persistMutationAndQueue sees an existing command with a different digest and
 * tries markConflicted, but `failed_retryable -> conflicted` is an illegal outbox
 * transition, so the transaction throws, the line is reported `failed` again,
 * and driveReturnConfirmation (which WOULD redispatch the failed_retryable row)
 * is never reached. The plan is wedged; the user sees grin.errReturnPartial forever.
 *
 * The PR #33 "partial retry" interop scenario does not cover this: it stubs
 * repo.dispatchReturn to throw BEFORE anything is persisted, so no row exists and
 * the retry mints the row for the first time.
 *
 * Evidence: SQLITE_HOST + INJECTED (real in-memory G1 adapter). Not NATIVE_DEVICE.
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
import { INJECTED_PORT, createInjectedGrinServerPort } from "../grin-interop/injectedG1ServerPort";

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0, 0);
const OWNER = "owner_qa_a5_retry";
const LEDGER = "primary";
const RECEIPT = "grcp_qa_a5_retry_1";

function clock(nowMs: number): G1Clock {
  let seq = 0;
  return { nowMs: () => nowMs, uuid: () => `evtrt${String(++seq).padStart(8, "0")}` };
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-qa-a5-retry-"));
  let db: HostSqlite | null = null;
  resetGrinMutationFlightForTests();

  const store = createInjectedStore();
  seedInjectedOwner(store, OWNER, LEDGER);
  const server = await createInjectedGrinServerPort({ store, clock: clock(NOW) });

  try {
    db = openHostSqlite(path.join(tmp, "grin.sqlite"));
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log("EVIDENCE=SQLITE_HOST+INJECTED");
    console.log(`PORT_KIND=${INJECTED_PORT} (${server.portSource})`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    const box = new GrinOutbox({ db, server });
    box.ensureSchema();
    const session = box.beginOwnerSession(OWNER);
    const repo = new GrinApplicationRepository({ outbox: box, db, ownerUid: OWNER, ledgerId: LEDGER, session });

    repo.createQueued(
      sampleRegisterBody({
        receiptId: RECEIPT,
        lines: [
          sampleLine({ lineId: "line_1", physicallyReceived: quantity("40", "bags") }),
          sampleLine({ lineId: "line_2", physicallyReceived: quantity("20", "bags") }),
        ],
      })
    );
    await box.dispatchDue(session, "qa_setup_register"); // setup drain: registration only
    assert.equal(repo.returnEligibility(RECEIPT).ok, true);

    // Server answers the first dispatchReturn with a retryable failure (transient outage).
    const originalMutate = server.mutate!.bind(server);
    let transientOnce = true;
    server.mutate = (async (input) => {
      if (transientOnce && input.envelope.type === "dispatchReturn") {
        transientOnce = false;
        return { ok: false, code: "unavailable", detail: "qa simulated transient outage" };
      }
      return originalMutate(input);
    }) as typeof server.mutate;

    const picks = [
      { lineId: "line_1", returnQty: quantity("2", "bags") },
      { lineId: "line_2", returnQty: quantity("1", "bags") },
    ];
    const first = await repo.dispatchReturnSequence({ receiptId: RECEIPT, reason: "transient", intentId: "gint_qa_transient", lines: picks });
    assert.equal(transientOnce, false, "transient failure was delivered");
    assert.deepEqual(
      first.lines.map((l) => [l.lineId, l.status, l.lastError]),
      [
        ["line_1", "failed", "failed_retryable"],
        ["line_2", "pending_submit", null],
      ]
    );
    const cmdL1 = first.lines[0]!.commandId;
    const rowsAfterFirst = box.listCommandsForReceipt(OWNER, LEDGER, RECEIPT).filter((c) => c.commandType === "dispatchReturn");
    assert.equal(rowsAfterFirst.length, 1);
    assert.equal(rowsAfterFirst[0]!.localState, "failed_retryable");
    console.log(`AFTER_TRANSIENT line_1=${first.lines[0]!.status} row=${rowsAfterFirst[0]!.localState}`);

    // Network is healthy again. Capture what the production path does on retry.
    const thrown: string[] = [];
    const originalDispatchReturn = repo.dispatchReturn.bind(repo);
    repo.dispatchReturn = ((input) => {
      try {
        return originalDispatchReturn(input);
      } catch (caught) {
        thrown.push(caught instanceof Error ? caught.message : String(caught));
        throw caught;
      }
    }) as typeof repo.dispatchReturn;

    // Retry 1: user taps Save again (same intent, same picks) — what the screen does.
    const retry = await repo.dispatchReturnSequence({ receiptId: RECEIPT, reason: "transient", intentId: "gint_qa_transient", lines: picks });
    // Retry 2: user leaves and reopens the screen — continueReturnPlan.
    const resumed = await repo.continueReturnPlan(RECEIPT);

    const rowsAfterRetry = box.listCommandsForReceipt(OWNER, LEDGER, RECEIPT).filter((c) => c.commandType === "dispatchReturn");
    const confirmed = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    const returnEvents = (confirmed?.events ?? []).filter((e) => e.type === "return_dispatched").length;
    console.log(`RETRY_THREW=${JSON.stringify(thrown)}`);
    console.log(`AFTER_RETRY plan=${JSON.stringify(retry.lines.map((l) => [l.lineId, l.status]))}`);
    console.log(`AFTER_RESUME plan=${JSON.stringify(resumed?.lines.map((l) => [l.lineId, l.status]))}`);
    console.log(`AFTER_RETRY rows=${JSON.stringify(rowsAfterRetry.map((c) => [c.commandId, c.localState]))}`);
    console.log(`SERVER eventVersion=${confirmed?.eventVersion} return_dispatched_events=${returnEvents}`);

    // Observed production behaviour on this base (the wedge):
    assert.deepEqual(
      thrown,
      [
        "illegal_outbox_transition:failed_retryable->conflicted",
        "illegal_outbox_transition:failed_retryable->conflicted",
      ],
      "both retries re-queue the same commandId with a new digest and hit the illegal transition"
    );
    assert.equal(retry.lines[0]!.status, "failed", "Save-again leaves line_1 failed");
    assert.equal(retry.lines[1]!.status, "pending_submit", "line_2 never submitted");
    assert.equal(resumed?.lines[0]!.status, "failed", "continueReturnPlan leaves line_1 failed");
    assert.equal(rowsAfterRetry.length, 1, "no new command minted (identity preserved) ...");
    assert.equal(rowsAfterRetry[0]!.commandId, cmdL1);
    assert.equal(rowsAfterRetry[0]!.localState, "failed_retryable", "... but the row is never redispatched");
    assert.equal(returnEvents, 0, "server never received the return although it is healthy");
    assert.ok(loadReturnPlan(db, OWNER, LEDGER, RECEIPT), "plan stays open");

    // Control: the outbox itself CAN retry a failed_retryable row when asked directly.
    const direct = await box.dispatchDue(session, "qa_control_direct_drain");
    assert.equal(direct.results.some((r) => r.commandId === cmdL1 && r.localState === "issued"), true,
      "control: a plain dispatchDue confirms the failed_retryable row — the wedge is in advanceReturnPlan, not the outbox");
    console.log("CONTROL direct dispatchDue confirmed line_1");

    console.log(
      "grinReturn.transientFailure.retryWedge.sqliteHost.test.ts: FINDING REPRODUCED (SQLITE_HOST+INJECTED)"
    );
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
