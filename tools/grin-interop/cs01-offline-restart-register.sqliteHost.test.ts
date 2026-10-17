/**
 * CS-01 SQLITE_HOST + INJECTED_PORT: offline register queue, HostSqlite restart,
 * then dispatch — exactly one issued GRIN / one serial.
 *
 * Host process reopen is not NATIVE_DEVICE process-death proof.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { GrinOutbox } from "@/services/grin/outbox/outbox";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";
import { createInjectedStore, seedInjectedOwner } from "../goods-evidence-emulator/injectedStore";
import type { G1Clock } from "../goods-evidence-emulator/types";
import {
  INJECTED_PORT,
  createInjectedGrinServerPort,
  lastIssuedSerialTotal,
  persistedReceiptCount,
  storedIssuedNumber,
} from "./injectedG1ServerPort";

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);
const OWNER = "owner_cs01";
const LEDGER = "ledger_cs01";
const RECEIPT = "grcp_cs01_1";
const COMMAND = "gcmd_cs01_01";

function interopClock(nowMs: number): G1Clock {
  let seq = 0;
  return {
    nowMs: () => nowMs,
    uuid: () => `evtcs01${String(++seq).padStart(8, "0")}`,
  };
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t3-cs01-"));
  const dbPath = path.join(tmp, "grin-cs01.sqlite");
  let db: HostSqlite | null = null;

  const store = createInjectedStore();
  seedInjectedOwner(store, OWNER, LEDGER);
  const server = await createInjectedGrinServerPort({ store, clock: interopClock(NOW) });
  assert.equal(server.portKind, "INJECTED");

  const reopen = (): HostSqlite => {
    db?.close();
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    return db;
  };

  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`PORT_KIND=${INJECTED_PORT}`);
    console.log(`INJECTED_SOURCE=${server.portSource}`);
    console.log(`NATIVE_DEVICE=not_claimed`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    let box = new GrinOutbox({ db, server });
    box.ensureSchema();

    const sessionQueued = box.beginOwnerSession(OWNER);
    const queued = box.persistDraftAndQueue(sessionQueued, {
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      commandId: COMMAND,
      commandType: "registerGoodsReceipt",
      body: sampleRegisterBody({
        receiptId: RECEIPT,
        captureProvenance: "offline",
      }),
    });
    assert.equal(queued.localState, "queued");
    assert.equal(queued.issuedNumber, null);
    assert.equal(queued.serverRegisteredAtUtc, null);
    assert.equal(queued.receiptId, RECEIPT);
    assert.equal(queued.commandId, COMMAND);
    assert.equal(lastIssuedSerialTotal(store, OWNER, LEDGER), 0);
    assert.equal(persistedReceiptCount(store, OWNER, LEDGER), 0);

    db = reopen();
    box = new GrinOutbox({ db, server });
    const afterOfflineRestart = box.getRecord(OWNER, LEDGER, RECEIPT);
    assert.equal(afterOfflineRestart?.localState, "queued");
    assert.equal(afterOfflineRestart?.issuedNumber, null);
    assert.equal(afterOfflineRestart?.commandId, COMMAND);

    const sessionDispatch = box.beginOwnerSession(OWNER);
    const first = await box.dispatchDue(sessionDispatch, "worker_cs01");
    const firstItem = first.results.find((row) => row.commandId === COMMAND);
    assert.equal(first.processed, 1, JSON.stringify(first));
    assert.equal(firstItem?.localState, "issued", JSON.stringify(first));
    assert.equal(firstItem?.skipped, undefined);
    assert.equal(typeof firstItem?.issuedNumber, "string");
    assert.ok(firstItem?.issuedNumber);
    const issuedFromDispatch = firstItem.issuedNumber;
    const issuedFromServer = storedIssuedNumber(store, OWNER, LEDGER, COMMAND);
    assert.equal(issuedFromServer, issuedFromDispatch);
    assert.equal(lastIssuedSerialTotal(store, OWNER, LEDGER), 1);
    assert.equal(persistedReceiptCount(store, OWNER, LEDGER), 1);
    assert.equal(server.registerCalls, 1);

    const issuedRow = box.getRecord(OWNER, LEDGER, RECEIPT);
    assert.equal(issuedRow?.localState, "issued");
    assert.equal(issuedRow?.issuedNumber, issuedFromServer);
    assert.equal(issuedRow?.serverRegisteredAtUtc, "2026-09-28T12:00:00.000Z");

    db = reopen();
    box = new GrinOutbox({ db, server });
    const afterIssueRestart = box.getRecord(OWNER, LEDGER, RECEIPT);
    assert.equal(afterIssueRestart?.localState, "issued");
    assert.equal(afterIssueRestart?.issuedNumber, issuedFromServer);
    assert.equal(afterIssueRestart?.commandId, COMMAND);

    const sessionAgain = box.beginOwnerSession(OWNER);
    const second = await box.dispatchDue(sessionAgain, "worker_cs01_b");
    const secondItem = second.results.find((row) => row.commandId === COMMAND);
    assert.equal(secondItem, undefined);
    assert.equal(second.processed, 0);
    assert.equal(server.registerCalls, 1);
    assert.equal(lastIssuedSerialTotal(store, OWNER, LEDGER), 1);
    assert.equal(persistedReceiptCount(store, OWNER, LEDGER), 1);

    const stillOne = box.getRecord(OWNER, LEDGER, RECEIPT);
    assert.equal(stillOne?.localState, "issued");
    assert.equal(stillOne?.issuedNumber, issuedFromServer);
    const issuedRows = db.getAllSync<{ issued_number: string }>(
      `SELECT issued_number FROM grin_local_receipts WHERE issued_number IS NOT NULL`
    );
    assert.equal(issuedRows.length, 1);
    assert.equal(issuedRows[0]?.issued_number, issuedFromServer);

    const replay = await server.register({
      uid: OWNER,
      envelope: {
        commandId: COMMAND,
        type: "registerGoodsReceipt",
        ledgerId: LEDGER,
        body: sampleRegisterBody({
          receiptId: RECEIPT,
          captureProvenance: "offline",
        }),
      },
      digest: stillOne?.digest ?? "",
    });
    assert.equal(replay.ok, true);
    if (!replay.ok) throw new Error("expected replay");
    assert.equal(replay.replayed, true);
    assert.equal(replay.issuedNumber, issuedFromServer);
    assert.equal(replay.serial, 1);
    assert.equal(lastIssuedSerialTotal(store, OWNER, LEDGER), 1);
    assert.equal(persistedReceiptCount(store, OWNER, LEDGER), 1);

    console.log(`CS01_ISSUED_NUMBER=${issuedFromServer}`);
    console.log(`CS01_SERIALS_ISSUED=${lastIssuedSerialTotal(store, OWNER, LEDGER)}`);
    console.log("cs01-offline-restart-register.sqliteHost.test.ts: ok");
  } finally {
    db?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
