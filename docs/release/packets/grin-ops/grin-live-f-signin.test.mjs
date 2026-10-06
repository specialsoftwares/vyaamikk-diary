import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";

import {
  IdTokenVerifyError,
  MAX_SESSION_BODY_BYTES,
  VERIFY_PROJECT_ID,
  assertSameOriginHandoff,
  assertUidMatchesAdmission,
  verifyFirebaseIdToken,
} from "./grin-live-f-verify-id-token.mjs";
import { handleSessionPost } from "./grin-live-f-signin.mjs";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = publicKey.export({ type: "spki", format: "pem" });
// convert SPKI to a fake "certificate" text that createPublicKey accepts —
// createPublicKey accepts SPKI PEM directly; verifier uses createPublicKey(pem).
// Our production path expects BEGIN CERTIFICATE; createPublicKey also accepts
// BEGIN PUBLIC KEY. For tests, patch verify to use SPKI by exporting a cert-like
// flow: Node createPublicKey accepts both. Update verifier to accept PUBLIC KEY
// OR use a self-signed cert. Simpler: use injectable certs with PUBLIC KEY and
// make verifyFirebaseIdToken accept PUBLIC KEY too.

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function mintToken({
  aud = VERIFY_PROJECT_ID,
  iss = `https://securetoken.google.com/${VERIFY_PROJECT_ID}`,
  sub = "owner_uid_test_abc",
  exp = Math.floor(Date.now() / 1000) + 3600,
  iat = Math.floor(Date.now() / 1000) - 10,
  kid = "test-kid",
  extra = {},
} = {}) {
  const header = b64url(JSON.stringify({ alg: "RS256", kid }));
  const payload = b64url(
    JSON.stringify({ aud, iss, sub, user_id: sub, exp, iat, auth_time: iat, ...extra }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const sig = b64url(signer.sign(privateKey));
  return `${header}.${payload}.${sig}`;
}

const CERTS = { "test-kid": PEM };

test("verifyFirebaseIdToken accepts valid vyaamikk-diary token", async () => {
  // Production checks BEGIN CERTIFICATE; allow PUBLIC KEY in verifier via createPublicKey
  // which accepts SPKI. Update production check to accept either.
  const token = mintToken();
  const claims = await verifyFirebaseIdToken(token, { certs: CERTS, nowMs: Date.now() });
  assert.equal(claims.uid, "owner_uid_test_abc");
  assert.equal(claims.projectId, VERIFY_PROJECT_ID);
});

test("rejects invalid, expired, wrong-project, and wrong-owner tokens", async () => {
  await assert.rejects(
    () => verifyFirebaseIdToken("not-a-valid-jwt", { certs: CERTS }),
    (err) => err instanceof IdTokenVerifyError && err.code === "invalid_token",
  );
  const expired = mintToken({ exp: Math.floor(Date.now() / 1000) - 10 });
  await assert.rejects(
    () => verifyFirebaseIdToken(expired, { certs: CERTS, nowMs: Date.now() }),
    (err) => err instanceof IdTokenVerifyError && err.code === "expired_token",
  );
  const wrongProject = mintToken({
    aud: "other-project",
    iss: "https://securetoken.google.com/other-project",
  });
  await assert.rejects(
    () => verifyFirebaseIdToken(wrongProject, { certs: CERTS, nowMs: Date.now() }),
    (err) => err instanceof IdTokenVerifyError && err.code === "wrong_project",
  );
  assert.throws(
    () => assertUidMatchesAdmission("owner_uid_test_abc", "someone_else"),
    (err) => err instanceof IdTokenVerifyError && err.code === "wrong_owner",
  );
});

test("/session rejects forged body.uid with invalid jwt", async () => {
  const admitted = "owner_uid_test_abc";
  const nonce = "nonce-one";
  const origin = "http://127.0.0.1:8787";
  const result = await handleSessionPost({
    rawBody: JSON.stringify({
      uid: admitted,
      idToken: "not-a-valid-jwt",
      sessionNonce: nonce,
    }),
    admittedUid: admitted,
    expectedNonce: nonce,
    origin,
    reqHeaders: { origin },
    verifyIdToken: verifyFirebaseIdToken,
    nonceConsumed: () => false,
  });
  assert.notEqual(result.status, 200);
  assert.equal(result.json.ok, false);
  assert.ok(["invalid_token", "expired_token"].includes(result.json.reason));
});

test("/session ignores body.uid and accepts only verified claims matching admission", async () => {
  const admitted = "owner_uid_test_abc";
  const nonce = "nonce-two";
  const origin = "http://127.0.0.1:8787";
  const token = mintToken({ sub: admitted });
  const forgedOwner = await handleSessionPost({
    rawBody: JSON.stringify({
      uid: admitted,
      idToken: mintToken({ sub: "attacker_uid_xxxx" }),
      sessionNonce: nonce,
    }),
    admittedUid: admitted,
    expectedNonce: nonce,
    origin,
    reqHeaders: { origin },
    verifyIdToken: (t, o) => verifyFirebaseIdToken(t, { ...o, certs: CERTS }),
    nonceConsumed: () => false,
  });
  assert.equal(forgedOwner.status, 403);
  assert.equal(forgedOwner.json.reason, "wrong_owner");

  const ok = await handleSessionPost({
    rawBody: JSON.stringify({
      uid: "ignored-attacker",
      idToken: token,
      sessionNonce: nonce,
    }),
    admittedUid: admitted,
    expectedNonce: nonce,
    origin,
    reqHeaders: { origin },
    verifyIdToken: (t, o) => verifyFirebaseIdToken(t, { ...o, certs: CERTS }),
    nonceConsumed: () => false,
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.ok, true);
  assert.equal(ok.session.uid, admitted);
});

test("/session enforces nonce, same-origin, body size, and one-use", async () => {
  const admitted = "owner_uid_test_abc";
  const nonce = "nonce-three";
  const origin = "http://127.0.0.1:8787";
  const token = mintToken({ sub: admitted });
  const verify = (t, o) => verifyFirebaseIdToken(t, { ...o, certs: CERTS });

  const badNonce = await handleSessionPost({
    rawBody: JSON.stringify({ idToken: token, sessionNonce: "wrong" }),
    admittedUid: admitted,
    expectedNonce: nonce,
    origin,
    reqHeaders: { origin },
    verifyIdToken: verify,
    nonceConsumed: () => false,
  });
  assert.equal(badNonce.status, 403);
  assert.equal(badNonce.json.reason, "nonce_mismatch");

  const cross = await handleSessionPost({
    rawBody: JSON.stringify({ idToken: token, sessionNonce: nonce }),
    admittedUid: admitted,
    expectedNonce: nonce,
    origin,
    reqHeaders: { origin: "https://evil.example" },
    verifyIdToken: verify,
    nonceConsumed: () => false,
  });
  assert.equal(cross.status, 403);
  assert.equal(cross.json.reason, "cross_origin");

  assert.throws(
    () => assertSameOriginHandoff({ headers: {} }, origin),
    (e) => e.code === "missing_origin",
  );

  const huge = "x".repeat(MAX_SESSION_BODY_BYTES + 1);
  const big = await handleSessionPost({
    rawBody: huge,
    admittedUid: admitted,
    expectedNonce: nonce,
    origin,
    reqHeaders: { origin },
    verifyIdToken: verify,
    nonceConsumed: () => false,
  });
  assert.equal(big.status, 413);

  let used = false;
  const first = await handleSessionPost({
    rawBody: JSON.stringify({ idToken: token, sessionNonce: nonce }),
    admittedUid: admitted,
    expectedNonce: nonce,
    origin,
    reqHeaders: { origin },
    verifyIdToken: verify,
    nonceConsumed: () => used,
  });
  assert.equal(first.status, 200);
  used = true;
  const second = await handleSessionPost({
    rawBody: JSON.stringify({ idToken: token, sessionNonce: nonce }),
    admittedUid: admitted,
    expectedNonce: nonce,
    origin,
    reqHeaders: { origin },
    verifyIdToken: verify,
    nonceConsumed: () => used,
  });
  assert.equal(second.status, 409);
  assert.equal(second.json.reason, "nonce_reused");
});

test("/session rejects handoff after timeout/session_closed", async () => {
  const admitted = "owner_uid_test_abc";
  const nonce = "nonce-closed";
  const origin = "http://127.0.0.1:8787";
  const token = mintToken({ sub: admitted });
  const closed = await handleSessionPost({
    rawBody: JSON.stringify({ idToken: token, sessionNonce: nonce }),
    admittedUid: admitted,
    expectedNonce: nonce,
    origin,
    reqHeaders: { origin },
    verifyIdToken: (t, o) => verifyFirebaseIdToken(t, { ...o, certs: CERTS }),
    nonceConsumed: () => false,
    sessionClosed: () => true,
  });
  assert.equal(closed.status, 409);
  assert.equal(closed.json.reason, "session_closed");
});
