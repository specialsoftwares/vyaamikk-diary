import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  createOrRotateEmailChallenge,
  resendEmailChallenge,
  throwEmailOtpError,
  verifyEmailChallengeAndBind,
} from "./challengeService";
import { EMAIL_OTP_USER_MESSAGES } from "./otpPolicy";
import {
  completeEmailChangeTransaction,
  startEmailChangeNewEmailChallenge,
  startEmailChangeRequireMobile,
} from "./emailChange";

function requireAuthUid(request: { auth?: { uid?: string } | null }): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", EMAIL_OTP_USER_MESSAGES.UNAUTHENTICATED, {
      code: "UNAUTHENTICATED",
    });
  }
  return uid;
}

/**
 * Start / rotate email OTP challenge and send code.
 * App Check: enable via Firebase Console rollout; not enforced here yet so
 * local emulator / Expo Go development remain usable (documented).
 */
export const startEmailVerification = onCall({ region: "asia-south1" }, async (request) => {
  const uid = requireAuthUid(request);
  const rawEmail = request.data?.email;
  const idempotencyKey =
    typeof request.data?.idempotencyKey === "string" ? request.data.idempotencyKey : null;
  if (typeof rawEmail !== "string") {
    throwEmailOtpError("EMAIL_INVALID", "invalid-argument");
  }
  return createOrRotateEmailChallenge({
    uid,
    rawEmail,
    purpose: "bind",
    idempotencyKey,
  });
});

export const resendEmailVerification = onCall({ region: "asia-south1" }, async (request) => {
  const uid = requireAuthUid(request);
  const challengeId = request.data?.challengeId ?? request.data?.verificationId;
  if (typeof challengeId !== "string") {
    throwEmailOtpError("EMAIL_INVALID", "invalid-argument");
  }
  return resendEmailChallenge({ uid, challengeId });
});

export const verifyAndBindEmail = onCall({ region: "asia-south1" }, async (request) => {
  const uid = requireAuthUid(request);
  const challengeId = request.data?.challengeId ?? request.data?.verificationId;
  const code = request.data?.code;
  const idempotencyKey =
    typeof request.data?.idempotencyKey === "string" ? request.data.idempotencyKey : null;
  if (typeof challengeId !== "string" || typeof code !== "string") {
    throwEmailOtpError("EMAIL_INVALID", "invalid-argument");
  }
  const profile = await verifyEmailChallengeAndBind({
    uid,
    challengeId,
    code,
    idempotencyKey,
  });
  return { profile };
});

/** Staged verified-email change (new email OTP after current-mobile factor). */
export const changeVerifiedEmail = onCall({ region: "asia-south1" }, async (request) => {
  const uid = requireAuthUid(request);
  const stage = request.data?.stage;
  if (stage === "require_mobile_otp") {
    return startEmailChangeRequireMobile({
      uid,
      mobileChallengeId: String(request.data?.mobileChallengeId ?? ""),
      mobileCode: String(request.data?.mobileCode ?? ""),
    });
  }
  if (stage === "start_new_email") {
    return startEmailChangeNewEmailChallenge({
      uid,
      changeSessionId: String(request.data?.changeSessionId ?? ""),
      newEmail: String(request.data?.newEmail ?? ""),
      idempotencyKey:
        typeof request.data?.idempotencyKey === "string" ? request.data.idempotencyKey : null,
    });
  }
  if (stage === "confirm_new_email") {
    return completeEmailChangeTransaction({
      uid,
      changeSessionId: String(request.data?.changeSessionId ?? ""),
      emailChallengeId: String(request.data?.emailChallengeId ?? ""),
      emailCode: String(request.data?.emailCode ?? ""),
    });
  }
  throw new HttpsError("invalid-argument", "Unknown email-change stage.");
});
