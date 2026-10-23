import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  assertContentBinding,
  classifyStoredRecord,
  loadContentKey,
  migrateContentKeyBatch,
  openContent,
  openStoredContent,
  planContentKeyMigration,
  sealContent,
  sealContentV2,
  type ContentSeal,
} from "./contentEncryption";

const key = randomBytes(32);
const title = "Warehouse gate replacement";

function bind(revision = 7) {
  return {
    key,
    uid: "owner-a",
    collection: "entries",
    recordId: "rec-1",
    revision,
    purpose: "diary",
  };
}

function clientA(): ContentSeal {
  return sealContent({ ...bind(), plaintext: Buffer.from(title, "utf8") });
}

function clientB(seal: ContentSeal, overrides: Partial<ReturnType<typeof bind>> = {}): string {
  return openContent({ ...bind(), ...overrides, seal }).toString("utf8");
}

const sealed = clientA();
assert.equal(clientB(sealed), title);
assert.equal(sealed.ciphertext.includes(Buffer.from(title).toString("base64")), false);
assert.equal(JSON.stringify(sealed).includes(title), false);

assert.throws(() => clientB(sealed, { uid: "owner-b" }), /wrong_owner/);
assert.throws(() => clientB(sealed, { revision: 8 }), /stale_revision/);
const tampered = { ...sealed, ciphertext: Buffer.from("tampered-bytes").toString("base64") };
assert.throws(() => clientB(tampered), /content_tampered/);
assert.throws(() => loadContentKey({} as NodeJS.ProcessEnv), /content_key_unavailable/);
assert.throws(() => loadContentKey({ CONTENT_DATA_KEY: key.toString("base64") + "!" }), /content_key_unavailable/);
for (const size of [0, 4, 8, 12, 15]) {
  assert.throws(() => clientB({ ...sealed, tag: Buffer.from(sealed.tag, "base64").subarray(0, size).toString("base64") }), /content_tampered/);
}
assert.throws(() => clientB({ ...sealed, nonce: Buffer.alloc(8).toString("base64") }), /content_tampered/);
assert.throws(() => clientB({ ...sealed, ciphertext: sealed.ciphertext + "!" }), /content_tampered/);
assert.throws(() => clientB(sealed, { key: randomBytes(32) }), /content_tampered/);
assert.throws(() => clientB(sealed, { recordId: "rec-2" }), /wrong_record/);
assert.throws(() => clientB(sealed, { collection: "attachments" }), /wrong_collection/);
assert.throws(() => clientB(sealed, { purpose: "attachment" }), /wrong_purpose/);

const legacy = { id: "old", title: "plain invoice" };
const mixed = [legacy, { id: "new", contentSeal: sealed }];
assert.deepEqual(mixed.map((row) => classifyStoredRecord(row)), ["legacy", "sealed"]);
assert.equal(classifyStoredRecord(legacy), "legacy");
assert.equal(clientB(sealed), title);

const source = readFileSync(resolve(__dirname, "contentEncryption.ts"), "utf8");
const callable = readFileSync(resolve(__dirname, "ownerContent.ts"), "utf8");
assert.doesNotMatch(source, /console\./);
assert.doesNotMatch(callable, /console\./);
assert.doesNotMatch(callable, /plaintextBase64\}/);

const keyA = randomBytes(32);
const keyB = randomBytes(32);
const v2 = sealContentV2({ ...bind(), key: keyA, keyId: "k-a", plaintext: Buffer.from(title) });
assert.equal(v2.v, 2);
assert.equal(openContent({ ...bind(), key: keyB, seal: v2, resolveKey: (id) => (id === "k-a" ? keyA : null) }).toString(), title);
let lookedUp: string[] = [];
assert.throws(() => openContent({
  ...bind(),
  key: keyA,
  seal: { ...v2, keyId: "k-b" },
  resolveKey: (id) => {
    lookedUp.push(id);
    return id === "k-b" ? keyB : keyA;
  },
}), /content_tampered|unknown_key/);
assert.deepEqual(lookedUp, ["k-b"]);
assert.throws(() => openContent({ ...bind(), key, seal: { ...sealed, v: 9 as 1 } }), /unsupported_seal/);
const plan = planContentKeyMigration([{ contentSeal: null }, { contentSeal: sealed }, { contentSeal: v2 }, { contentSeal: { v: 9 } }]);
assert.deepEqual(plan, { mode: "count-only", counts: { plaintext: 1, v1: 1, v2: 1, unknown: 1 }, writes: 0 });
assert.throws(() => assertContentBinding({ collection: "entries", purpose: "attachment", revision: 1 }), /binding_rejected/);
assert.throws(() => assertContentBinding({ collection: "entries", purpose: "diary", revision: 1.5 }), /binding_rejected/);
const named = Buffer.from("b".repeat(32));
const v2Only = sealContentV2({ ...bind(), key: named, keyId: "named-key", plaintext: Buffer.from(title) });
assert.equal(openStoredContent({
  env: { CONTENT_DATA_KEYS: JSON.stringify({ "named-key": named.toString("base64") }) },
  ...bind(),
  seal: v2Only,
}).toString(), title);
assert.throws(() => migrateContentKeyBatch({
  rows: [{ id: "a", updatedAt: 1, contentSeal: sealed }],
  toKeyId: "named-key",
  resolveKey: () => named,
  dryRun: false,
}), /migration_disabled/);
const dry = migrateContentKeyBatch({
  rows: [{ id: "a", updatedAt: 1, contentSeal: sealed }, { id: "b", updatedAt: 2, contentSeal: v2Only }],
  toKeyId: "named-key",
  resolveKey: (id) => (id === "named-key" ? named : null),
  dryRun: true,
});
assert.equal(dry.written, 0);
assert.equal(dry.skipped, 1);
process.env.CONTENT_KEY_MIGRATION_ENABLED = "true";
const applied = migrateContentKeyBatch({
  rows: [{ id: "a", updatedAt: 1, contentSeal: sealed }],
  toKeyId: "named-key",
  resolveKey: (id) => (id === "named-key" ? named : id === "legacy" ? key : null),
  dryRun: false,
  writer: () => "ok",
});
delete process.env.CONTENT_KEY_MIGRATION_ENABLED;
assert.equal(applied.written, 1);

console.log("contentEncryption.unit.test.ts: ok");
