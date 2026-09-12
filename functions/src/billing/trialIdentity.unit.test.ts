/**
 * Durable trial-identity HMAC contract tests (owner decision W-4).
 * Run: npm run test:billing-trial-identity
 */

import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";

import { trialIdentityHmac, TRIAL_IDENTITY_SECRET_MIN_LENGTH } from "./trialIdentity";

const TEST_SECRET = "unit-test-only-trial-identity-secret-0123456789";
assert.ok(TEST_SECRET.length >= TRIAL_IDENTITY_SECRET_MIN_LENGTH);

// Deterministic, 64-char lowercase hex.
const id1 = trialIdentityHmac(TEST_SECRET, "+919876543210");
assert.match(id1, /^[0-9a-f]{64}$/);
assert.equal(trialIdentityHmac(TEST_SECRET, "+919876543210"), id1);

// Formatting/normalization equivalence: the durable identity must not change
// with input formatting (reinstall / different client versions).
assert.equal(trialIdentityHmac(TEST_SECRET, "+91 98765 43210"), id1);
assert.equal(trialIdentityHmac(TEST_SECRET, "9876543210"), id1); // 10-digit India default
assert.equal(trialIdentityHmac(TEST_SECRET, "919876543210"), id1); // 91-prefixed

// Different phones and different secrets both change the identity.
assert.notEqual(trialIdentityHmac(TEST_SECRET, "+919876543211"), id1);
assert.notEqual(trialIdentityHmac(`${TEST_SECRET}-other`, "+919876543210"), id1);

// W-4: must be keyed HMAC-SHA256 of the normalized number — and NOT any of
// the explicitly rejected constructions.
assert.equal(
  id1,
  createHmac("sha256", TEST_SECRET).update("+919876543210", "utf8").digest("hex")
);
assert.notEqual(id1, createHash("sha256").update("+919876543210").digest("hex")); // plain SHA-256
assert.notEqual(
  id1,
  createHash("sha256").update(`${TEST_SECRET}+919876543210`).digest("hex") // SHA256(salt+phone)
);

// The identifier must not leak the phone digits.
assert.ok(!id1.includes("9876543210"));

// Fail-closed guards: short secret and unusable phone must throw.
assert.throws(() => trialIdentityHmac("short-secret", "+919876543210"));
assert.throws(() => trialIdentityHmac(TEST_SECRET, ""));
assert.throws(() => trialIdentityHmac(TEST_SECRET, "   "));

console.log("trialIdentity.unit.test.ts: ok");
