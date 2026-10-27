/**
 * Production GRIN document adapter. A failed seal commits nothing.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { openContent } from "../privacy/contentEncryption";
import { createMemoryProductionGrinFirestore } from "./productionCompose";

const key = randomBytes(32);
const env = { CONTENT_DATA_KEY: key.toString("base64") };
const malformed = { CONTENT_DATA_KEY: "%%%" };
const receiptPath = "users/owner-a/goodsEvidenceLedgers/ledger-1/receipts/grcp_1";
const commandPath = "users/owner-a/goodsEvidenceLedgers/ledger-1/commands/gcmd_1";
const eventPath = "users/owner-a/goodsEvidenceLedgers/ledger-1/receipts/grcp_1/events/evt_1";
const serialPath = "users/owner-a/goodsEvidenceLedgers/ledger-1/serials/2026";
const quotaPath = "users/owner-a/goodsEvidenceUsage/2026-10";

async function main(): Promise<void> {
  const store = createMemoryProductionGrinFirestore(env);
  const bare = createMemoryProductionGrinFirestore({});
  const bad = createMemoryProductionGrinFirestore(malformed);
  for (const target of [store, bare, bad]) {
    target.seed(serialPath, { nextSerial: 4 });
    target.seed(quotaPath, { used: 2 });
    target.seed(receiptPath, { original: { goods: "legacy note" } });
  }

  await assert.rejects(
    () => bare.runTransaction(async (tx) => {
      tx.set({ path: serialPath }, { nextSerial: 5 });
      tx.set({ path: quotaPath }, { used: 3 });
      tx.set({ path: receiptPath }, { original: { goods: "new note" } });
      tx.set({ path: commandPath }, { body: "new command" });
      tx.set({ path: eventPath }, { name: "registered" });
    }),
    /content_key_unavailable/
  );
  assert.equal(bare.stored(serialPath)?.nextSerial, 4);
  assert.equal(bare.stored(quotaPath)?.used, 2);
  assert.equal((bare.stored(receiptPath)?.original as { goods: string }).goods, "legacy note");
  assert.equal(bare.stored(commandPath), undefined);
  assert.equal(bare.stored(eventPath), undefined);
  assert.deepEqual(bare.read(receiptPath), { original: { goods: "legacy note" } });

  await assert.rejects(
    () => bad.runTransaction(async (tx) => {
      tx.set({ path: serialPath }, { nextSerial: 8 });
      tx.set({ path: receiptPath }, { original: { goods: "nope" } });
    }),
    /content_key_unavailable/
  );
  assert.equal(bad.stored(serialPath)?.nextSerial, 4);
  assert.equal((bad.stored(receiptPath)?.original as { goods: string }).goods, "legacy note");

  await store.runTransaction(async (tx) => {
    tx.set({ path: serialPath }, { nextSerial: 5 });
    tx.set({ path: quotaPath }, { used: 3 });
    tx.set({ path: receiptPath }, { original: { goods: "cement bags" } });
    tx.set({ path: commandPath }, { body: "receive cement" });
    tx.set({ path: eventPath }, { name: "registered" });
  });
  assert.equal(store.stored(serialPath)?.nextSerial, 5);
  assert.equal(store.stored(quotaPath)?.used, 3);
  assert.equal(store.stored(receiptPath)?.grinDocumentSeal, 1);
  assert.equal(JSON.stringify(store.stored(receiptPath)).includes("cement"), false);
  assert.deepEqual(store.read(receiptPath), { original: { goods: "cement bags" } });
  assert.deepEqual(store.read(commandPath), { body: "receive cement" });
  assert.deepEqual(store.read(eventPath), { name: "registered" });

  const sealed = store.stored(receiptPath);
  const withoutKey = createMemoryProductionGrinFirestore({});
  withoutKey.seed(receiptPath, sealed!);
  await assert.rejects(() => withoutKey.runTransaction(async (tx) => {
    tx.set({ path: serialPath }, { nextSerial: 9 });
    const snap = await tx.get({ path: receiptPath });
    snap.data();
  }), /content_key_unavailable/);
  assert.equal(withoutKey.stored(serialPath), undefined);
  assert.equal(withoutKey.stored(receiptPath)?.grinDocumentSeal, 1);

  const tampered = store.stored(receiptPath)!;
  const seal = tampered.contentSeal as { ciphertext: string };
  const flipped = Buffer.from(seal.ciphertext, "base64");
  flipped[0] ^= 0xff;
  store.seed(receiptPath, {
    ...tampered,
    contentSeal: { ...seal, ciphertext: flipped.toString("base64") },
  });
  await assert.rejects(() => store.runTransaction(async (tx) => {
    const snap = await tx.get({ path: receiptPath });
    snap.data();
  }), /content_tampered/);
  assert.equal(store.read(serialPath)?.nextSerial, 5);

  const otherPath = "users/owner-b/goodsEvidenceLedgers/ledger-1/receipts/grcp_1";
  const foreign = createMemoryProductionGrinFirestore(env);
  foreign.seed(otherPath, sealed!);
  await assert.rejects(() => foreign.runTransaction(async (tx) => {
    const snap = await tx.get({ path: otherPath });
    snap.data();
  }), /wrong_owner|wrong_record/);

  const opened = openContent({
    key,
    uid: "owner-a",
    collection: "grinEvidence",
    recordId: commandPath,
    revision: 1,
    purpose: "grin_evidence",
    seal: store.stored(commandPath)!.contentSeal as never,
  });
  assert.equal(JSON.parse(opened.toString("utf8")).body, "receive cement");
  console.log("grin cloud write production adapter passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
