/**
 * Firebase JS transport unit tests. INJECTED httpsCallable-style port.
 * Not live deploy. Does not call a deployed function.
 */
import assert from "node:assert/strict";

import { createFirebaseGrinTransport } from "./firebaseTransport";
import { GRIN_MUTATE_CALLABLE, GRIN_RECONCILE_CALLABLE, GRIN_REGISTER_CALLABLE } from "./callableNames";

const OWNER = "owner_transport";
const OTHER = "other_uid";

function envelope() {
  return {
    commandId: "command_t01",
    type: "registerGoodsReceipt" as const,
    ledgerId: "ledger_t",
    body: { receiptId: "receipt_t01" },
  };
}

async function main(): Promise<void> {
  const calls: { name: string; data: unknown }[] = [];
  const transport = createFirebaseGrinTransport({
    currentAuth: () => ({ uid: OWNER }),
    call: async (name, data) => {
      calls.push({ name, data });
      if (name === GRIN_REGISTER_CALLABLE) {
        return {
          ok: true as const,
          replayed: false,
          receiptId: "receipt_t01",
          issuedNumber: "GRIN/MAIN/FY2026-27/000001",
          serial: 1,
          serverRegisteredAtUtc: "2026-09-28T12:00:00.000Z",
          eventVersion: 1,
          headHash: "aa".repeat(32),
        };
      }
      if (name === GRIN_RECONCILE_CALLABLE) {
        return {
          ok: true as const,
          replayed: true,
          receiptId: "receipt_t01",
          issuedNumber: "GRIN/MAIN/FY2026-27/000001",
          serial: 1,
          serverRegisteredAtUtc: "2026-09-28T12:00:00.000Z",
          eventVersion: 1,
          headHash: "aa".repeat(32),
          commandType: "registerGoodsReceipt" as const,
        };
      }
      return {
        ok: true as const,
        replayed: false,
        receiptId: "receipt_t01",
        eventId: "id_2",
        eventVersion: 2,
        headHash: "bb".repeat(32),
        serverAcceptedAtUtc: "2026-09-28T13:00:00.000Z",
      };
    },
  });

  assert.equal(transport.portKind, "INJECTED");
  assert.equal(transport.transportKind, "FIREBASE_JS_HTTPS_CALLABLE");
  assert.equal(transport.compositionLabel, "not live deploy");

  const registered = await transport.register({
    uid: OWNER,
    envelope: envelope(),
    digest: "local-digest",
  });
  assert.equal(registered.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, GRIN_REGISTER_CALLABLE);
  assert.deepEqual(calls[0]?.data, { envelope: envelope(), digest: "local-digest" });
  assert.equal("uid" in (calls[0]?.data as object), false);

  const mismatch = await transport.register({
    uid: OTHER,
    envelope: envelope(),
    digest: "local-digest",
  });
  assert.equal(mismatch.ok, false);
  if (mismatch.ok) throw new Error("expected owner mismatch");
  assert.equal(mismatch.code, "forbidden");
  assert.equal(calls.length, 1, "must not call the server on owner mismatch");

  const unsigned = createFirebaseGrinTransport({
    currentAuth: () => null,
    call: async () => {
      throw new Error("must not call server when unauthenticated");
    },
  });
  const unauth = await unsigned.register({
    uid: OWNER,
    envelope: envelope(),
    digest: "local-digest",
  });
  assert.equal(unauth.ok, false);
  if (unauth.ok) throw new Error("expected unauthenticated");
  assert.equal(unauth.code, "unauthenticated");

  const rec = await transport.reconcile({
    uid: OWNER,
    ledgerId: "ledger_t",
    commandId: "command_t01",
  });
  assert.equal(rec.ok, true);
  assert.equal(calls[1]?.name, GRIN_RECONCILE_CALLABLE);
  assert.deepEqual(calls[1]?.data, { ledgerId: "ledger_t", commandId: "command_t01" });

  const mutated = await transport.mutate({
    uid: OWNER,
    envelope: {
      commandId: "command_t02",
      type: "amendFields",
      ledgerId: "ledger_t",
      body: { receiptId: "receipt_t01" },
    },
    digest: "mut-digest",
  });
  assert.equal(mutated.ok, true);
  assert.equal(calls[2]?.name, GRIN_MUTATE_CALLABLE);
  assert.equal("uid" in (calls[2]?.data as object), false);

  console.log("src/services/grin/transport/firebaseTransport.unit.test.ts: ok (INJECTED / not live deploy)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
