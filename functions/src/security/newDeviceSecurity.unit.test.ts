import assert from "node:assert/strict";

import {
  SECURITY_EMAIL_MAX_WAIT_MS,
  WAS_NOT_ME_TOKEN_TTL_MS,
  applyEmailProviderOutcome,
  createAcceptingSecurityEmailProvider,
  createRejectingSecurityEmailProvider,
  createTimeoutSecurityEmailProvider,
  hashWasNotMeToken,
  parseAndVerifyWasNotMeSignedToken,
  planNewDeviceLogin,
  sendWithMaxWait,
  signWasNotMePayload,
  validateWasNotMeToken,
  type NewDeviceSecurityEventDoc,
  type WasNotMeTokenRecord,
} from "./newDeviceSecurity";

const SECRET = "unit-test-was-not-me-hmac-secret-32chars-min";
const NOW = 1_700_000_000_000;
const EVENT_ID = "evt_abc";
const UID = "uid1";
const SESSION = "sess_new";

function mint(issuedAt = NOW) {
  return signWasNotMePayload(SECRET, {
    eventId: EVENT_ID,
    uid: UID,
    sessionId: SESSION,
    issuedAt,
  });
}

function tokenRecord(raw: string, overrides: Partial<WasNotMeTokenRecord> = {}): WasNotMeTokenRecord {
  return {
    tokenHash: hashWasNotMeToken(raw),
    eventId: EVENT_ID,
    uid: UID,
    sessionId: SESSION,
    issuedAt: NOW,
    expiresAt: NOW + WAS_NOT_ME_TOKEN_TTL_MS,
    consumedAt: null,
    ...overrides,
  };
}

function testTokenValid() {
  const raw = mint();
  const parsed = parseAndVerifyWasNotMeSignedToken(SECRET, raw);
  assert.equal(parsed.ok, true);
  const v = validateWasNotMeToken({
    now: NOW + 1000,
    expectedEventId: EVENT_ID,
    parsed,
    tokenRecord: tokenRecord(raw),
    sessionStatus: "pendingSecurityNotification",
  });
  assert.equal(v.ok, true);
}

function testTokenExpired() {
  const raw = mint();
  const parsed = parseAndVerifyWasNotMeSignedToken(SECRET, raw);
  const v = validateWasNotMeToken({
    now: NOW + WAS_NOT_ME_TOKEN_TTL_MS + 1,
    expectedEventId: EVENT_ID,
    parsed,
    tokenRecord: tokenRecord(raw),
    sessionStatus: "pendingSecurityNotification",
  });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, "expired");
}

function testTokenReused() {
  const raw = mint();
  const parsed = parseAndVerifyWasNotMeSignedToken(SECRET, raw);
  const v = validateWasNotMeToken({
    now: NOW + 1000,
    expectedEventId: EVENT_ID,
    parsed,
    tokenRecord: tokenRecord(raw, { consumedAt: NOW + 500 }),
    sessionStatus: "pendingSecurityNotification",
  });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, "reused");
}

function testWrongEvent() {
  const raw = mint();
  const parsed = parseAndVerifyWasNotMeSignedToken(SECRET, raw);
  const v = validateWasNotMeToken({
    now: NOW + 1000,
    expectedEventId: "other_event",
    parsed,
    tokenRecord: tokenRecord(raw),
    sessionStatus: "pendingSecurityNotification",
  });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, "wrong_event");
}

function testTampered() {
  const raw = mint() + "x";
  const parsed = parseAndVerifyWasNotMeSignedToken(SECRET, raw);
  assert.equal(parsed.ok, false);
  const v = validateWasNotMeToken({
    now: NOW + 1000,
    expectedEventId: EVENT_ID,
    parsed,
    tokenRecord: null,
    sessionStatus: "pendingSecurityNotification",
  });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, "tampered");
}

function testAlreadyRevoked() {
  const raw = mint();
  const parsed = parseAndVerifyWasNotMeSignedToken(SECRET, raw);
  const v = validateWasNotMeToken({
    now: NOW + 1000,
    expectedEventId: EVENT_ID,
    parsed,
    tokenRecord: tokenRecord(raw),
    sessionStatus: "revoked",
  });
  assert.equal(v.ok, false);
  if (!v.ok) {
    assert.equal(v.reason, "already_revoked");
    assert.equal(v.securedConfirmation, true);
  }
}

function testPlanRevokesOlder() {
  const planned = planNewDeviceLogin({
    existingSessions: [
      {
        sessionId: "old1",
        uid: UID,
        deviceInstallationId: "d0",
        createdAt: NOW - 1000,
        status: "active",
        revokedAt: null,
        pendingSecurityNotification: false,
        securityEventId: null,
      },
      {
        sessionId: SESSION,
        uid: UID,
        deviceInstallationId: "d1",
        createdAt: NOW,
        status: "pendingSecurityNotification",
        revokedAt: null,
        pendingSecurityNotification: true,
        securityEventId: EVENT_ID,
      },
    ],
    newSessionId: SESSION,
    uid: UID,
    deviceInstallationId: "d1",
    now: NOW,
    eventId: EVENT_ID,
  });
  assert.deepEqual(planned.revokeSessionIds, ["old1"]);
  assert.equal(planned.newSession.status, "pendingSecurityNotification");
  assert.equal(planned.newSession.pendingSecurityNotification, true);
}

async function testProviderAcceptedRejectedTimeout() {
  const baseEvent: NewDeviceSecurityEventDoc = {
    eventId: EVENT_ID,
    uid: UID,
    newSessionId: SESSION,
    deviceInstallationId: "d1",
    createdAt: NOW,
    emailState: "pending",
    emailAttempts: 0,
    lastEmailAttemptAt: null,
    revokedOlderSessionIds: ["old1"],
    wasNotMeConsumedAt: null,
    securedConfirmedAt: null,
  };

  const accepted = applyEmailProviderOutcome(
    baseEvent,
    await createAcceptingSecurityEmailProvider().sendSecurityLoginEmail({
      to: "a@b.co",
      uid: UID,
      eventId: EVENT_ID,
      sessionId: SESSION,
      wasNotMeUrl: "https://x",
      idempotencyKey: "k1",
    }),
    NOW
  );
  assert.equal(accepted.newSessionStatus, "active");
  assert.equal(accepted.allowRetry, false);

  const rejected = applyEmailProviderOutcome(
    baseEvent,
    await createRejectingSecurityEmailProvider().sendSecurityLoginEmail({
      to: "a@b.co",
      uid: UID,
      eventId: EVENT_ID,
      sessionId: SESSION,
      wasNotMeUrl: "https://x",
      idempotencyKey: "k2",
    }),
    NOW
  );
  assert.equal(rejected.newSessionStatus, "blocked");
  assert.equal(rejected.allowRetry, true);

  const timed = await sendWithMaxWait(
    createTimeoutSecurityEmailProvider(SECURITY_EMAIL_MAX_WAIT_MS + 2000),
    {
      to: "a@b.co",
      uid: UID,
      eventId: EVENT_ID,
      sessionId: SESSION,
      wasNotMeUrl: "https://x",
      idempotencyKey: "k3",
    },
    50
  );
  assert.equal(timed.state, "timeout");
  const afterTimeout = applyEmailProviderOutcome(baseEvent, timed, NOW);
  assert.equal(afterTimeout.newSessionStatus, "blocked");
  assert.equal(afterTimeout.allowRetry, true);
}

testTokenValid();
testTokenExpired();
testTokenReused();
testWrongEvent();
testTampered();
testAlreadyRevoked();
testPlanRevokesOlder();

testProviderAcceptedRejectedTimeout()
  .then(() => {
    console.log("newDeviceSecurity.unit.test.ts: ok");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
