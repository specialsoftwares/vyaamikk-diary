/**
 * FIRESTORE_EMULATOR. Real admin transaction through the unregistered caller.
 * Does not deploy and does not turn the production flag on.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { applyAcceptedSource, partyLedgerCheckpointPath } from "@/services/partyLedger/firestoreApply";
import type { LedgerSource } from "@/services/partyLedger/project";
import { PARTY_LEDGER_SERVER_PROJECTION_ENABLED } from "@/services/partyLedger/contracts";
import {
  bindPartyLedgerApply,
  handlePartyLedgerEvent,
} from "../../../functions/src/partyLedger/handleEvent";

function source(patch: Partial<LedgerSource> = {}): LedgerSource {
  return {
    ownerUid: "owner-a",
    recordType: "business_cash_given",
    recordId: "cash-1",
    sourceEpoch: "2",
    revision: "1",
    effectiveDay: "2026-10-01",
    acceptedAt: "2026-10-01T00:00:00.000Z",
    partyId: "party-a",
    payload: { amount: "20.00", givenToName: "Ravi" },
    ...patch,
  };
}

async function bucketPaid(
  db: { collection: (path: string) => { get: () => Promise<{ docs: { get: (field: string) => unknown }[] }> } },
  ownerUid: string
): Promise<string> {
  const snap = await db.collection(`users/${ownerUid}/partyLedgerBuckets`).get();
  let paid = 0n;
  for (const doc of snap.docs) {
    const totals = doc.get("totals") as { cashPaidMinor?: string } | undefined;
    paid += BigInt(totals?.cashPaidMinor ?? "0");
  }
  return paid.toString();
}

async function main(): Promise<void> {
  const require = createRequire(resolve("functions/package.json"));
  const { deleteApp, getApps, initializeApp } = require("firebase-admin/app") as {
    deleteApp: (app: { name: string }) => Promise<void>;
    getApps: () => { name: string }[];
    initializeApp: (opts: { projectId: string }) => { name: string };
  };
  const { getFirestore } = require("firebase-admin/firestore") as {
    getFirestore: () => Parameters<typeof handlePartyLedgerEvent>[0];
  };
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
  assert.equal(PARTY_LEDGER_SERVER_PROJECTION_ENABLED, false);
  if (getApps().length === 0) initializeApp({ projectId: "demo-vyaamikk" });
  const db = getFirestore();
  bindPartyLedgerApply(applyAcceptedSource);
  const previous = process.env.PARTY_LEDGER_EMULATOR;
  process.env.PARTY_LEDGER_EMULATOR = "1";
  try {
    const disabled = process.env.PARTY_LEDGER_FUNCTIONS;
    delete process.env.PARTY_LEDGER_EMULATOR;
    const held = await handlePartyLedgerEvent(db, "owner-a", source(), "cmd-held");
    assert.equal(held.status, "disabled");
    process.env.PARTY_LEDGER_EMULATOR = "1";
    if (disabled) process.env.PARTY_LEDGER_FUNCTIONS = disabled;

    const denied = await handlePartyLedgerEvent(db, "owner-b", source(), "cmd-cross");
    assert.equal(denied.status, "denied");
    assert.equal(await bucketPaid(db, "owner-a"), "0");

    const created = await handlePartyLedgerEvent(db, "owner-a", source(), "cmd-1");
    assert.equal(created.status, "ran");
    assert.equal(created.result?.kind, "applied");
    assert.equal(await bucketPaid(db, "owner-a"), "2000");

    const replay = await handlePartyLedgerEvent(db, "owner-a", source(), "cmd-1");
    assert.equal(replay.result?.kind, "replay");
    assert.equal(await bucketPaid(db, "owner-a"), "2000");

    const conflict = await handlePartyLedgerEvent(
      db,
      "owner-a",
      source({ payload: { amount: "25.00", givenToName: "Ravi" } }),
      "cmd-1"
    );
    assert.equal(conflict.result?.kind, "conflict");
    assert.equal(await bucketPaid(db, "owner-a"), "2000");

    const stale = await handlePartyLedgerEvent(
      db,
      "owner-a",
      source({ sourceEpoch: "1", revision: "9" }),
      "cmd-stale"
    );
    assert.equal(stale.result?.kind, "stale");
    assert.equal(await bucketPaid(db, "owner-a"), "2000");

    const edited = await handlePartyLedgerEvent(
      db,
      "owner-a",
      source({ sourceEpoch: "3", revision: "2", payload: { amount: "25.00", givenToName: "Ravi" } }),
      "cmd-edit"
    );
    assert.equal(edited.result?.kind, "applied");
    assert.equal(await bucketPaid(db, "owner-a"), "2500");

    const removed = await handlePartyLedgerEvent(
      db,
      "owner-a",
      source({ sourceEpoch: "4", revision: "3", deleted: true }),
      "cmd-delete"
    );
    assert.equal(removed.result?.kind, "applied");
    assert.equal(await bucketPaid(db, "owner-a"), "0");

    const checkpoint = await db.doc(partyLedgerCheckpointPath("owner-a")).get();
    assert.equal(checkpoint.get("cursor"), "owner-a:business_cash_given:cash-1");
    assert.equal(checkpoint.get("sourceRevision"), "3");

    const [left, right] = await Promise.all([
      handlePartyLedgerEvent(
        db,
        "owner-a",
        source({ recordId: "cash-left", payload: { amount: "1.00", givenToName: "Left" } }),
        "cmd-left"
      ),
      handlePartyLedgerEvent(
        db,
        "owner-a",
        source({ recordId: "cash-right", payload: { amount: "2.00", givenToName: "Right" } }),
        "cmd-right"
      ),
    ]);
    assert.equal(left.result?.kind, "applied");
    assert.equal(right.result?.kind, "applied");
    assert.equal(await bucketPaid(db, "owner-a"), "300");

    console.log("partyLedger.apply.emulator.test.ts ok");
  } finally {
    bindPartyLedgerApply(null);
    if (previous === undefined) delete process.env.PARTY_LEDGER_EMULATOR;
    else process.env.PARTY_LEDGER_EMULATOR = previous;
    await Promise.all(getApps().map((app) => deleteApp(app)));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
