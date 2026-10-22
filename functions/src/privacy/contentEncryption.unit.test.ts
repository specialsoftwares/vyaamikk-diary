import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  classifyStoredRecord,
  loadContentKey,
  openContent,
  sealContent,
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

console.log("contentEncryption.unit.test.ts: ok");
