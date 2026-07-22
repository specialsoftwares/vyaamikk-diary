import assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";

import {
  MOBILE_QUARANTINE_MS,
  MOBILE_QUARANTINE_USER_MESSAGE,
  assertMobileNotQuarantinedPure,
  computeQuarantineReleaseAt,
  createEmptyQuarantineState,
  detectRebindRace,
  isQuarantineBlocking,
  planQuarantineRebind,
  quarantineStatusAt,
  rebindQuarantinedMobilePure,
  releaseMobileQuarantineIfDuePure,
  sha256MobileHash,
  startMobileQuarantinePure,
} from "./mobileQuarantine";

const NOW = 1_700_000_000_000;
const OLD_PHONE = "+919876543210";
const NEWER_PHONE = "+919811122233";
const UID = "uid-original";

function testHashNeverRawPhone() {
  const h = sha256MobileHash(OLD_PHONE);
  assert.equal(h.length, 64);
  assert.match(h, /^[a-f0-9]{64}$/);
  assert.notEqual(h, OLD_PHONE);
  assert.equal(sha256MobileHash("9876543210"), h);
  assert.equal(sha256MobileHash("  +919876543210 "), h);
}

function testReleaseAt21Days() {
  assert.equal(computeQuarantineReleaseAt(NOW), NOW + MOBILE_QUARANTINE_MS);
  assert.equal(MOBILE_QUARANTINE_MS, 21 * 24 * 60 * 60 * 1000);
}

function testRegistrationBlockedWhileQuarantined() {
  const state = createEmptyQuarantineState();
  const mobileHash = sha256MobileHash(OLD_PHONE);
  startMobileQuarantinePure(state, {
    mobileHash,
    formerUid: UID,
    reason: "mobile_change",
    now: NOW,
  });
  assert.equal(isQuarantineBlocking(state.quarantines[mobileHash], NOW + 1000), true);
  assert.throws(
    () => assertMobileNotQuarantinedPure(state, mobileHash, NOW + 1000),
    (err: unknown) => {
      assert.ok(err instanceof HttpsError);
      assert.equal(err.message, MOBILE_QUARANTINE_USER_MESSAGE);
      assert.equal(err.message.includes("quarantine"), false);
      assert.equal(err.message.includes("21"), false);
      return true;
    }
  );
}

function testNeutralErrorOnly() {
  assert.equal(
    MOBILE_QUARANTINE_USER_MESSAGE,
    "This mobile number is temporarily unavailable. Please try again later."
  );
}

function testAtomicRebindNewerNotQuarantined() {
  const state = createEmptyQuarantineState();
  const oldHash = sha256MobileHash(OLD_PHONE);
  const newerHash = sha256MobileHash(NEWER_PHONE);

  startMobileQuarantinePure(state, {
    mobileHash: oldHash,
    formerUid: UID,
    reason: "mobile_change",
    now: NOW,
  });
  state.bindings[newerHash] = {
    mobileHash: newerHash,
    uid: UID,
    boundAt: NOW,
    updatedAt: NOW,
  };

  const result = rebindQuarantinedMobilePure(state, {
    oldMobileHash: oldHash,
    newerMobileHash: newerHash,
    originalUid: UID,
    now: NOW + 60_000,
  });
  assert.equal(result.race, null);
  assert.equal(result.plan.quarantineNewerNumber, false);
  assert.equal(result.plan.releaseNewerNumberImmediately, true);
  assert.equal(state.quarantines[oldHash]?.status, "cancelled");
  assert.equal(state.bindings[oldHash]?.uid, UID);
  assert.equal(state.bindings[newerHash], undefined);
  // Newer must not gain an active quarantine from rebind.
  assert.equal(state.quarantines[newerHash], undefined);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0]?.detail?.quarantineNewerNumber, false);

  const plan = planQuarantineRebind();
  assert.equal(plan.quarantineNewerNumber, false);
}

function testIdempotentRelease() {
  const state = createEmptyQuarantineState();
  const mobileHash = sha256MobileHash(OLD_PHONE);
  startMobileQuarantinePure(state, {
    mobileHash,
    formerUid: UID,
    reason: "account_deletion",
    now: NOW,
  });
  const due = NOW + MOBILE_QUARANTINE_MS + 1;
  const first = releaseMobileQuarantineIfDuePure(state, mobileHash, due);
  assert.equal(first.released, true);
  assert.equal(first.alreadyReleased, false);
  assert.equal(quarantineStatusAt(state.quarantines[mobileHash], due), "released");

  const second = releaseMobileQuarantineIfDuePure(state, mobileHash, due + 1000);
  assert.equal(second.released, false);
  assert.equal(second.alreadyReleased, true);

  // Not yet due → no-op
  const earlyState = createEmptyQuarantineState();
  startMobileQuarantinePure(earlyState, {
    mobileHash,
    formerUid: UID,
    reason: "mobile_change",
    now: NOW,
  });
  const early = releaseMobileQuarantineIfDuePure(earlyState, mobileHash, NOW + 1000);
  assert.equal(early.released, false);
  assert.equal(earlyState.quarantines[mobileHash]?.status, "active");
}

function testRaceAlreadyRebound() {
  const state = createEmptyQuarantineState();
  const oldHash = sha256MobileHash(OLD_PHONE);
  const newerHash = sha256MobileHash(NEWER_PHONE);
  startMobileQuarantinePure(state, {
    mobileHash: oldHash,
    formerUid: UID,
    reason: "mobile_change",
    now: NOW,
  });
  const first = rebindQuarantinedMobilePure(state, {
    oldMobileHash: oldHash,
    newerMobileHash: newerHash,
    originalUid: UID,
    now: NOW + 1,
  });
  assert.equal(first.race, null);

  const second = rebindQuarantinedMobilePure(state, {
    oldMobileHash: oldHash,
    newerMobileHash: newerHash,
    originalUid: UID,
    now: NOW + 2,
  });
  assert.equal(second.race, "already_rebound");
  assert.equal(detectRebindRace({ quarantine: null, expectedFormerUid: UID, now: NOW }), "quarantine_missing");
}

testHashNeverRawPhone();
testReleaseAt21Days();
testRegistrationBlockedWhileQuarantined();
testNeutralErrorOnly();
testAtomicRebindNewerNotQuarantined();
testIdempotentRelease();
testRaceAlreadyRebound();

console.log("mobileQuarantine.unit.test.ts: ok");
