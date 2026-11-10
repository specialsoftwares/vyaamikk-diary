import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { DELETION_GRACE_MS } from "../deletion/finalPurge";
import { EMPTY_PHASES } from "../deletion/deletionJob";
import { resolveAuthoritativePhoneAuthIdentity } from "../identity/phoneAuthClaimBinding";
import { decideCallableAdmission } from "../identity/sessionSecurityPolicy";
import { routeResolveByPhoneResponse } from "../../../src/services/auth/reactivationRouting";
import {
  performCompleteAccountReactivation,
  performStartAccountReactivation,
} from "./accountReactivation";
import { emailBindingKey } from "../email/emailBindingKey";
import {
  REACTIVATION_CHALLENGES,
  REACTIVATION_GUESS_WINDOW_MS,
  REACTIVATION_JOBS,
  REACTIVATION_LIMITS,
  REACTIVATION_PHONE_INDEX,
  REACTIVATION_SEND_GAP_MS,
  REACTIVATION_USERS,
  reactivationWindowDeadline,
  type ReactivationDb,
  type ReactivationMailer,
  type ReactivationTx,
} from "./reactivationOtp";

const SECRET = "unit-test-reactivation-hmac-secret-32";
const ENV = { EMAIL_OTP_HMAC_SECRET: SECRET } as NodeJS.ProcessEnv;
const UID = "uid-reactivation";
const PHONE = "+919800000001";
const EMAIL = "owner@example.com";

class MemoryDb implements ReactivationDb {
  docs = new Map<string, Record<string, unknown>>();
  private queue: Promise<void> = Promise.resolve();

  async runTransaction<T>(fn: (tx: ReactivationTx) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const snapshot = new Map<string, Record<string, unknown>>();
      for (const [key, value] of this.docs) snapshot.set(key, { ...value });
      const ops: Array<{ kind: "set" | "update"; key: string; data: Record<string, unknown> }> = [];
      const tx: ReactivationTx = {
        async get(collection, id) {
          const row = snapshot.get(`${collection}/${id}`);
          return row ? { ...row } : null;
        },
        set(collection, id, data) {
          ops.push({ kind: "set", key: `${collection}/${id}`, data: { ...data } });
        },
        update(collection, id, data) {
          ops.push({ kind: "update", key: `${collection}/${id}`, data: { ...data } });
        },
      };
      const result = await fn(tx);
      for (const op of ops) {
        if (op.kind === "set") snapshot.set(op.key, { ...op.data });
        else {
          const current = snapshot.get(op.key);
          if (!current) throw new Error(`missing ${op.key}`);
          snapshot.set(op.key, { ...current, ...op.data });
        }
      }
      this.docs = snapshot;
      return result;
    });
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

function seed(db: MemoryDb, now: number, patch: Record<string, unknown> = {}): void {
  db.docs.set(`${REACTIVATION_USERS}/${UID}`, {
    uid: UID,
    ueid: "VYD-TEST-1",
    phoneE164: PHONE,
    displayName: "Kept Name",
    businessEmail: EMAIL,
    normalizedEmail: EMAIL,
    emailHash: emailBindingKey(EMAIL),
    emailBindingVersion: 1,
    emailStatus: "verified",
    emailVerifiedAt: now - 60_000,
    status: "pending_deletion",
    deletionRequestedAt: now - 1_000,
    deletionScheduledFor: now + 10 * 24 * 60 * 60 * 1000,
    reactivationPhoneVerifiedAt: now,
    ...patch,
  });
  db.docs.set(`emailBindings/${emailBindingKey(EMAIL)}`, {
    uid: UID,
    normalizedEmail: EMAIL,
    status: "verified",
    bindingVersion: 1,
  });
  db.docs.set(`${REACTIVATION_PHONE_INDEX}/${PHONE}`, { uid: UID });
  db.docs.set(`${REACTIVATION_JOBS}/${UID}`, {
    uid: UID,
    generation: 1,
    status: "awaiting_grace",
    graceExpiresAt: now + 10 * 24 * 60 * 60 * 1000,
    phases: { ...EMPTY_PHASES },
  });
}

function capturingMailer(): ReactivationMailer & { sent: string[]; to: string[] } {
  const sent: string[] = [];
  const to: string[] = [];
  return {
    sent,
    to,
    async send(input) {
      sent.push(input.text);
      to.push(input.to);
      return "accepted";
    },
  };
}

function codeFrom(text: string): string {
  const match = text.match(/Your code is (\d{6})/);
  assert.ok(match, "mail body contains a six-digit code");
  return match![1]!;
}

function failureCode(error: unknown): string | undefined {
  return (error as { details?: { code?: string } }).details?.code;
}

async function start(db: MemoryDb, mailer: ReactivationMailer, now: number) {
  return performStartAccountReactivation({
    db,
    mailer,
    uid: UID,
    now,
    ip: null,
    env: ENV,
  });
}

async function testHappyPath(): Promise<void> {
  const db = new MemoryDb();
  const now = 1_700_000_000_000;
  seed(db, now);
  const mailer = capturingMailer();
  const started = await start(db, mailer, now);
  assert.equal(started.maskedEmail.includes("@"), true);
  assert.equal(JSON.stringify(started).includes(codeFrom(mailer.sent[0]!)), false);
  const reserved = db.docs.get(`${REACTIVATION_USERS}/${UID}`);
  assert.equal(reserved?.reactivationRequestedAt, now);
  assert.ok(Number(reserved?.emailVerifiedAt) < now);
  const done = await performCompleteAccountReactivation({
    db,
    uid: UID,
    challengeId: started.verificationId,
    code: codeFrom(mailer.sent[0]!),
    now: now + 1_000,
    env: ENV,
  });
  assert.equal(done.profile.uid, UID);
  assert.equal(done.profile.status, "active");
  assert.equal(done.profile.displayName, "Kept Name");
  assert.equal(done.profile.ueid, "VYD-TEST-1");
  const job = db.docs.get(`${REACTIVATION_JOBS}/${UID}`);
  assert.equal(job?.status, "cancelled");
  assert.equal(job?.generation, 2);
}

async function testProviderRejectionDoesNotActivate(): Promise<void> {
  const db = new MemoryDb();
  const now = 1_700_000_000_000;
  seed(db, now);
  const mailer: ReactivationMailer = { async send() { return "rejected"; } };
  await assert.rejects(() => start(db, mailer, now));
  assert.equal(db.docs.get(`${REACTIVATION_USERS}/${UID}`)?.status, "pending_deletion");
  const missing: ReactivationMailer = { async send() { return "ambiguous"; } };
  const later = new MemoryDb();
  seed(later, now + REACTIVATION_SEND_GAP_MS);
  await assert.rejects(() => start(later, missing, now + REACTIVATION_SEND_GAP_MS));
  assert.equal(later.docs.get(`${REACTIVATION_USERS}/${UID}`)?.status, "pending_deletion");
  await assert.rejects(() =>
    performStartAccountReactivation({
      db,
      mailer,
      uid: UID,
      now,
      ip: null,
      env: {},
    })
  );
}

async function testWrongExpiryAndBudgets(): Promise<void> {
  const db = new MemoryDb();
  const now = 1_700_000_000_000;
  seed(db, now);
  const mailer = capturingMailer();
  const started = await start(db, mailer, now);
  const right = codeFrom(mailer.sent[0]!);
  await assert.rejects(
    () =>
      performCompleteAccountReactivation({
        db,
        uid: UID,
        challengeId: started.verificationId,
        code: "111111",
        now: now + 1_000,
        env: ENV,
      }),
    (error: unknown) => failureCode(error) === "invalid"
  );
  for (let i = 0; i < 4; i += 1) {
    await assert.rejects(() =>
      performCompleteAccountReactivation({
        db,
        uid: UID,
        challengeId: started.verificationId,
        code: "111111",
        now: now + 1_000,
        env: ENV,
      })
    );
  }
  await assert.rejects(
    () =>
      performCompleteAccountReactivation({
        db,
        uid: UID,
        challengeId: started.verificationId,
        code: right,
        now: now + 1_000,
        env: ENV,
      }),
    (error: unknown) => {
      assert.equal((error as { details?: { code?: string } }).details?.code, "attempts_exhausted");
      return true;
    }
  );

  const expiry = new MemoryDb();
  seed(expiry, now);
  const expiryMail = capturingMailer();
  const expiring = await start(expiry, expiryMail, now);
  await assert.rejects(
    () =>
      performCompleteAccountReactivation({
        db: expiry,
        uid: UID,
        challengeId: expiring.verificationId,
        code: codeFrom(expiryMail.sent[0]!),
        now: expiring.expiresAt,
        env: ENV,
      }),
    (error: unknown) => failureCode(error) === "expired"
  );
  assert.equal(expiry.docs.get(`${REACTIVATION_USERS}/${UID}`)?.status, "pending_deletion");
}

async function testResendInvalidatesOldCode(): Promise<void> {
  const db = new MemoryDb();
  const now = 1_700_000_000_000;
  seed(db, now);
  const mailer = capturingMailer();
  const first = await start(db, mailer, now);
  const secondNow = now + REACTIVATION_SEND_GAP_MS;
  db.docs.set(`${REACTIVATION_USERS}/${UID}`, {
    ...db.docs.get(`${REACTIVATION_USERS}/${UID}`)!,
    reactivationPhoneVerifiedAt: secondNow,
  });
  const second = await start(db, mailer, secondNow);
  await assert.rejects(() =>
    performCompleteAccountReactivation({
      db,
      uid: UID,
      challengeId: first.verificationId,
      code: codeFrom(mailer.sent[0]!),
      now: secondNow + 1_000,
      env: ENV,
    })
  );
  const done = await performCompleteAccountReactivation({
    db,
    uid: UID,
    challengeId: second.verificationId,
    code: codeFrom(mailer.sent[1]!),
    now: secondNow + 1_000,
    env: ENV,
  });
  assert.equal(done.profile.status, "active");
  assert.equal(mailer.sent.length, 2);
}

async function testSendLimitAndCrossResendGuesses(): Promise<void> {
  const db = new MemoryDb();
  let now = 1_700_000_000_000;
  seed(db, now);
  const mailer = capturingMailer();
  await start(db, mailer, now);
  for (let i = 0; i < 2; i += 1) {
    now += REACTIVATION_SEND_GAP_MS;
    db.docs.set(`${REACTIVATION_USERS}/${UID}`, {
      ...db.docs.get(`${REACTIVATION_USERS}/${UID}`)!,
      reactivationPhoneVerifiedAt: now,
    });
    await start(db, mailer, now);
  }
  now += REACTIVATION_SEND_GAP_MS;
  await assert.rejects(() => start(db, mailer, now));

  const guesses = new MemoryDb();
  const startAt = 1_700_000_000_000;
  seed(guesses, startAt);
  const guessMail = capturingMailer();
  const opened = await start(guesses, guessMail, startAt);
  for (let i = 0; i < 4; i += 1) {
    await assert.rejects(() =>
      performCompleteAccountReactivation({
        db: guesses,
        uid: UID,
        challengeId: opened.verificationId,
        code: "222222",
        now: startAt + 1_000,
        env: ENV,
      })
    );
  }
  const resendAt = startAt + REACTIVATION_SEND_GAP_MS;
  guesses.docs.set(`${REACTIVATION_USERS}/${UID}`, {
    ...guesses.docs.get(`${REACTIVATION_USERS}/${UID}`)!,
    reactivationPhoneVerifiedAt: resendAt,
  });
  const resent = await start(guesses, guessMail, resendAt);
  for (let i = 0; i < 6; i += 1) {
    await assert.rejects(() =>
      performCompleteAccountReactivation({
        db: guesses,
        uid: UID,
        challengeId: resent.verificationId,
        code: "333333",
        now: resendAt + 1_000,
        env: ENV,
      })
    );
  }
  await assert.rejects(() =>
    performCompleteAccountReactivation({
      db: guesses,
      uid: UID,
      challengeId: resent.verificationId,
      code: codeFrom(guessMail.sent[1]!),
      now: resendAt + 1_000,
      env: ENV,
    })
  );
  assert.ok(REACTIVATION_GUESS_WINDOW_MS > 0);
}

async function testIneligibleAndPurgeRace(): Promise<void> {
  const missingEmail = new MemoryDb();
  const now = 1_700_000_000_000;
  seed(missingEmail, now, { emailStatus: null, businessEmail: null, normalizedEmail: null, emailVerifiedAt: null });
  await assert.rejects(
    () => start(missingEmail, capturingMailer(), now),
    (error: unknown) => failureCode(error) === "no_verified_email"
  );

  const leased = new MemoryDb();
  seed(leased, now);
  leased.docs.set(`${REACTIVATION_JOBS}/${UID}`, {
    ...leased.docs.get(`${REACTIVATION_JOBS}/${UID}`)!,
    status: "leased",
    leaseUntil: now + 60_000,
  });
  await assert.rejects(
    () => start(leased, capturingMailer(), now),
    (error: unknown) => failureCode(error) === "purge_underway"
  );

  const generation = new MemoryDb();
  seed(generation, now);
  const mailer = capturingMailer();
  const started = await start(generation, mailer, now);
  generation.docs.set(`${REACTIVATION_JOBS}/${UID}`, {
    ...generation.docs.get(`${REACTIVATION_JOBS}/${UID}`)!,
    generation: 9,
  });
  await assert.rejects(() =>
    performCompleteAccountReactivation({
      db: generation,
      uid: UID,
      challengeId: started.verificationId,
      code: codeFrom(mailer.sent[0]!),
      now: now + 1_000,
      env: ENV,
    })
  );
  assert.equal(generation.docs.get(`${REACTIVATION_USERS}/${UID}`)?.status, "pending_deletion");
}

async function testStoredCutoffClosesBeforeLaterSchedule(): Promise<void> {
  const now = 1_700_000_000_000;
  const closed = new MemoryDb();
  seed(closed, now, {
    reactivationCutoff: now - 1,
    deletionScheduledFor: now + 20 * 24 * 60 * 60 * 1000,
  });
  closed.docs.set(`${REACTIVATION_JOBS}/${UID}`, {
    ...closed.docs.get(`${REACTIVATION_JOBS}/${UID}`)!,
    reactivationCutoff: now - 1,
    graceExpiresAt: now + 20 * 24 * 60 * 60 * 1000,
  });
  await assert.rejects(() => start(closed, capturingMailer(), now));
  assert.equal(closed.docs.get(`${REACTIVATION_USERS}/${UID}`)?.status, "pending_deletion");

  const legacy = new MemoryDb();
  const requestedAt = now - 10 * 24 * 60 * 60 * 1000;
  seed(legacy, now, {
    deletionRequestedAt: requestedAt,
    deletionScheduledFor: requestedAt + 45 * 24 * 60 * 60 * 1000,
  });
  assert.equal(
    reactivationWindowDeadline({
      deletionRequestedAt: requestedAt,
      deletionScheduledFor: requestedAt + 45 * 24 * 60 * 60 * 1000,
    }),
    requestedAt + 45 * 24 * 60 * 60 * 1000
  );
  const mailer = capturingMailer();
  const started = await start(legacy, mailer, now);
  const done = await performCompleteAccountReactivation({
    db: legacy,
    uid: UID,
    challengeId: started.verificationId,
    code: codeFrom(mailer.sent[0]!),
    now: now + 1_000,
    env: ENV,
  });
  assert.equal(done.profile.status, "active");
}

async function testParallelVerifyConsumesOnce(): Promise<void> {
  const db = new MemoryDb();
  const now = 1_700_000_000_000;
  seed(db, now);
  const mailer = capturingMailer();
  const started = await start(db, mailer, now);
  const code = codeFrom(mailer.sent[0]!);
  const attempts = await Promise.allSettled([
    performCompleteAccountReactivation({
      db,
      uid: UID,
      challengeId: started.verificationId,
      code,
      now: now + 1_000,
      env: ENV,
    }),
    performCompleteAccountReactivation({
      db,
      uid: UID,
      challengeId: started.verificationId,
      code,
      now: now + 1_000,
      env: ENV,
    }),
  ]);
  const fulfilled = attempts.filter((item) => item.status === "fulfilled");
  assert.equal(fulfilled.length, 1);
  assert.equal(db.docs.get(`${REACTIVATION_CHALLENGES}/${started.verificationId}`)?.status, "consumed");
}

/**
 * Pure decision from the serving resolver
 * resolveorcreateuserbyphone-00009-ket (source e6f09b6, 21 Sep 2026).
 * A stored deletionScheduledFor is returned unchanged. The 15-day constant
 * is only the fallback when that field is absent, and it is not written.
 */
const DEPLOYED_RESOLVER_SHA = "e6f09b6a9afb37e6ae88cc39e0e27cc2b90a3aab";
const DEPLOYED_RESOLVER_GRACE_MS = 15 * 24 * 60 * 60 * 1000;

function deployedDeletionPending(
  profile: {
    uid: string;
    status: string;
    phoneE164: string;
    businessEmail?: string | null;
    deletionScheduledFor?: number | null;
    deletionRequestedAt?: number | null;
  },
  now: number
): {
  write: { reactivationPhoneVerifiedAt: number; updatedAt: number };
  response: {
    status: "deletion_pending";
    requiresReactivation: true;
    requiresEmailVerification: true;
    maskedEmail: string | null;
    deletionScheduledFor: number;
    policyTextVersion: "2026-06";
    profile: {
      uid: string;
      status: string;
      deletionScheduledFor?: number | null;
      phoneE164: string;
    };
    isNewUser: false;
  };
} | null {
  if (profile.status === "deleted" || profile.status !== "pending_deletion") return null;
  const scheduled =
    profile.deletionScheduledFor ??
    (profile.deletionRequestedAt ?? 0) + DEPLOYED_RESOLVER_GRACE_MS;
  if (!(scheduled > now)) return null;
  const email = profile.businessEmail?.trim() ?? "";
  return {
    write: { reactivationPhoneVerifiedAt: now, updatedAt: now },
    response: {
      status: "deletion_pending",
      requiresReactivation: true,
      requiresEmailVerification: true,
      maskedEmail: email ? "ow***@e***.com" : null,
      deletionScheduledFor: scheduled,
      policyTextVersion: "2026-06",
      profile: {
        uid: profile.uid,
        status: profile.status,
        deletionScheduledFor: profile.deletionScheduledFor,
        phoneE164: profile.phoneE164,
      },
      isNewUser: false,
    },
  };
}

function assertDeployedResolverSource(): void {
  let source = "";
  try {
    source = execFileSync(
      "git",
      ["show", `${DEPLOYED_RESOLVER_SHA}:functions/src/identity/resolveOrCreateUserByPhone.ts`],
      { encoding: "utf8" }
    );
  } catch {
    return;
  }
  assert.match(source, /const DELETION_GRACE_MS = 15 \* 24 \* 60 \* 60 \* 1000;/);
  assert.match(source, /reactivationPhoneVerifiedAt: now/);
  assert.match(source, /status: "deletion_pending" as const/);
  assert.equal(source.includes("assertAdmittedCallableUser"), false);
  assert.equal(source.includes("deletionScheduledFor: now"), false);
}

async function testDeployedResolverCompatibility(): Promise<void> {
  assertDeployedResolverSource();
  assert.notEqual(DEPLOYED_RESOLVER_GRACE_MS, DELETION_GRACE_MS);
  const now = 1_700_000_000_000;
  const requestedAt = now - 10 * 24 * 60 * 60 * 1000;
  const storedDeadline = requestedAt + 45 * 24 * 60 * 60 * 1000;
  const db = new MemoryDb();
  seed(db, now, {
    deletionRequestedAt: requestedAt,
    deletionScheduledFor: storedDeadline,
    reactivationPhoneVerifiedAt: 0,
  });
  const job = db.docs.get(`${REACTIVATION_JOBS}/${UID}`);
  assert.ok(job);
  job.graceExpiresAt = storedDeadline;
  delete job.reactivationCutoff;

  const profile = db.docs.get(`${REACTIVATION_USERS}/${UID}`)!;
  const decision = deployedDeletionPending(
    {
      uid: UID,
      status: String(profile.status),
      phoneE164: PHONE,
      businessEmail: EMAIL,
      deletionScheduledFor: storedDeadline,
      deletionRequestedAt: requestedAt,
    },
    now
  );
  assert.ok(decision);
  assert.equal(decision.response.deletionScheduledFor, storedDeadline);
  assert.equal(decision.response.profile.deletionScheduledFor, storedDeadline);
  assert.equal("deletionScheduledFor" in decision.write, false);
  Object.assign(profile, decision.write);
  assert.equal(profile.deletionScheduledFor, storedDeadline);
  assert.equal(profile.reactivationPhoneVerifiedAt, now);
  assert.equal(reactivationWindowDeadline(profile), storedDeadline);

  const bound = resolveAuthoritativePhoneAuthIdentity({
    authUid: UID,
    tokenPhoneNumber: PHONE,
    clientPhoneE164: PHONE,
  });
  assert.equal(bound.authUid, UID);
  assert.equal(bound.phoneE164, PHONE);
  assert.throws(() =>
    resolveAuthoritativePhoneAuthIdentity({
      authUid: UID,
      tokenPhoneNumber: PHONE,
      clientPhoneE164: "+919800000099",
    })
  );
  const admitted = decideCallableAdmission({
    verified: { uid: UID, signInProvider: "phone", authTimeSeconds: Math.floor(now / 1000) },
    originClaim: null,
    cutoff: null,
  });
  assert.equal(admitted.admit, true);
  const replaced = decideCallableAdmission({
    verified: { uid: UID, signInProvider: "phone", authTimeSeconds: Math.floor(now / 1000) },
    originClaim: null,
    cutoff: Math.floor(now / 1000),
  });
  assert.equal(replaced.admit, false);

  let routed: unknown;
  try {
    routeResolveByPhoneResponse(decision.response);
  } catch (error) {
    routed = error;
  }
  assert.equal((routed as { code?: string }).code, "account_pending_deletion");
  assert.equal(
    (routed as { details?: { deletionScheduledFor?: number } }).details?.deletionScheduledFor,
    storedDeadline
  );

  const withoutProof = new MemoryDb();
  seed(withoutProof, now, {
    deletionRequestedAt: requestedAt,
    deletionScheduledFor: storedDeadline,
    reactivationPhoneVerifiedAt: 0,
  });
  const staleJob = withoutProof.docs.get(`${REACTIVATION_JOBS}/${UID}`)!;
  staleJob.graceExpiresAt = storedDeadline;
  delete staleJob.reactivationCutoff;
  await assert.rejects(() => start(withoutProof, capturingMailer(), now), /Phone verification expired/);

  const mailer = capturingMailer();
  const started = await start(db, mailer, now + 1_000);
  const done = await performCompleteAccountReactivation({
    db,
    uid: bound.authUid,
    challengeId: started.verificationId,
    code: codeFrom(mailer.sent[0]!),
    now: now + 2_000,
    env: ENV,
  });
  assert.equal(done.profile.uid, UID);
  assert.equal(done.profile.status, "active");

  const otherUid = new MemoryDb();
  seed(otherUid, now, {
    deletionRequestedAt: requestedAt,
    deletionScheduledFor: storedDeadline,
    reactivationPhoneVerifiedAt: now,
  });
  await assert.rejects(() =>
    performStartAccountReactivation({
      db: otherUid,
      mailer: capturingMailer(),
      uid: "other-auth-uid",
      now,
      ip: null,
      env: ENV,
    })
  );

  const closed = new MemoryDb();
  seed(closed, storedDeadline + 1_000, {
    deletionRequestedAt: requestedAt,
    deletionScheduledFor: storedDeadline,
    reactivationPhoneVerifiedAt: storedDeadline,
  });
  const closedJob = closed.docs.get(`${REACTIVATION_JOBS}/${UID}`)!;
  closedJob.graceExpiresAt = storedDeadline;
  delete closedJob.reactivationCutoff;
  assert.equal(
    deployedDeletionPending(
      {
        uid: UID,
        status: "pending_deletion",
        phoneE164: PHONE,
        deletionScheduledFor: storedDeadline,
        deletionRequestedAt: requestedAt,
      },
      storedDeadline + 1_000
    ),
    null
  );
  assert.ok(reactivationWindowDeadline({
    deletionScheduledFor: storedDeadline,
    deletionRequestedAt: requestedAt,
  }) <= storedDeadline + 1_000);
  await assert.rejects(() => start(closed, capturingMailer(), storedDeadline + 1_000));
  assert.equal(closed.docs.get(`${REACTIVATION_USERS}/${UID}`)?.status, "pending_deletion");

  const missingSchedule = requestedAt + DEPLOYED_RESOLVER_GRACE_MS;
  const fallback = deployedDeletionPending(
    {
      uid: UID,
      status: "pending_deletion",
      phoneE164: PHONE,
      deletionRequestedAt: requestedAt,
    },
    now
  );
  assert.equal(fallback?.response.deletionScheduledFor, missingSchedule);
  assert.equal(
    reactivationWindowDeadline({ deletionRequestedAt: requestedAt }),
    requestedAt + DELETION_GRACE_MS
  );
  assert.ok(missingSchedule < requestedAt + DELETION_GRACE_MS);

  const reactivation = readFileSync(new URL("./accountReactivation.ts", import.meta.url), "utf8");
  assert.match(reactivation, /const uid = request\.auth\?\.uid/);
  assert.equal(reactivation.includes("request.data.uid"), false);
  assert.equal(reactivation.includes("request.data?.uid"), false);
}

function testReleaseReachability(): void {
  const reactivation = readFileSync(new URL("./accountReactivation.ts", import.meta.url), "utf8");
  const screen = readFileSync(
    new URL("../../../app/(auth)/account-pending-deletion.tsx", import.meta.url),
    "utf8"
  );
  const english = readFileSync(new URL("../../../src/i18n/locales/en.json", import.meta.url), "utf8");
  assert.equal(reactivation.includes("devCode"), false);
  assert.equal(reactivation.includes("000000"), false);
  assert.equal(screen.includes("000000"), false);
  assert.equal(english.includes("use code 000000"), false);
  const limits = readFileSync(new URL("./reactivationOtp.ts", import.meta.url), "utf8");
  assert.match(limits, /REACTIVATION_PURPOSE = "account_reactivation"/);
}

async function testMailboxIsNotTheMutableProfile(): Promise<void> {
  const drifted = new MemoryDb();
  const now = 1_700_000_000_000;
  seed(drifted, now, { normalizedEmail: "attacker@example.com", businessEmail: "attacker@example.com" });
  const driftedMail = capturingMailer();
  await assert.rejects(
    () => start(drifted, driftedMail, now),
    (error: unknown) => failureCode(error) === "mailbox_support"
  );
  assert.equal(driftedMail.to.length, 0, "a drifted profile address is not used as the destination");

  const legacy = new MemoryDb();
  seed(legacy, now, { normalizedEmail: "", businessEmail: "attacker@example.com" });
  const legacyMail = capturingMailer();
  await start(legacy, legacyMail, now);
  assert.deepEqual(legacyMail.to, [EMAIL], "an empty profile address still uses the verified binding");
}

async function main(): Promise<void> {
  await testHappyPath();
  await testProviderRejectionDoesNotActivate();
  await testWrongExpiryAndBudgets();
  await testResendInvalidatesOldCode();
  await testSendLimitAndCrossResendGuesses();
  await testIneligibleAndPurgeRace();
  await testStoredCutoffClosesBeforeLaterSchedule();
  await testDeployedResolverCompatibility();
  await testParallelVerifyConsumesOnce();
  await testMailboxIsNotTheMutableProfile();
  testReleaseReachability();
  console.log("reactivationOtp.unit.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
