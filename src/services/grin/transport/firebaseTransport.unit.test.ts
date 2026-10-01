/**
 * Firebase JS transport unit tests. INJECTED httpsCallable-style port.
 * Not live deploy. Does not call a deployed function.
 * Label: INJECTED / not live deploy.
 */
import assert from "node:assert/strict";

import { createFirebaseGrinEvidenceTransport } from "./evidenceTransport";
import { createFirebaseGrinTransport } from "./firebaseTransport";
import {
  GRIN_MUTATE_CALLABLE,
  GRIN_READ_CALLABLE,
  GRIN_RECONCILE_CALLABLE,
  GRIN_REGISTER_CALLABLE,
  GRIN_UPLOAD_EVIDENCE_CALLABLE,
} from "./callableNames";

const OWNER = "owner_transport";
const OTHER = "other_uid";
const HASH = "aa".repeat(32);
const HASH2 = "bb".repeat(32);

function envelope() {
  return {
    commandId: "command_t01",
    type: "registerGoodsReceipt" as const,
    ledgerId: "ledger_t",
    body: { receiptId: "receipt_t01" },
  };
}

function registerSuccess() {
  return {
    ok: true as const,
    replayed: false,
    receiptId: "receipt_t01",
    issuedNumber: "GRIN/MAIN/FY2026-27/000001",
    serial: 1,
    serverRegisteredAtUtc: "2026-09-28T12:00:00.000Z",
    eventVersion: 1,
    headHash: HASH,
  };
}

async function main(): Promise<void> {
  const calls: { name: string; data: unknown }[] = [];
  const transport = createFirebaseGrinTransport({
    currentAuth: () => ({ uid: OWNER }),
    call: async (name, data) => {
      calls.push({ name, data });
      if (name === GRIN_REGISTER_CALLABLE) {
        return registerSuccess();
      }
      if (name === GRIN_RECONCILE_CALLABLE) {
        return {
          ...registerSuccess(),
          replayed: true,
          commandType: "registerGoodsReceipt" as const,
        };
      }
      if (name === GRIN_READ_CALLABLE) {
        return {
          ok: false as const,
          code: "not_found" as const,
          detail: "denied",
        };
      }
      return {
        ok: true as const,
        replayed: false,
        receiptId: "receipt_t01",
        eventId: "id_2",
        eventVersion: 2,
        headHash: HASH2,
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

  const read = await transport.readReceipt({
    uid: OWNER,
    ledgerId: "ledger_t",
    receiptId: "receipt_t01",
  });
  assert.equal(read.ok, false);
  if (read.ok) throw new Error("expected parsed not_found");
  assert.equal(read.code, "not_found");
  assert.equal(calls[3]?.name, GRIN_READ_CALLABLE);
  assert.deepEqual(calls[3]?.data, { ledgerId: "ledger_t", receiptId: "receipt_t01" });

  const malformed = createFirebaseGrinTransport({
    currentAuth: () => ({ uid: OWNER }),
    call: async () => ({
      ok: true,
      replayed: false,
      receiptId: "receipt_t01",
    }),
  });
  const malformedResult = await malformed.register({
    uid: OWNER,
    envelope: envelope(),
    digest: "local-digest",
  });
  assert.equal(malformedResult.ok, false, "malformed remote success must not be accepted");
  if (malformedResult.ok) throw new Error("expected malformed integrity");
  assert.equal(malformedResult.code, "integrity");

  const inventedNumber = createFirebaseGrinTransport({
    currentAuth: () => ({ uid: OWNER }),
    call: async () => {
      throw Object.assign(new Error("not found"), { code: "functions/not-found" });
    },
  });
  const unexported = await inventedNumber.register({
    uid: OWNER,
    envelope: envelope(),
    digest: "local-digest",
  });
  assert.equal(unexported.ok, false);
  if (unexported.ok) throw new Error("expected unexported deny");
  assert.equal(unexported.code, "policy_denied");
  assert.equal("issuedNumber" in unexported, false);

  let liveUid = OWNER;
  const switched = createFirebaseGrinTransport({
    currentAuth: () => ({ uid: liveUid }),
    call: async () => {
      liveUid = OTHER;
      return registerSuccess();
    },
  });
  const afterAwait = await switched.register({
    uid: OWNER,
    envelope: envelope(),
    digest: "local-digest",
  });
  assert.equal(afterAwait.ok, false, "uid change after await must be forbidden");
  if (afterAwait.ok) throw new Error("expected forbidden after auth change");
  assert.equal(afterAwait.code, "forbidden");

  const evidence = createFirebaseGrinEvidenceTransport({
    currentAuth: () => ({ uid: OWNER }),
    call: async (name) => {
      assert.equal(name, GRIN_UPLOAD_EVIDENCE_CALLABLE);
      throw Object.assign(new Error("not found"), { code: "functions/not-found" });
    },
  });
  const evidenceClosed = await evidence.upload({
    uid: OWNER,
    ledgerId: "ledger_t",
    receiptId: "receipt_t01",
    evidenceId: "evidence_t01",
    role: "original",
    localPath: "/tmp/not-read",
    claimedSha256: HASH,
    category: "invoice",
    sizeBytes: 12,
  });
  assert.equal(evidenceClosed.ok, false);
  assert.equal(evidenceClosed.originalDurable, false);
  assert.equal(evidenceClosed.evidenceId, null);
  assert.equal(evidenceClosed.actualSha256, null);
  assert.equal(evidenceClosed.retryable, true);

  console.log("src/services/grin/transport/firebaseTransport.unit.test.ts: ok (INJECTED / not live deploy)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
