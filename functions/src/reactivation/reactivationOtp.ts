/**
 * Account reactivation email OTP.
 *
 * Reuses the email HMAC secret and Resend adapter. The code never leaves
 * process memory except inside the provider request. Firestore stores a
 * bound digest only.
 */

import { createHash, randomBytes } from "node:crypto";

import { automaticRestorationAllowed, type DeletionJobDoc } from "../deletion/deletionJob";
import { DELETION_GRACE_MS } from "../deletion/finalPurge";
import { generateEmailOtpCode, verifyBoundOtpDigest, digestBoundOtp } from "../email/otpCrypto";
import { EMAIL_OTP_USER_MESSAGES } from "../email/otpPolicy";
import type { UserProfileDoc } from "../identity/shared";
import { normalizePhoneE164 } from "../identity/shared";

export const REACTIVATION_PURPOSE = "account_reactivation";
export const REACTIVATION_OTP_TTL_MS = 5 * 60 * 1000;
export const REACTIVATION_SEND_GAP_MS = 60 * 1000;
export const REACTIVATION_MAX_SENDS = 3;
export const REACTIVATION_SEND_WINDOW_MS = 15 * 60 * 1000;
export const REACTIVATION_MAX_GUESSES_PER_CHALLENGE = 5;
export const REACTIVATION_MAX_GUESSES_PER_ACCOUNT = 10;
export const REACTIVATION_GUESS_WINDOW_MS = 30 * 60 * 1000;
export const REACTIVATION_PHONE_TTL_MS = 10 * 60 * 1000;
export const REACTIVATION_IP_MAX_SENDS = 20;

export const REACTIVATION_CHALLENGES = "pendingEmailVerifications";
export const REACTIVATION_LIMITS = "emailOtpRateLimits";
export const REACTIVATION_USERS = "users";
export const REACTIVATION_PHONE_INDEX = "phoneIndex";
export const REACTIVATION_JOBS = "deletionJobs";

export type ReactivationFailure =
  | "unauthenticated"
  | "ineligible"
  | "no_verified_email"
  | "phone_proof_expired"
  | "cooldown"
  | "rate_limited"
  | "provider_unavailable"
  | "invalid"
  | "expired"
  | "attempts_exhausted"
  | "superseded"
  | "purge_underway";

export interface ReactivationTx {
  get(collection: string, id: string): Promise<Record<string, unknown> | null>;
  set(collection: string, id: string, data: Record<string, unknown>): void;
  update(collection: string, id: string, data: Record<string, unknown>): void;
}

export interface ReactivationDb {
  runTransaction<T>(fn: (tx: ReactivationTx) => Promise<T>): Promise<T>;
}

export interface ReactivationMailer {
  send(input: {
    to: string;
    subject: string;
    text: string;
    idempotencyKey: string;
  }): Promise<"accepted" | "rejected" | "ambiguous">;
}

export function reactivationEmailCopy(code: string): { subject: string; text: string } {
  return {
    subject: "Reactivate your Vyaamikk Diary account.",
    text: [
      "Someone asked to cancel the pending deletion of your Vyaamikk Diary account and restore access.",
      `Your code is ${code}. It expires in five minutes.`,
      "Do not share this code. If you did not ask for this, ignore this email.",
    ].join("\n"),
  };
}

export function readReactivationHmacSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.EMAIL_OTP_HMAC_SECRET?.trim() ?? "";
  if (secret.length >= 32) return secret;
  if (env.FUNCTIONS_EMULATOR === "true") {
    return "emulator-only-email-otp-hmac-secret-do-not-use-in-prod";
  }
  throw Object.assign(new Error(EMAIL_OTP_USER_MESSAGES.EMAIL_PROVIDER_UNAVAILABLE), {
    reactivationFailure: "provider_unavailable" as const,
  });
}

function maskEmail(email: string): string {
  const v = email.trim();
  const at = v.indexOf("@");
  if (at <= 0) return "***";
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  const maskedLocal = local.length <= 2 ? `${local[0] ?? "*"}***` : `${local.slice(0, 2)}***`;
  const dot = domain.indexOf(".");
  const maskedDomain =
    dot > 0 ? `${domain.slice(0, 1)}***${domain.slice(dot)}` : `${domain.slice(0, 2)}***`;
  return `${maskedLocal}@${maskedDomain}`;
}

function within(stamps: unknown, now: number, windowMs: number): number[] {
  const list = Array.isArray(stamps) ? stamps.filter((n) => typeof n === "number") : [];
  return (list as number[]).filter((n) => now - n < windowMs);
}

function ipDocId(ip: string): string {
  return `reactivationIp_${createHash("sha256").update(`reactivation-ip:${ip}`).digest("hex").slice(0, 24)}`;
}

function limitDocId(uid: string): string {
  return `reactivation_${uid}`;
}

export interface ReserveResult {
  ok: true;
  challengeId: string;
  operationId: string;
  code: string;
  to: string;
  maskedEmail: string;
  expiresAt: number;
  resendAvailableAt: number;
  deletionGeneration: number;
}

export type ReserveOutcome =
  | ReserveResult
  | { ok: false; failure: ReactivationFailure; retryAfterSeconds?: number };

function profileWindowOpen(profile: UserProfileDoc, now: number): boolean {
  const scheduled =
    profile.deletionScheduledFor ??
    (profile.deletionRequestedAt ?? 0) + DELETION_GRACE_MS;
  return scheduled > now;
}

function eligibleProfile(profile: UserProfileDoc, now: number): ReactivationFailure | null {
  if (profile.status === "deleted") return "ineligible";
  if (profile.status !== "pending_deletion") return "ineligible";
  if (!profileWindowOpen(profile, now)) return "ineligible";
  const email = profile.businessEmail?.trim() || profile.normalizedEmail?.trim() || "";
  if (!email || profile.emailStatus !== "verified" || !(profile.emailVerifiedAt && profile.emailVerifiedAt > 0)) {
    return "no_verified_email";
  }
  const phoneAt = profile.reactivationPhoneVerifiedAt ?? 0;
  if (!phoneAt || now - phoneAt > REACTIVATION_PHONE_TTL_MS) return "phone_proof_expired";
  return null;
}

export async function reserveReactivationSend(input: {
  db: ReactivationDb;
  uid: string;
  now: number;
  secret: string;
  ip: string | null;
}): Promise<ReserveOutcome> {
  return input.db.runTransaction(async (tx) => {
    const profileRaw = await tx.get(REACTIVATION_USERS, input.uid);
    if (!profileRaw) return { ok: false, failure: "ineligible" };
    const profile = profileRaw as unknown as UserProfileDoc;
    const blocked = eligibleProfile(profile, input.now);
    if (blocked) return { ok: false, failure: blocked };

    let phone = "";
    try {
      phone = normalizePhoneE164(String(profile.phoneE164 ?? ""));
    } catch {
      return { ok: false, failure: "ineligible" };
    }
    const phoneDoc = await tx.get(REACTIVATION_PHONE_INDEX, phone);
    if (!phoneDoc || phoneDoc.uid !== input.uid) return { ok: false, failure: "ineligible" };

    const jobRaw = await tx.get(REACTIVATION_JOBS, input.uid);
    const job = jobRaw as unknown as DeletionJobDoc | null;
    if (job && !automaticRestorationAllowed(job, input.now)) {
      return { ok: false, failure: "purge_underway" };
    }
    const deletionGeneration = job?.generation ?? 0;

    const limits = (await tx.get(REACTIVATION_LIMITS, limitDocId(input.uid))) ?? {};
    const sends = within(limits.sendTimestamps, input.now, REACTIVATION_SEND_WINDOW_MS);
    const lastSend = sends.length ? Math.max(...sends) : 0;
    if (lastSend && input.now - lastSend < REACTIVATION_SEND_GAP_MS) {
      return {
        ok: false,
        failure: "cooldown",
        retryAfterSeconds: Math.ceil((REACTIVATION_SEND_GAP_MS - (input.now - lastSend)) / 1000),
      };
    }
    if (sends.length >= REACTIVATION_MAX_SENDS) {
      const oldest = Math.min(...sends);
      return {
        ok: false,
        failure: "rate_limited",
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + REACTIVATION_SEND_WINDOW_MS - input.now) / 1000)),
      };
    }
    const guesses = within(limits.guessTimestamps, input.now, REACTIVATION_GUESS_WINDOW_MS);
    if (guesses.length >= REACTIVATION_MAX_GUESSES_PER_ACCOUNT) {
      const oldest = Math.min(...guesses);
      return {
        ok: false,
        failure: "attempts_exhausted",
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + REACTIVATION_GUESS_WINDOW_MS - input.now) / 1000)),
      };
    }

    if (input.ip) {
      const ipDoc = (await tx.get(REACTIVATION_LIMITS, ipDocId(input.ip))) ?? {};
      const ipSends = within(ipDoc.sendTimestamps, input.now, REACTIVATION_SEND_WINDOW_MS);
      if (ipSends.length >= REACTIVATION_IP_MAX_SENDS) {
        return { ok: false, failure: "rate_limited", retryAfterSeconds: 60 };
      }
      tx.set(REACTIVATION_LIMITS, ipDocId(input.ip), {
        sendTimestamps: [...ipSends, input.now],
        updatedAt: input.now,
      });
    }

    const previousId = typeof limits.activeChallengeId === "string" ? limits.activeChallengeId : "";
    if (previousId) {
      const previous = await tx.get(REACTIVATION_CHALLENGES, previousId);
      if (
        previous &&
        (previous.status === "reserved" ||
          previous.status === "accepted" ||
          previous.status === "ambiguous")
      ) {
        tx.update(REACTIVATION_CHALLENGES, previousId, {
          status: "superseded",
          supersededAt: input.now,
        });
      }
    }

    const email = (profile.businessEmail || profile.normalizedEmail || "").trim().toLowerCase();
    const challengeId = randomBytes(16).toString("hex");
    const operationId = randomBytes(16).toString("hex");
    const code = generateEmailOtpCode();
    const emailVersion = profile.emailVerifiedAt ?? 0;
    const digest = digestBoundOtp(input.secret, [
      REACTIVATION_PURPOSE,
      input.uid,
      challengeId,
      String(deletionGeneration),
      String(emailVersion),
      code,
    ]);
    const expiresAt = input.now + REACTIVATION_OTP_TTL_MS;
    const resendAvailableAt = input.now + REACTIVATION_SEND_GAP_MS;

    tx.set(REACTIVATION_CHALLENGES, challengeId, {
      challengeId,
      userId: input.uid,
      purpose: REACTIVATION_PURPOSE,
      deletionGeneration,
      emailVersion,
      normalizedEmail: email,
      otpDigest: digest,
      createdAt: input.now,
      expiresAt,
      resendAvailableAt,
      operationId,
      deliveryState: "reserved",
      status: "reserved",
      incorrectAttempts: 0,
      consumedAt: null,
    });
    tx.set(REACTIVATION_LIMITS, limitDocId(input.uid), {
      activeChallengeId: challengeId,
      sendTimestamps: [...sends, input.now],
      guessTimestamps: guesses,
      updatedAt: input.now,
    });
    tx.update(REACTIVATION_USERS, input.uid, {
      reactivationRequestedAt: input.now,
      updatedAt: input.now,
    });

    return {
      ok: true as const,
      challengeId,
      operationId,
      code,
      to: email,
      maskedEmail: maskEmail(email),
      expiresAt,
      resendAvailableAt,
      deletionGeneration,
    };
  });
}

export async function publishReactivationDelivery(input: {
  db: ReactivationDb;
  uid: string;
  challengeId: string;
  operationId: string;
  outcome: "accepted" | "rejected" | "ambiguous";
  now: number;
}): Promise<void> {
  await input.db.runTransaction(async (tx) => {
    const doc = await tx.get(REACTIVATION_CHALLENGES, input.challengeId);
    if (!doc || doc.userId !== input.uid || doc.operationId !== input.operationId) return;
    if (doc.status !== "reserved") return;
    const deliveryState = input.outcome === "accepted" ? "accepted" : input.outcome;
    tx.update(REACTIVATION_CHALLENGES, input.challengeId, {
      deliveryState,
      status: deliveryState,
      deliveryPublishedAt: input.now,
    });
  });
}

export type VerifyOutcome =
  | { ok: true; profile: Record<string, unknown> }
  | { ok: false; failure: ReactivationFailure; retryAfterSeconds?: number };

export async function verifyReactivationCode(input: {
  db: ReactivationDb;
  uid: string;
  challengeId: string;
  code: string;
  now: number;
  secret: string;
}): Promise<VerifyOutcome> {
  const code = input.code.trim();
  const shapeOk = /^[0-9]{6}$/.test(code) && input.challengeId.length > 0 && input.challengeId.length <= 64;
  return input.db.runTransaction(async (tx) => {
    const limits = (await tx.get(REACTIVATION_LIMITS, limitDocId(input.uid))) ?? {};
    const guesses = within(limits.guessTimestamps, input.now, REACTIVATION_GUESS_WINDOW_MS);
    if (guesses.length >= REACTIVATION_MAX_GUESSES_PER_ACCOUNT) {
      const oldest = Math.min(...guesses);
      return {
        ok: false as const,
        failure: "attempts_exhausted" as const,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + REACTIVATION_GUESS_WINDOW_MS - input.now) / 1000)),
      };
    }

    const doc = await tx.get(REACTIVATION_CHALLENGES, input.challengeId);
    const profileRaw = await tx.get(REACTIVATION_USERS, input.uid);
    const jobRaw = await tx.get(REACTIVATION_JOBS, input.uid);
    const bumpGuess = () => {
      tx.set(REACTIVATION_LIMITS, limitDocId(input.uid), {
        ...limits,
        guessTimestamps: [...guesses, input.now],
        updatedAt: input.now,
      });
    };

    if (!doc || doc.userId !== input.uid || doc.purpose !== REACTIVATION_PURPOSE) {
      bumpGuess();
      return { ok: false as const, failure: "invalid" as const };
    }
    if (doc.status === "superseded") {
      bumpGuess();
      return { ok: false as const, failure: "superseded" as const };
    }
    if (doc.status === "consumed") {
      bumpGuess();
      return { ok: false as const, failure: "invalid" as const };
    }
    const attempts = Number(doc.incorrectAttempts ?? 0);
    if (doc.status === "locked" || attempts >= REACTIVATION_MAX_GUESSES_PER_CHALLENGE) {
      bumpGuess();
      return { ok: false as const, failure: "attempts_exhausted" as const };
    }
    if (doc.deliveryState !== "accepted" || doc.status !== "accepted") {
      bumpGuess();
      return { ok: false as const, failure: "invalid" as const };
    }
    if (Number(doc.expiresAt) <= input.now) {
      bumpGuess();
      tx.update(REACTIVATION_CHALLENGES, input.challengeId, { status: "expired" });
      return { ok: false as const, failure: "expired" as const };
    }
    if (!profileRaw) {
      bumpGuess();
      return { ok: false as const, failure: "ineligible" as const };
    }
    const profile = profileRaw as unknown as UserProfileDoc;
    const blocked = eligibleProfile(profile, input.now);
    if (blocked) {
      bumpGuess();
      return { ok: false as const, failure: blocked };
    }
    const job = jobRaw as unknown as DeletionJobDoc | null;
    if (job && !automaticRestorationAllowed(job, input.now)) {
      bumpGuess();
      return { ok: false as const, failure: "purge_underway" as const };
    }
    const generation = job?.generation ?? 0;
    if (Number(doc.deletionGeneration) !== generation) {
      bumpGuess();
      return { ok: false as const, failure: "superseded" as const };
    }
    if (Number(doc.emailVersion) !== (profile.emailVerifiedAt ?? 0)) {
      bumpGuess();
      return { ok: false as const, failure: "superseded" as const };
    }

    const parts = [
      REACTIVATION_PURPOSE,
      input.uid,
      input.challengeId,
      String(generation),
      String(profile.emailVerifiedAt ?? 0),
      shapeOk ? code : "invalid",
    ];
    const matches = shapeOk && verifyBoundOtpDigest(input.secret, parts, String(doc.otpDigest ?? ""));
    if (!matches) {
      const nextAttempts = attempts + 1;
      bumpGuess();
      tx.update(REACTIVATION_CHALLENGES, input.challengeId, {
        incorrectAttempts: nextAttempts,
        status: nextAttempts >= REACTIVATION_MAX_GUESSES_PER_CHALLENGE ? "locked" : "accepted",
      });
      return {
        ok: false as const,
        failure: nextAttempts >= REACTIVATION_MAX_GUESSES_PER_CHALLENGE ? "attempts_exhausted" as const : "invalid" as const,
      };
    }

    const nextProfile: Record<string, unknown> = {
      ...profileRaw,
      status: "active",
      deletionRequestedAt: null,
      deletionScheduledFor: null,
      deletionCompletedAt: null,
      deletionPolicyVersion: null,
      reactivationCutoff: null,
      erasureDeadline: null,
      reactivationRequestedAt: null,
      reactivationPhoneVerifiedAt: null,
      reactivationEmailVerifiedAt: input.now,
      previousLoginAt: profile.lastLoginAt ?? profile.previousLoginAt ?? null,
      lastLoginAt: input.now,
      lastActiveAt: input.now,
      updatedAt: input.now,
    };
    tx.update(REACTIVATION_USERS, input.uid, {
      status: "active",
      deletionRequestedAt: null,
      deletionScheduledFor: null,
      deletionCompletedAt: null,
      deletionPolicyVersion: null,
      reactivationCutoff: null,
      erasureDeadline: null,
      reactivationRequestedAt: null,
      reactivationPhoneVerifiedAt: null,
      reactivationEmailVerifiedAt: input.now,
      previousLoginAt: nextProfile.previousLoginAt,
      lastLoginAt: input.now,
      lastActiveAt: input.now,
      updatedAt: input.now,
    });
    tx.update(REACTIVATION_CHALLENGES, input.challengeId, {
      status: "consumed",
      deliveryState: "consumed",
      consumedAt: input.now,
    });
    if (job && job.status !== "cancelled") {
      tx.update(REACTIVATION_JOBS, input.uid, {
        status: "cancelled",
        generation: generation + 1,
        leaseOwner: null,
        leaseUntil: null,
        lastErrorCategory: "cancelled",
        lastErrorCode: "reactivated",
        updatedAt: input.now,
      });
    }
    return { ok: true as const, profile: nextProfile };
  });
}
