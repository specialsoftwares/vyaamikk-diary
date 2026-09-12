/**
 * Diagnostic UID HMAC contract.
 * Run: npm run test:billing-diagnostic-uid
 */

import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";

import {
  diagnosticUidHmac,
  BILLING_DIAG_UID_SECRET_MIN_LENGTH,
  DIAGNOSTIC_UID_HEX_LENGTH,
} from "./diagnosticUid";

const SECRET = "unit-test-only-billing-diag-uid-secret-0001";
assert.ok(SECRET.length >= BILLING_DIAG_UID_SECRET_MIN_LENGTH);

const uid = "firebase-uid-alice";
const id = diagnosticUidHmac(SECRET, uid);
assert.equal(id.length, DIAGNOSTIC_UID_HEX_LENGTH);
assert.match(id, /^[0-9a-f]+$/);
assert.equal(diagnosticUidHmac(SECRET, uid), id);
assert.notEqual(diagnosticUidHmac(SECRET, "firebase-uid-bob"), id);
assert.notEqual(diagnosticUidHmac(`${SECRET}x`, uid), id);

const full = createHmac("sha256", SECRET).update(uid, "utf8").digest("hex");
assert.equal(id, full.slice(0, DIAGNOSTIC_UID_HEX_LENGTH));
assert.notEqual(id, uid.slice(0, DIAGNOSTIC_UID_HEX_LENGTH));
assert.notEqual(id, createHash("sha256").update(uid).digest("hex").slice(0, 16));
assert.ok(!id.includes("alice"));
assert.ok(!id.includes(uid));

assert.throws(() => diagnosticUidHmac("short", uid));
assert.throws(() => diagnosticUidHmac(SECRET, ""));

console.log("diagnosticUid.unit.test.ts: ok");
