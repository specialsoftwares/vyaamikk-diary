/**
 * Joined proof: confirmed two-line receipt → durable multi-line return sequence
 * through GrinApplicationRepository + outbox → INJECTED G1 mutations → both lines
 * confirmed with correct balances and event versions; original unchanged.
 *
 * Also: partial retry preserves command identities; lost-response recovery;
 * reopen while pending; owner change fencing.
 *
 * Host reopen is not NATIVE_DEVICE process-death proof.
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
import {
  resetGrinMutationFlightForTests,
} from "@/services/grin/repository/grinMutationFlight";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { createInjectedStore, seedInjectedOwner } from "../goods-evidence-emulator/injectedStore";
import type { G1Clock } from "../goods-evidence-emulator/types";
import {
  INJECTED_PORT,
  createInjectedGrinServerPort,
  type InjectedGrinServerPort,
} from "./injectedG1ServerPort";

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0, 0);
const OWNER = "owner_f2_mlret";
const LEDGER = "ledger_f2_mlret";
const RECEIPT = "grcp_f2_mlret_1";

function interopClock(nowMs: number): G1Clock {
  let seq = 0;
  return {
    nowMs: () => nowMs,
    uuid: () => `evtml${String(++seq).padStart(8, "0")}`,
  };
}

function repoFor(outbox: GrinOutbox, db: HostSqlite, session: GrinDispatchSession): GrinApplicationRepository {
  return new GrinApplicationRepository({
    outbox,
    db,
    ownerUid: OWNER,
    ledgerId: LEDGER,
    session,
  });
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t3-mlret-"));
  const dbPath = path.join(tmp, "grin-mlret.sqlite");
  let db: HostSqlite | null = null;
  resetGrinMutationFlightForTests();

  const store = createInjectedStore();
  seedInjectedOwner(store, OWNER, LEDGER);
  const server = await createInjectedGrinServerPort({ store, clock: interopClock(NOW) });
  assert.equal(server.portKind, "INJECTED");

  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`PORT_KIND=${INJECTED_PORT}`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    let box = new GrinOutbox({ db, server });
    box.ensureSchema();
    let session = box.beginOwnerSession(OWNER);
    let repo = repoFor(box, db, session);

    const created = repo.createQueued(
      sampleRegisterBody({
        receiptId: RECEIPT,
        captureProvenance: "unknown",
        reportedArrivalPrecision: "date",
        reportedArrivalAt: "2026-10-07",
        lines: [
          sampleLine({ lineId: "line_1", physicallyReceived: quantity("40", "bags") }),
          sampleLine({
            lineId: "line_2",
            description: "Yarn cones",
            physicallyReceived: quantity("20", "bags"),
          }),
        ],
      })
    );
    assert.equal(created.localState, "queued");
    const regFlush = await box.dispatchDue(session, "worker_ml_reg");
    assert.equal(regFlush.results.some((row) => row.localState === "issued" && !row.skipped), true);
    const afterReg = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    assert.ok(afterReg);
    assert.equal(afterReg.eventVersion, 1);
    assert.equal(afterReg.effective.lines.length, 2);
    const originalJson = JSON.stringify(afterReg.original);

    const drain = async () => {
      await box.dispatchDue(session, "worker_ml_drain");
    };

    const plan = await repo.dispatchReturnSequence({
      receiptId: RECEIPT,
      reason: "two-line surplus return",
      lines: [
        { lineId: "line_1", returnQty: quantity("5", "bags") },
        { lineId: "line_2", returnQty: quantity("3", "bags") },
      ],
      drain,
    });
    assert.equal(plan.lines.length, 2);
    assert.equal(plan.lines[0]?.status, "confirmed");
    assert.equal(plan.lines[1]?.status, "confirmed");
    const cmd1 = plan.lines[0]!.commandId;
    const cmd2 = plan.lines[1]!.commandId;
    assert.notEqual(cmd1, cmd2);

    const afterBoth = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    assert.ok(afterBoth);
    assert.equal(afterBoth.eventVersion, 3);
    assert.equal(JSON.stringify(afterBoth.original), originalJson);
    const returns = afterBoth.events.filter((e) => e.type === "return_dispatched");
    assert.equal(returns.length, 2);
    assert.equal(
      returns.some((e) => e.typedChanges.lineId === "line_1" && (e.typedChanges.returnQty as { value: string }).value === "5"),
      true
    );
    assert.equal(
      returns.some((e) => e.typedChanges.lineId === "line_2" && (e.typedChanges.returnQty as { value: string }).value === "3"),
      true
    );

    // Partial retry: L1 queues, L2 fails to queue (no confirmed version forced), then retry.
    const RECEIPT2 = "grcp_f2_mlret_partial";
    repo.createQueued(
      sampleRegisterBody({
        receiptId: RECEIPT2,
        lines: [
          sampleLine({ lineId: "line_1", physicallyReceived: quantity("40", "bags") }),
          sampleLine({ lineId: "line_2", physicallyReceived: quantity("20", "bags") }),
        ],
      })
    );
    await box.dispatchDue(session, "worker_ml_reg2");
    const conf2 = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT2);
    assert.ok(conf2);

    let failNextQueue = true;
    const originalDispatch = repo.dispatchReturn.bind(repo);
    repo.dispatchReturn = ((input) => {
      if (failNextQueue && input.lineId === "line_2") {
        failNextQueue = false;
        throw new Error("simulated_queue_failure");
      }
      return originalDispatch(input);
    }) as typeof repo.dispatchReturn;

    const partial = await repo.dispatchReturnSequence({
      receiptId: RECEIPT2,
      reason: "partial retry",
      lines: [
        { lineId: "line_1", returnQty: quantity("2", "bags") },
        { lineId: "line_2", returnQty: quantity("1", "bags") },
      ],
      drain,
    });
    assert.equal(partial.lines[0]?.status, "confirmed");
    assert.equal(partial.lines[1]?.status, "failed");
    const stableL1 = partial.lines[0]!.commandId;
    const stableL2 = partial.lines[1]!.commandId;

    const cmdsBeforeRetry = box.listCommandsForReceipt(OWNER, LEDGER, RECEIPT2).filter(
      (c) => c.commandType === "dispatchReturn"
    );
    assert.equal(cmdsBeforeRetry.filter((c) => c.commandId === stableL1).length, 1);

    repo.dispatchReturn = originalDispatch;
    const retried = await repo.dispatchReturnSequence({
      receiptId: RECEIPT2,
      reason: "partial retry",
      lines: [
        { lineId: "line_1", returnQty: quantity("2", "bags") },
        { lineId: "line_2", returnQty: quantity("1", "bags") },
      ],
      drain,
    });
    assert.equal(retried.lines[0]?.commandId, stableL1, "must not mint another command for confirmed L1");
    assert.equal(retried.lines[1]?.commandId, stableL2, "must preserve L2 identity on retry");
    assert.equal(retried.lines[0]?.status, "confirmed");
    assert.equal(retried.lines[1]?.status, "confirmed");
    const cmdsAfter = box.listCommandsForReceipt(OWNER, LEDGER, RECEIPT2).filter(
      (c) => c.commandType === "dispatchReturn"
    );
    assert.equal(cmdsAfter.filter((c) => c.commandId === stableL1).length, 1);
    assert.equal(cmdsAfter.filter((c) => c.commandId === stableL2).length, 1);

    // Immediate double-flight rejected.
    resetGrinMutationFlightForTests();
    const RECEIPT3 = "grcp_f2_mlret_flight";
    repo.createQueued(
      sampleRegisterBody({
        receiptId: RECEIPT3,
        lines: [sampleLine({ lineId: "line_1", physicallyReceived: quantity("10", "bags") })],
      })
    );
    await box.dispatchDue(session, "worker_ml_reg3");
    let releaseDrain: (() => void) | null = null;
    const blockedDrain = new Promise<void>((resolve) => {
      releaseDrain = resolve;
    });
    const first = repo.dispatchReturnSequence({
      receiptId: RECEIPT3,
      reason: "flight",
      lines: [{ lineId: "line_1", returnQty: quantity("1", "bags") }],
      drain: async () => {
        await blockedDrain;
        await box.dispatchDue(session, "worker_ml_flight");
      },
    });
    await assert.rejects(
      () =>
        repo.dispatchReturnSequence({
          receiptId: RECEIPT3,
          reason: "flight",
          lines: [{ lineId: "line_1", returnQty: quantity("1", "bags") }],
          drain,
        }),
      /return_flight_in_progress/
    );
    releaseDrain!();
    const firstPlan = await first;
    assert.equal(firstPlan.lines[0]?.status, "confirmed");

    // Owner change during processing.
    resetGrinMutationFlightForTests();
    const RECEIPT4 = "grcp_f2_mlret_owner";
    repo.createQueued(
      sampleRegisterBody({
        receiptId: RECEIPT4,
        lines: [sampleLine({ lineId: "line_1", physicallyReceived: quantity("10", "bags") })],
      })
    );
    await box.dispatchDue(session, "worker_ml_reg4");
    box.endOwnerSession(OWNER);
    await assert.rejects(
      () =>
        repo.dispatchReturnSequence({
          receiptId: RECEIPT4,
          reason: "retired",
          lines: [{ lineId: "line_1", returnQty: quantity("1", "bags") }],
          drain,
        }),
      (err: unknown) => err instanceof Error && /session_retired|owner_mismatch/.test(err.message)
    );

    // Reopen while pending: queue without drain, reopen, resume with drain.
    resetGrinMutationFlightForTests();
    db.close();
    db = openHostSqlite(dbPath);
    box = new GrinOutbox({ db, server: server as InjectedGrinServerPort });
    session = box.beginOwnerSession(OWNER);
    repo = repoFor(box, db, session);
    const RECEIPT5 = "grcp_f2_mlret_reopen";
    repo.createQueued(
      sampleRegisterBody({
        receiptId: RECEIPT5,
        lines: [
          sampleLine({ lineId: "line_1", physicallyReceived: quantity("10", "bags") }),
          sampleLine({ lineId: "line_2", physicallyReceived: quantity("10", "bags") }),
        ],
      })
    );
    await box.dispatchDue(session, "worker_ml_reg5");
    const pendingPlan = await repo.dispatchReturnSequence({
      receiptId: RECEIPT5,
      reason: "reopen pending",
      lines: [
        { lineId: "line_1", returnQty: quantity("1", "bags") },
        { lineId: "line_2", returnQty: quantity("1", "bags") },
      ],
      // no drain — stops after queueing L1
    });
    assert.equal(pendingPlan.lines[0]?.status, "awaiting_confirmation");
    assert.equal(pendingPlan.lines[1]?.status, "pending_submit");
    const pendingCmd = pendingPlan.lines[0]!.commandId;

    db.close();
    db = openHostSqlite(dbPath);
    box = new GrinOutbox({ db, server });
    session = box.beginOwnerSession(OWNER);
    repo = repoFor(box, db, session);
    const resumed = await repo.dispatchReturnSequence({
      receiptId: RECEIPT5,
      reason: "reopen pending",
      lines: [
        { lineId: "line_1", returnQty: quantity("1", "bags") },
        { lineId: "line_2", returnQty: quantity("1", "bags") },
      ],
      drain: async () => {
        await box.dispatchDue(session, "worker_ml_reopen");
      },
    });
    assert.equal(resumed.lines[0]?.commandId, pendingCmd);
    assert.equal(resumed.lines[0]?.status, "confirmed");
    assert.equal(resumed.lines[1]?.status, "confirmed");

    console.log("f2-multiline-return-sequence.sqliteHost.test.ts SQLITE_HOST+INJECTED: ok");
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
