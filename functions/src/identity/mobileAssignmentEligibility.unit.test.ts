import assert from "node:assert/strict";

import {
  decideResolverMobileEligibility,
  shouldCancelQuarantineOnUnassignedBind,
} from "./mobileAssignmentEligibility";
import {
  assertMobileNotQuarantinedPure,
  createEmptyQuarantineState,
  sha256MobileHash,
  startMobileQuarantinePure,
} from "./mobileQuarantine";

const AUTH = "authUidHYTk93";
const FORMER = "authUidD32bC2";
const PHONE_A = "+919999994148";
const NOW = 1_780_000_000_000;

function testFreshUnassignedCreatesSignup() {
  const d = decideResolverMobileEligibility({
    phoneIndexUid: null,
    authUid: AUTH,
    quarantineBlocking: false,
  });
  assert.equal(d.kind, "signup");
  if (d.kind === "signup") assert.equal(d.releaseStaleQuarantine, false);
}

function testRetrySameUnassignedStillSignup() {
  const d = decideResolverMobileEligibility({
    phoneIndexUid: "",
    authUid: AUTH,
    quarantineBlocking: false,
  });
  assert.equal(d.kind, "signup");
}

function testAssignedToSelfIsLogin() {
  const d = decideResolverMobileEligibility({
    phoneIndexUid: AUTH,
    authUid: AUTH,
    quarantineBlocking: false,
  });
  assert.equal(d.kind, "login");
}

function testAssignedToOtherIsConflict() {
  const d = decideResolverMobileEligibility({
    phoneIndexUid: FORMER,
    authUid: AUTH,
    quarantineBlocking: false,
  });
  assert.equal(d.kind, "conflict");
}

function testOtpVerifiedNeverAssignedStillEligible() {
  const d = decideResolverMobileEligibility({
    phoneIndexUid: null,
    authUid: AUTH,
    quarantineBlocking: false,
  });
  assert.equal(d.kind, "signup");
}

function testAbandonedOnboardingUnassignedEligible() {
  const d = decideResolverMobileEligibility({
    phoneIndexUid: null,
    authUid: AUTH,
    quarantineBlocking: false,
  });
  assert.equal(d.kind, "signup");
}

function testChangedAwayAUnassignedEligible() {
  const d = decideResolverMobileEligibility({
    phoneIndexUid: null,
    authUid: AUTH,
    quarantineBlocking: false,
  });
  assert.equal(d.kind, "signup");
}

function testStaleQuarantineNoUeidDoesNotBlockSignup() {
  const state = createEmptyQuarantineState();
  const hash = sha256MobileHash(PHONE_A);
  startMobileQuarantinePure(state, {
    mobileHash: hash,
    formerUid: FORMER,
    reason: "mobile_change",
    now: NOW,
  });
  assert.throws(() => assertMobileNotQuarantinedPure(state, hash, NOW));

  const d = decideResolverMobileEligibility({
    phoneIndexUid: null,
    authUid: AUTH,
    quarantineBlocking: true,
  });
  assert.equal(d.kind, "signup");
  if (d.kind === "signup") assert.equal(d.releaseStaleQuarantine, true);
}

function testQuarantineDoesNotOverrideOtherOwnerConflict() {
  const d = decideResolverMobileEligibility({
    phoneIndexUid: FORMER,
    authUid: AUTH,
    quarantineBlocking: true,
  });
  assert.equal(d.kind, "conflict");
}

function testOwnerLoginDespiteQuarantineMarker() {
  const d = decideResolverMobileEligibility({
    phoneIndexUid: AUTH,
    authUid: AUTH,
    quarantineBlocking: true,
  });
  assert.equal(d.kind, "login");
}

function testContactChangeCancelsStaleQuarantineWhenUnassigned() {
  assert.equal(
    shouldCancelQuarantineOnUnassignedBind({
      phoneIndexOwnerUid: null,
      currentUid: AUTH,
      quarantineBlocking: true,
    }),
    true
  );
  assert.equal(
    shouldCancelQuarantineOnUnassignedBind({
      phoneIndexOwnerUid: FORMER,
      currentUid: AUTH,
      quarantineBlocking: true,
    }),
    false
  );
  assert.equal(
    shouldCancelQuarantineOnUnassignedBind({
      phoneIndexOwnerUid: null,
      currentUid: AUTH,
      quarantineBlocking: false,
    }),
    false
  );
}

function testResolverSourceDoesNotHardGateUnassignedQuarantine() {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const src = readFileSync(join(__dirname, "resolveOrCreateUserByPhone.ts"), "utf8");
  assert.match(src, /decideResolverMobileEligibility/);
  assert.match(src, /releaseStaleQuarantine/);
  assert.equal(src.includes("await assertMobileNotQuarantined(tx, mobileHash, now)"), false);
}

function testEmailAnalogueUsesBindingOwnershipNotQuarantine() {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const challenge = readFileSync(join(__dirname, "../email/challengeService.ts"), "utf8");
  assert.match(challenge, /assertEmailNotBoundElsewhere/);
  assert.match(challenge, /EMAIL_ALREADY_BOUND/);
  assert.equal(challenge.includes("emailQuarantine"), false);
  assert.equal(challenge.includes("throwMobileQuarantined"), false);
}

function testResolverCancelsStaleQuarantineOnSignupWrite() {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const src = readFileSync(join(__dirname, "resolveOrCreateUserByPhone.ts"), "utf8");
  assert.match(src, /cancelStaleMobileQuarantine|applyResolverQuarantineWrites/);
  assert.match(src, /staleQuarantineCancelled/);
}

testFreshUnassignedCreatesSignup();
testRetrySameUnassignedStillSignup();
testAssignedToSelfIsLogin();
testAssignedToOtherIsConflict();
testOtpVerifiedNeverAssignedStillEligible();
testAbandonedOnboardingUnassignedEligible();
testChangedAwayAUnassignedEligible();
testStaleQuarantineNoUeidDoesNotBlockSignup();
testQuarantineDoesNotOverrideOtherOwnerConflict();
testOwnerLoginDespiteQuarantineMarker();
testContactChangeCancelsStaleQuarantineWhenUnassigned();
testResolverSourceDoesNotHardGateUnassignedQuarantine();
testEmailAnalogueUsesBindingOwnershipNotQuarantine();
testResolverCancelsStaleQuarantineOnSignupWrite();

console.log("mobileAssignmentEligibility.unit.test.ts: ok");
