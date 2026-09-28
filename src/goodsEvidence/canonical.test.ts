import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { CANONICAL_JSON_VERSION } from "./constants";
import { canonicalJson, canonicalize } from "./canonical";
import { detectBrokenChain, hashCanonical, hashEventEnvelope } from "./hashChain";
import { formatUtcIso } from "./time";
import type { GrinEvent } from "./types";

const fixture = {
  b: 2,
  a: null as null,
  nested: { y: "हिन्दी", x: "12.50", skip: undefined as undefined },
  list: ["தமிழ்", null],
};

const canonical = canonicalJson(fixture);
assert.match(canonical, /"canonicalVersion":"1"/);
assert.equal(CANONICAL_JSON_VERSION, "1");
assert.ok(canonical.indexOf('"a"') < canonical.indexOf('"b"'), "object keys are sorted");
assert.ok(canonical.includes('"a":null'));
assert.ok(!canonical.includes("skip"));
assert.ok(canonical.includes("हिन्दी"));
assert.ok(canonical.includes("தமிழ்"));
assert.ok(canonical.includes('"x":"12.50"'), "decimal strings stay strings");

const expectedHash = createHash("sha256").update(canonical, "utf8").digest("hex");
assert.equal(hashCanonical(fixture), expectedHash);

const withCommit = { amount: "10.00", firestoreCommitTime: "SHOULD_NOT_HASH" };
assert.deepEqual(canonicalize(withCommit), { amount: "10.00" });

const iso = formatUtcIso(Date.UTC(2026, 8, 28, 12, 0, 0, 0));
assert.equal(iso, "2026-09-28T12:00:00.000Z");

const eventA = {
  eventId: "e1",
  receiptId: "r1",
  streamSequence: 1,
  type: "receipt_registered" as const,
  actorUid: "u1",
  serverAcceptedAtUtc: iso,
  clientObservedAtUtc: iso,
  reason: "register",
  expectedPreviousVersion: 0,
  typedChanges: { issuedNumber: "GRIN/MAIN/FY2026-27/000001" },
  previousHash: null,
};

const hash1 = hashEventEnvelope(eventA);
const event1: GrinEvent = {
  schemaVersion: 1,
  ...eventA,
  eventHash: hash1,
  firestoreCommitTime: "later",
};
assert.equal(hashEventEnvelope({ ...eventA, firestoreCommitTime: "nope" } as typeof eventA), hash1);

const eventB = {
  ...eventA,
  eventId: "e2",
  streamSequence: 2,
  type: "field_amended" as const,
  expectedPreviousVersion: 1,
  previousHash: hash1,
};
const event2: GrinEvent = {
  schemaVersion: 1,
  ...eventB,
  eventHash: hashEventEnvelope(eventB),
  firestoreCommitTime: null,
};

assert.equal(detectBrokenChain([event1, event2]), null);

const broken = { ...event2, previousHash: "deadbeef" };
assert.equal(detectBrokenChain([event1, broken]), 1);

console.log("goodsEvidence/canonical.test.ts: ok");
