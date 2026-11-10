/**
 * Production callable + Admin Auth/Firestore emulator regression.
 * Uses Auth emulator phone sign-in, never a real SMS, email, account or project.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deleteApp, getApps } from "firebase-admin/app";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../admin";
import { digestEmailOtp } from "../email/otpCrypto";
import { emailBindingKey } from "../email/emailBindingKey";
import { completeAccountRecovery } from "./accountRecovery";
import { resolveOrCreateUserByPhone } from "../identity/resolveOrCreateUserByPhone";
import {
  adminReactivationDb,
  performStartAccountReactivation,
  performCompleteAccountReactivation,
} from "../reactivation/accountReactivation";
import { EMPTY_PHASES } from "../deletion/deletionJob";
import { REACTIVATION_JOBS } from "../reactivation/reactivationOtp";
import { __setRecoveryFinalizationFaultForTests } from "./recoveryFinalization";
import { __setEmailProviderForEmulatorTests } from "../email/provider";
import { AUTH_SECURITY_COLLECTION } from "../identity/sessionSecurityPolicy";

const SECRET = "emulator-only-email-otp-hmac-secret-do-not-use-in-prod";
process.env.EMAIL_OTP_HMAC_SECRET = SECRET;
process.env.FUNCTIONS_EMULATOR = "true";
const PROJECT = process.env.GCLOUD_PROJECT ?? "";
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";
const DB = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const SUFFIX = Date.now().toString(36);

function code(error: unknown): string {
  return String((error as { details?: { code?: string } }).details?.code ?? "");
}

async function authRequest(path: string, body?: object) {
  const response = await fetch(`http://${AUTH}/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json() as Record<string, any>;
  assert.equal(response.ok, true, `Auth emulator request failed: ${response.status}`);
  return result;
}

async function phoneSignIn(phoneNumber: string) {
  const sent = await authRequest("identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=fake-emulator-key", { phoneNumber });
  const codes = await authRequest(`emulator/v1/projects/${PROJECT}/verificationCodes`);
  const entry = codes.verificationCodes.find((row: any) => row.sessionInfo === sent.sessionInfo);
  assert.ok(entry, "only the local emulator supplies this synthetic verification code");
  const signed = await authRequest("identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=fake-emulator-key", {
    sessionInfo: sent.sessionInfo,
    code: entry.code,
  });
  const token = String(signed.idToken);
  const claims = await getAdminAuth().verifyIdToken(token, true);
  assert.equal(claims.firebase.sign_in_provider, "phone");
  return { uid: claims.uid, token, claims, phoneNumber };
}

async function seedRecovery(owner: Awaited<ReturnType<typeof phoneSignIn>>, label: string) {
  const db = getAdminDb();
  const now = Date.now();
  const sessionId = `recovery-${SUFFIX}-${label}`;
  const challengeId = `challenge-${SUFFIX}-${label}`;
  const email = `recovery-${SUFFIX}-${label}@example.com`;
  const hash = emailBindingKey(email);
  const answer = "synthetic answer";
  await db.collection("users").doc(owner.uid).set({
    uid: owner.uid, status: "active", phoneE164: owner.phoneNumber,
    emailStatus: "verified", normalizedEmail: email, businessEmail: email,
    emailHash: hash, emailBindingVersion: 1, recoveryPending: true,
  });
  await db.collection("emailBindings").doc(hash).set({ uid: owner.uid, normalizedEmail: email, status: "verified", bindingVersion: 1 });
  await db.collection("phoneIndex").doc(owner.phoneNumber).set({ uid: owner.uid });
  await db.collection("pendingEmailVerifications").doc(challengeId).set({
    challengeId, userId: owner.uid, normalizedEmail: email, emailHash: hash,
    otpDigest: digestEmailOtp(SECRET, "123456", { challengeId, uid: owner.uid, normalizedEmail: email, version: 1 }),
    version: 1, purpose: "recovery", status: "active", expiresAt: now + 600_000,
    lockUntil: null, incorrectAttempts: 0,
  });
  await db.collection("accountRecoverySessions").doc(sessionId).set({
    uid: owner.uid, status: "awaiting_factors", emailChallengeId: challengeId,
    mailboxEmail: email, mailboxHash: hash, mailboxVersion: 1,
    questions: [{ id: "question", prompt: "Synthetic question", answerDigest: createHash("sha256").update(`recovery|${sessionId}|question|${answer}`).digest("hex") }],
    failedAttempts: 0, expiresAt: now + 600_000,
  });
  return { sessionId, challengeId, email, hash, answers: { question: answer } };
}

async function complete(owner: Awaited<ReturnType<typeof phoneSignIn>>, data: Record<string, unknown>) {
  return completeAccountRecovery.run({
    auth: { uid: owner.uid, token: owner.claims },
    rawRequest: { headers: { authorization: `Bearer ${owner.token}` } }, data,
  } as never);
}

async function testCrossUidDoesNotReassignIdentity() {
  const a = await phoneSignIn("+16505550121");
  const b = await phoneSignIn("+16505550122");
  const session = await seedRecovery(a, "cross-uid");
  const db = getAdminDb();
  const before = (await db.collection("users").doc(a.uid).get()).data();
  await assert.rejects(() => complete(a, {
    ...session, emailCode: "123456", newPhoneE164: b.phoneNumber, phoneProofToken: b.token,
  }), (error: unknown) => code(error) === "RECOVERY_PHONE_SUPPORT_REQUIRED");
  assert.deepEqual((await db.collection("users").doc(a.uid).get()).data(), before);
  assert.equal((await db.collection("phoneIndex").doc(b.phoneNumber).get()).exists, false);
  assert.equal((await db.collection("phoneIndex").doc(a.phoneNumber).get()).get("uid"), a.uid);
  assert.equal((await getAdminAuth().getUser(a.uid)).phoneNumber, a.phoneNumber);
  assert.equal((await getAdminAuth().getUser(b.uid)).phoneNumber, b.phoneNumber);
  assert.equal((await db.collection("accountRecoverySessions").doc(session.sessionId).get()).get("status"), "awaiting_factors");
}

async function testCompletionEnforcesPersistedLock() {
  const a = await phoneSignIn("+16505550123");
  const session = await seedRecovery(a, "locked");
  const request = { ...session, newPhoneE164: a.phoneNumber, phoneProofToken: a.token };
  await assert.rejects(() => complete(a, { ...request, emailCode: "000000" }), (error: unknown) => code(error) === "FORBIDDEN");
  const db = getAdminDb();
  const locked = (await db.collection("users").doc(a.uid).get()).data()!;
  assert.ok(Number(locked.recoveryLockUntil) > Date.now());
  for (const emailCode of ["000000", "123456"]) {
    await assert.rejects(() => complete(a, { ...request, emailCode }), (error: unknown) => code(error) === "RATE_LIMITED");
  }
  const state = await db.collection("accountRecoverySessions").doc(session.sessionId).get();
  assert.equal(state.get("failedAttempts"), 1);
  assert.equal(state.get("status"), "failed_attempt");
  assert.equal((await db.collection("pendingEmailVerifications").doc(session.challengeId).get()).get("status"), "active");
}

async function testMissingRecoveryHashGoesToSupport() {
  const a = await phoneSignIn("+16505550124");
  const session = await seedRecovery(a, "legacy-hash");
  const db = getAdminDb();
  const userRef = db.collection("users").doc(a.uid);
  const rejectToSupport = () => assert.rejects(() => complete(a, {
      ...session, emailCode: "123456", newPhoneE164: a.phoneNumber, phoneProofToken: a.token,
    }), (error: unknown) => code(error) === "CONFLICT");
  for (const emailHash of ["", "invalid/nested/path"]) {
    await userRef.update({ emailHash });
    await rejectToSupport();
  }
  await userRef.update({ emailHash: session.hash, emailBindingVersion: FieldValue.delete() });
  await rejectToSupport();
  await userRef.update({ emailBindingVersion: 1 });
  await db.collection("emailBindings").doc(session.hash).delete();
  await rejectToSupport();
  assert.equal((await db.collection("accountRecoverySessions").doc(session.sessionId).get()).get("status"), "awaiting_factors");
}

async function testCanonicalPhoneRecoveryAndNextLogin() {
  const a = await phoneSignIn("+16505550126");
  const session = await seedRecovery(a, "canonical");
  const db = getAdminDb();
  const oldPhone = "+16505550127";
  // Auth already owns the new number under A. This test does not implement or
  // claim a cross-UID Auth transfer. It exercises reconciliation of the profile.
  await db.collection("users").doc(a.uid).update({ phoneE164: oldPhone });
  await db.collection("phoneIndex").doc(a.phoneNumber).delete();
  await db.collection("phoneIndex").doc(oldPhone).set({ uid: a.uid });
  await db.collection("users").doc(a.uid).collection("entries").doc("kept").set({ text: "kept record" });
  const request = { ...session, emailCode: "123456", newPhoneE164: a.phoneNumber, phoneProofToken: a.token };
  const recovered = await complete(a, request);
  assert.equal(recovered.ok, true);
  assert.equal((await db.collection("phoneIndex").doc(oldPhone).get()).exists, false);
  assert.equal((await db.collection("phoneIndex").doc(a.phoneNumber).get()).get("uid"), a.uid);
  assert.equal((await getAdminAuth().getUser(a.uid)).phoneNumber, a.phoneNumber);

  // Discard the first token: a separate emulator phone sign-in must return A,
  // and the real production resolver must reopen that account (not create B).
  const next = await phoneSignIn(a.phoneNumber);
  assert.equal(next.uid, a.uid);
  const resolved = await resolveOrCreateUserByPhone.run({
    auth: { uid: next.uid, token: next.claims },
    rawRequest: { headers: { authorization: `Bearer ${next.token}` } },
    data: { phoneE164: next.phoneNumber },
  } as never);
  assert.equal(resolved.profile.uid, a.uid);
  assert.equal(resolved.isNewUser, false);
  assert.equal((await db.collection("users").doc(a.uid).collection("entries").doc("kept").get()).get("text"), "kept record");
  const replay = await complete(next, { ...request, phoneProofToken: next.token });
  assert.equal(replay.ok, true, "an owned completed operation is safely acknowledged after a lost response");
  assert.equal((await db.collection("users").doc(a.uid).get()).get("mobileChangeCount"), 1);
}

async function testConcurrentWrongFactorsLockOnce() {
  const a = await phoneSignIn("+16505550128");
  const session = await seedRecovery(a, "concurrent");
  const request = { ...session, emailCode: "000000", newPhoneE164: a.phoneNumber, phoneProofToken: a.token };
  const outcomes = await Promise.allSettled([complete(a, request), complete(a, request)]);
  assert.equal(outcomes.every((result) => result.status === "rejected"), true);
  const codes = outcomes.map((result) => result.status === "rejected" ? code(result.reason) : "").sort();
  assert.deepEqual(codes, ["FORBIDDEN", "RATE_LIMITED"]);
  assert.equal((await getAdminDb().collection("accountRecoverySessions").doc(session.sessionId).get()).get("failedAttempts"), 1);
}

async function testForgedPhoneProofCannotMutate() {
  const a = await phoneSignIn("+16505550129");
  const session = await seedRecovery(a, "forged");
  const before = (await getAdminDb().collection("users").doc(a.uid).get()).data();
  await assert.rejects(() => complete(a, {
    ...session, emailCode: "123456", newPhoneE164: a.phoneNumber, phoneProofToken: "not-a-firebase-id-token",
  }), (error: unknown) => code(error) === "FORBIDDEN");
  assert.deepEqual((await getAdminDb().collection("users").doc(a.uid).get()).data(), before);
}

async function freshAfterCutoff(uid: string, phone: string) {
  const security = await getAdminDb().collection(AUTH_SECURITY_COLLECTION).doc(uid).get();
  const cutoff = Number(security.get("revokedBeforeAuthTimeSeconds"));
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, (cutoff + 1) * 1000 + 10 - Date.now())));
  return phoneSignIn(phone);
}

async function testFinalizationPhaseRecovery() {
  let phoneSuffix = 40;
  for (const fault of ["before_revoke", "after_revoke", "before_token", "after_token", "before_completed"]) {
    const a = await phoneSignIn(`+165055501${phoneSuffix++}`);
    const session = await seedRecovery(a, `phase-${fault}`);
    const request = { ...session, emailCode: "123456", newPhoneE164: a.phoneNumber, phoneProofToken: a.token };
    let injected = false;
    let revokes = 0;
    __setRecoveryFinalizationFaultForTests(async (stage) => {
      if (stage === "after_revoke") revokes += 1;
      if (stage === fault && !injected) { injected = true; throw new Error(`injected-${fault}`); }
    });
    try {
      await assert.rejects(() => complete(a, request));
      assert.equal(injected, true, `must exercise ${fault}`);
      const interrupted = await getAdminDb().collection("accountRecoverySessions").doc(session.sessionId).get();
      assert.equal(interrupted.get("status"), "identity_committed");
      const pinnedOrigin = interrupted.get("recoveryAuthTimeSeconds");
      // The cutoff deliberately retires the old bearer. Continuation is a new
      // admitted phone session, never an unverified bypass using the session ID.
      const fresh = await freshAfterCutoff(a.uid, a.phoneNumber);
      const retried = await complete(fresh, { ...request, phoneProofToken: fresh.token });
      assert.equal(retried.ok, true);
      assert.equal(revokes, 1, "reconcile successful revocation rather than revoke a newer login again");
      const after = await getAdminDb().collection("accountRecoverySessions").doc(session.sessionId).get();
      assert.equal(after.get("status"), "completed");
      assert.equal(after.get("revocationState"), "complete");
      if (pinnedOrigin != null) assert.equal(after.get("recoveryAuthTimeSeconds"), pinnedOrigin);
      assert.equal((await getAdminDb().collection("users").doc(a.uid).get()).get("mobileChangeCount"), 1);
    } finally {
      __setRecoveryFinalizationFaultForTests(null);
    }
  }
}

async function testNewerLogoutAndDeletionSupersedeFinalization() {
  for (const scenario of ["logout", "deletion", "restore"]) {
    const phone = scenario === "logout" ? "+16505550145" : scenario === "deletion" ? "+16505550146" : "+16505550147";
    const a = await phoneSignIn(phone);
    const session = await seedRecovery(a, `superseded-${scenario}`);
    let injected = false;
    let tokenStages = 0;
    __setRecoveryFinalizationFaultForTests(async (stage) => {
      if (stage === "after_token") tokenStages += 1;
      if (stage !== "before_token" || injected) return;
      injected = true;
      const db = getAdminDb();
      if (scenario === "logout") {
        await db.collection(AUTH_SECURITY_COLLECTION).doc(a.uid).set({
          operationId: "newer-user-logout", revokedBeforeAuthTimeSeconds: Math.floor(Date.now() / 1000),
          revocationState: "complete", startedAtSeconds: Math.floor(Date.now() / 1000),
        });
      } else if (scenario === "deletion") {
        await db.collection("users").doc(a.uid).update({ status: "pending_deletion" });
      } else {
        await db.collection("erasureManifests").doc(a.uid).set({ uid: a.uid, status: "erased" });
      }
    });
    try {
      await assert.rejects(() => complete(a, {
        ...session, emailCode: "123456", newPhoneE164: a.phoneNumber, phoneProofToken: a.token,
      }));
      assert.equal(injected, true);
      assert.equal(tokenStages, 0, "superseded operation must not issue a new recovery token");
      assert.equal((await getAdminDb().collection("accountRecoverySessions").doc(session.sessionId).get()).get("status"), "identity_committed");
    } finally {
      __setRecoveryFinalizationFaultForTests(null);
    }
  }
}

async function testNotificationFailureDoesNotUndoRecovery() {
  const a = await phoneSignIn("+16505550148");
  const session = await seedRecovery(a, "notice");
  const request = { ...session, emailCode: "123456", newPhoneE164: a.phoneNumber, phoneProofToken: a.token };
  let notices = 0;
  let revokes = 0;
  __setRecoveryFinalizationFaultForTests(async (stage) => { if (stage === "after_revoke") revokes += 1; });
  __setEmailProviderForEmulatorTests({ async send() { notices += 1; return { delivered: false, provider: "none" }; } });
  try {
    const recovered = await complete(a, request);
    assert.equal(recovered.ok, true);
    const sessionRef = getAdminDb().collection("accountRecoverySessions").doc(session.sessionId);
    assert.equal((await sessionRef.get()).get("status"), "completed");
    assert.equal((await sessionRef.get()).get("notificationState"), "pending");
    const fixedOrigin = (await sessionRef.get()).get("recoveryAuthTimeSeconds");
    const fresh = await freshAfterCutoff(a.uid, a.phoneNumber);
    __setEmailProviderForEmulatorTests({ async send() { notices += 1; return { delivered: true, provider: "dev-log" }; } });
    const retry = await complete(fresh, { ...request, phoneProofToken: fresh.token });
    assert.equal(retry.ok, true);
    assert.equal(revokes, 1);
    assert.equal(notices, 2);
    assert.equal((await sessionRef.get()).get("notificationState"), "accepted");
    assert.equal((await sessionRef.get()).get("recoveryAuthTimeSeconds"), fixedOrigin);
  } finally {
    __setRecoveryFinalizationFaultForTests(null);
    __setEmailProviderForEmulatorTests(null);
  }
}

async function testMissingReactivationHashUsesProductionAdapter() {
  const db = getAdminDb();
  const now = Date.now();
  const uid = `reactivation-${SUFFIX}`;
  const phone = "+16505550125";
  const email = "reactivation-legacy@example.com";
  const hash = emailBindingKey(email);
  const userRef = db.collection("users").doc(uid);
  await userRef.set({
    uid, phoneE164: phone, status: "pending_deletion", emailStatus: "verified", emailHash: "",
    normalizedEmail: email, businessEmail: email, emailBindingVersion: 1, emailVerifiedAt: now - 1000,
    deletionRequestedAt: now - 1000, deletionScheduledFor: now + 86_400_000, reactivationPhoneVerifiedAt: now,
  });
  await db.collection("phoneIndex").doc(phone).set({ uid });
  await db.collection(REACTIVATION_JOBS).doc(uid).set({ uid, generation: 1, status: "awaiting_grace", graceExpiresAt: now + 86_400_000, phases: EMPTY_PHASES });
  const bodies: string[] = [];
  const mailer = { async send(input: { text: string }) { bodies.push(input.text); return "accepted" as const; } };
  const input = { db: adminReactivationDb(), uid, now, ip: null, mailer, env: process.env };
  await assert.rejects(() => performStartAccountReactivation(input), (error: unknown) => code(error) === "mailbox_support");
  assert.equal(bodies.length, 0);
  await userRef.update({ emailHash: hash });
  await db.collection("emailBindings").doc(hash).set({ uid, normalizedEmail: email, status: "verified", bindingVersion: 1 });
  const started = await performStartAccountReactivation({ ...input, now: now + 61_000 });
  const emailCode = bodies[0]!.match(/Your code is (\d{6})/)?.[1];
  assert.ok(emailCode);
  await userRef.update({ emailHash: "" });
  await assert.rejects(() => performCompleteAccountReactivation({
    db: adminReactivationDb(), uid, challengeId: started.verificationId, code: emailCode!, now: now + 62_000, env: process.env,
  }), (error: unknown) => code(error) === "mailbox_support");
  assert.equal((await userRef.get()).get("status"), "pending_deletion");
}

async function main() {
  assert.match(PROJECT, /^demo-/);
  assert.match(AUTH, /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(DB, /^(127\.0\.0\.1|localhost):\d+$/);
  const cases = {
    cross_uid: testCrossUidDoesNotReassignIdentity,
    lock: testCompletionEnforcesPersistedLock,
    recovery_hash: testMissingRecoveryHashGoesToSupport,
    reactivation_hash: testMissingReactivationHashUsesProductionAdapter,
    canonical: testCanonicalPhoneRecoveryAndNextLogin,
    concurrent_lock: testConcurrentWrongFactorsLockOnce,
    forged: testForgedPhoneProofCannotMutate,
    finalization: testFinalizationPhaseRecovery,
    superseded: testNewerLogoutAndDeletionSupersedeFinalization,
    notification: testNotificationFailureDoesNotUndoRecovery,
  };
  const selected = process.env.RECOVERY_TEST_CASE as keyof typeof cases | undefined;
  const failures: Error[] = [];
  for (const [name, test] of Object.entries(cases)) {
    if (selected && name !== selected) continue;
    try {
      await test();
      console.log(`recoverySecurity ${name}: ok`);
    } catch (error) {
      console.error(`recoverySecurity ${name}: FAILED`, error);
      failures.push(error as Error);
    }
  }
  assert.equal(failures.length, 0, "all production recovery security cases must pass");
  await Promise.all(getApps().map((app) => deleteApp(app)));
  console.log("recoverySecurity.emulator.test.ts: ok");
}
main().catch(async (error) => {
  console.error(error);
  await Promise.all(getApps().map((app) => deleteApp(app)));
  process.exitCode = 1;
});
