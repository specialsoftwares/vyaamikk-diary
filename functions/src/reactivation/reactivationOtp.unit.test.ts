import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { EMPTY_PHASES } from "../deletion/deletionJob";
import {
  performCompleteAccountReactivation,
  performStartAccountReactivation,
} from "./accountReactivation";
import {
  REACTIVATION_CHALLENGES,
  REACTIVATION_GUESS_WINDOW_MS,
  REACTIVATION_JOBS,
  REACTIVATION_LIMITS,
  REACTIVATION_PHONE_INDEX,
  REACTIVATION_SEND_GAP_MS,
  REACTIVATION_USERS,
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
    emailStatus: "verified",
    emailVerifiedAt: now - 60_000,
    status: "pending_deletion",
    deletionRequestedAt: now - 1_000,
    deletionScheduledFor: now + 10 * 24 * 60 * 60 * 1000,
    reactivationPhoneVerifiedAt: now,
    ...patch,
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

function capturingMailer(): ReactivationMailer & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    async send(input) {
      sent.push(input.text);
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

async function main(): Promise<void> {
  await testHappyPath();
  await testProviderRejectionDoesNotActivate();
  await testWrongExpiryAndBudgets();
  await testResendInvalidatesOldCode();
  await testSendLimitAndCrossResendGuesses();
  await testIneligibleAndPurgeRace();
  await testParallelVerifyConsumesOnce();
  testReleaseReachability();
  console.log("reactivationOtp.unit.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
