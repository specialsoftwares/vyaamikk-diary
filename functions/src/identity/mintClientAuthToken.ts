import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";

import { assertAdmittedCallableUser } from "./admitCallableUser";
import type { InvocationRestoreReads } from "../deletion/restoreInvocationCache";
import {
  decideMintAdmission,
  ORIGIN_AUTH_TIME_CLAIM,
} from "./sessionSecurityPolicy";

function ensureAdminApp(): void {
  if (getApps().length === 0) initializeApp();
}

/**
 * Mint a JS custom token for the verified native phone identity.
 * request.data is ignored. Revoked and disabled credentials are rejected
 * before createCustomToken. The origin auth time is server-stamped.
 */
export const mintClientAuthToken = onCall({ region: "asia-south1" }, async (request) => {
  const restoreReads: InvocationRestoreReads = {};
  // Revocation and the cutoff are checked once inside assertAdmittedCallableUser.
  // This handler reuses that verified credential.
  const verified = await assertAdmittedCallableUser(request, restoreReads);
  if (!verified) {
    throw new HttpsError("unauthenticated", "Sign in with phone OTP first.");
  }
  ensureAdminApp();

  const decision = decideMintAdmission({
    verified,
    callerUid: request.auth?.uid ?? null,
  });
  if (!decision.ok) {
    throw new HttpsError(
      decision.reason === "provider" ? "permission-denied" : "unauthenticated",
      "Phone sign-in is required before a client session can be minted."
    );
  }

  const { restoreAdmissionForUid } = await import("../deletion/restoreGate");
  const admission = await restoreAdmissionForUid(decision.uid, undefined, restoreReads);
  if (admission.status === "deny") {
    throw new HttpsError("failed-precondition", "restore_not_admitted");
  }
  if (admission.status === "unavailable") {
    throw new HttpsError("unavailable", "Restore admission is temporarily unavailable. Try again when the connection returns.");
  }
  try {
    const { claimsForAdmission } = await import("../deletion/restoreAuthority");
    const token = await getAuth().createCustomToken(
      decision.uid,
      claimsForAdmission(
        { [ORIGIN_AUTH_TIME_CLAIM]: decision.originAuthTimeSeconds },
        admission
      )
    );
    return { token };
  } catch (e) {
    const message = e instanceof Error ? e.message : "token mint failed";
    const name = e instanceof Error ? e.name : "Error";
    logger.error("mintClientAuthToken createCustomToken failed", {
      errorName: name,
      errorMessage: message.replace(/\b[A-Za-z0-9_-]{20,}\b/g, "[redacted]").slice(0, 300),
      uidSuffix: decision.uid.length >= 6 ? decision.uid.slice(-6) : "??????",
      diagnosticCode: /iam|permission|token creator/i.test(message)
        ? "MINT_IAM_TOKEN_CREATOR"
        : "MINT_CUSTOM_TOKEN_FAILED",
    });
    throw new HttpsError(
      "internal",
      "Could not mint client auth token. Secure session bridge is unavailable.",
      { diagnosticCode: "MINT_CUSTOM_TOKEN_FAILED" }
    );
  }
});
