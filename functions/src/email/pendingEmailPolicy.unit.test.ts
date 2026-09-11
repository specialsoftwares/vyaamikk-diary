import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  decideUnverifiedPendingEmailAction,
  isAuthoritativeVerifiedEmailOwnership,
  rotationActionForStart,
  shouldEnforceResendCooldown,
  shouldWriteUnverifiedPendingUserFields,
} from "./pendingEmailPolicy";

function testPolicy() {
  const now = 1_000_000;
  assert.equal(
    decideUnverifiedPendingEmailAction({
      submittedEmail: "a@x.co",
      pending: null,
      now,
    }).type,
    "fresh"
  );
  assert.equal(
    decideUnverifiedPendingEmailAction({
      submittedEmail: "a@x.co",
      pending: { email: "a@x.co", expiresAt: now + 1 },
      now,
    }).type,
    "resend"
  );
  assert.equal(
    decideUnverifiedPendingEmailAction({
      submittedEmail: "b@x.co",
      pending: { email: "a@x.co", expiresAt: now + 1 },
      now,
    }).type,
    "replace"
  );
  assert.equal(
    decideUnverifiedPendingEmailAction({
      submittedEmail: "b@x.co",
      pending: { email: "a@x.co", expiresAt: now - 1 },
      now,
    }).type,
    "fresh"
  );

  const pending = {
    normalizedEmail: "a@x.co",
    expiresAt: now + 60_000,
    status: "active" as const,
    resendAvailableAt: now + 30_000,
  };
  assert.equal(
    rotationActionForStart({
      currentVerifiedNormalized: "",
      submittedNormalized: "b@x.co",
      pending,
      now,
    }),
    "replace"
  );
  assert.equal(
    shouldEnforceResendCooldown(
      "replace",
      pending,
      now
    ),
    false
  );
  assert.equal(
    shouldEnforceResendCooldown(
      "resend",
      pending,
      now
    ),
    true
  );
  assert.equal(shouldWriteUnverifiedPendingUserFields("verified@x.co"), false);
  assert.equal(shouldWriteUnverifiedPendingUserFields(""), true);
  assert.equal(isAuthoritativeVerifiedEmailOwnership({ status: "active" }), false);
  assert.equal(
    isAuthoritativeVerifiedEmailOwnership({ status: "active", emailStatus: "verified" }),
    true
  );
}

function testChallengeServiceSource() {
  const src = readFileSync(join(__dirname, "challengeService.ts"), "utf8");
  assert.match(src, /rotationActionForStart/);
  assert.match(src, /shouldEnforceResendCooldown/);
  assert.match(src, /shouldWriteUnverifiedPendingUserFields/);
  assert.match(src, /isAuthoritativeVerifiedEmailOwnership/);
  assert.equal(
    src.includes('data.status === "active" ||'),
    false,
    "emailIndex account status 'active' must not count as verified email ownership"
  );
  assert.match(src, /runTransaction/);
  assert.match(src, /status: "superseded"/);
}

testPolicy();
testChallengeServiceSource();
console.log("pendingEmailPolicy.unit.test.ts: ok");
