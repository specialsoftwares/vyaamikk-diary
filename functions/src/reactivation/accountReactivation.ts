import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";

import { getAdminDb } from "../admin";
import { assertAdmittedCallableUser } from "../identity/admitCallableUser";
import type { UserProfileDoc } from "../identity/shared";
import { EMAIL_OTP_RUNTIME_SECRETS } from "../email/secrets";
import { resolveEmailProvider } from "../email/provider";
import {
  publishReactivationDelivery,
  readReactivationHmacSecret,
  reactivationEmailCopy,
  reserveReactivationSend,
  verifyReactivationCode,
  type ReactivationDb,
  type ReactivationFailure,
  type ReactivationMailer,
  type ReactivationTx,
} from "./reactivationOtp";

const callOpts = { region: "asia-south1" as const, secrets: EMAIL_OTP_RUNTIME_SECRETS };

export function adminReactivationDb(): ReactivationDb {
  const db = getAdminDb();
  return {
    async runTransaction(fn) {
      return db.runTransaction(async (tx) => {
        const ops: Array<() => void> = [];
        const adapter: ReactivationTx = {
          async get(collection, id) {
            const snap = await tx.get(db.collection(collection).doc(id));
            return snap.exists ? ({ ...(snap.data() as Record<string, unknown>) }) : null;
          },
          set(collection, id, data) {
            ops.push(() => {
              tx.set(db.collection(collection).doc(id), data);
            });
          },
          update(collection, id, data) {
            ops.push(() => {
              tx.update(db.collection(collection).doc(id), data);
            });
          },
        };
        const result = await fn(adapter);
        for (const op of ops) op();
        return result;
      });
    },
  };
}

export function productionReactivationMailer(): ReactivationMailer {
  const resolved = resolveEmailProvider();
  if (resolved.mode === "unavailable") {
    return { async send() { return "rejected"; } };
  }
  return {
    async send(input) {
      try {
        const result = await resolved.provider.send({
          to: input.to,
          subject: input.subject,
          textBody: input.text,
          idempotencyKey: input.idempotencyKey,
        });
        return result.delivered ? "accepted" : "rejected";
      } catch {
        return "ambiguous";
      }
    },
  };
}

function httpsFor(failure: ReactivationFailure, retryAfterSeconds?: number): HttpsError {
  const retry = retryAfterSeconds ?? null;
  if (failure === "cooldown" || failure === "rate_limited" || failure === "attempts_exhausted") {
    return new HttpsError("resource-exhausted", "Please wait and try again.", {
      code: failure,
      retryAfterSeconds: retry,
    });
  }
  if (failure === "provider_unavailable") {
    return new HttpsError("failed-precondition", "Could not send the reactivation email. Try again later.", {
      code: failure,
      retryAfterSeconds: retry,
    });
  }
  if (failure === "no_verified_email") {
    return new HttpsError(
      "failed-precondition",
      "This account has no verified email. Contact support to recover it.",
      { code: failure }
    );
  }
  if (failure === "phone_proof_expired") {
    return new HttpsError("failed-precondition", "Phone verification expired. Sign in with OTP again.", {
      code: failure,
    });
  }
  if (failure === "expired") {
    return new HttpsError("deadline-exceeded", "That code has expired. Request a new one.", { code: failure });
  }
  if (failure === "superseded") {
    return new HttpsError("aborted", "That code is no longer valid. Use the latest email.", { code: failure });
  }
  if (failure === "purge_underway" || failure === "ineligible") {
    return new HttpsError("failed-precondition", "This account cannot be reactivated automatically.", {
      code: failure,
    });
  }
  return new HttpsError("invalid-argument", "Incorrect code. Please try again.", { code: "invalid" });
}

function callerIp(request: CallableRequest): string | null {
  const raw = request.rawRequest as { ip?: string } | undefined;
  const ip = typeof raw?.ip === "string" ? raw.ip.trim() : "";
  if (!ip || ip.length > 64) return null;
  return ip;
}

export async function performStartAccountReactivation(input: {
  db: ReactivationDb;
  mailer: ReactivationMailer;
  uid: string;
  now: number;
  ip: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  verificationId: string;
  maskedEmail: string;
  requiresEmailVerification: true;
  expiresAt: number;
  resendAvailableAt: number;
}> {
  const secret = readReactivationHmacSecret(input.env);
  const reserved = await reserveReactivationSend({
    db: input.db,
    uid: input.uid,
    now: input.now,
    secret,
    ip: input.ip,
  });
  if (!reserved.ok) throw httpsFor(reserved.failure, reserved.retryAfterSeconds);
  const copy = reactivationEmailCopy(reserved.code);
  let outcome: "accepted" | "rejected" | "ambiguous" = "rejected";
  try {
    outcome = await input.mailer.send({
      to: reserved.to,
      subject: copy.subject,
      text: copy.text,
      idempotencyKey: reserved.operationId,
    });
  } catch {
    outcome = "ambiguous";
  }
  await publishReactivationDelivery({
    db: input.db,
    uid: input.uid,
    challengeId: reserved.challengeId,
    operationId: reserved.operationId,
    outcome,
    now: input.now,
  });
  if (outcome !== "accepted") throw httpsFor("provider_unavailable");
  return {
    verificationId: reserved.challengeId,
    maskedEmail: reserved.maskedEmail,
    requiresEmailVerification: true,
    expiresAt: reserved.expiresAt,
    resendAvailableAt: reserved.resendAvailableAt,
  };
}

export async function performCompleteAccountReactivation(input: {
  db: ReactivationDb;
  uid: string;
  challengeId: string;
  code: string;
  now: number;
  env?: NodeJS.ProcessEnv;
}): Promise<{ profile: UserProfileDoc; isNewUser: false }> {
  const secret = readReactivationHmacSecret(input.env);
  const verified = await verifyReactivationCode({
    db: input.db,
    uid: input.uid,
    challengeId: input.challengeId,
    code: input.code,
    now: input.now,
    secret,
  });
  if (!verified.ok) throw httpsFor(verified.failure, verified.retryAfterSeconds);
  return { profile: verified.profile as unknown as UserProfileDoc, isNewUser: false };
}

export const startAccountReactivation = onCall(callOpts, async (request) => {
  await assertAdmittedCallableUser(request);
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  return performStartAccountReactivation({
    db: adminReactivationDb(),
    mailer: productionReactivationMailer(),
    uid,
    now: Date.now(),
    ip: callerIp(request),
  });
});

export const completeAccountReactivation = onCall(callOpts, async (request) => {
  await assertAdmittedCallableUser(request);
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const challengeId = request.data?.challengeId ?? request.data?.verificationId;
  const code = request.data?.code;
  if (typeof challengeId !== "string" || typeof code !== "string") {
    throw httpsFor("invalid");
  }
  return performCompleteAccountReactivation({
    db: adminReactivationDb(),
    uid,
    challengeId,
    code,
    now: Date.now(),
  });
});
