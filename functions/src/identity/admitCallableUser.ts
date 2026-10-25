import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import {
  AUTH_SECURITY_COLLECTION,
  ORIGIN_AUTH_TIME_CLAIM,
  bearerFromAuthorizationHeader,
  classifyVerifyFailure,
  decideCallableAdmission,
  type VerifiedCredential,
} from "./sessionSecurityPolicy";
import type { InvocationRestoreReads } from "../deletion/restoreInvocationCache";

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return "";
}

function ensureAdminApp(): void {
  if (getApps().length === 0) initializeApp();
}

function cutoffFromData(data: Record<string, unknown> | undefined, exists: boolean): number | null {
  if (!exists) return null;
  const value = data?.revokedBeforeAuthTimeSeconds;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * User-authenticated callables that use the Admin SDK must consult the same
 * origin cutoff as Security Rules. No request.auth means the callable's own
 * unauthenticated path still runs. A present session that fails verification
 * or the cutoff is rejected before Admin reads or writes.
 */
export async function assertAdmittedCallableUser(
  request: Pick<CallableRequest, "auth" | "rawRequest">,
  restoreReads?: InvocationRestoreReads
): Promise<VerifiedCredential | null> {
  if (!request.auth?.uid) return null;
  const bearer = bearerFromAuthorizationHeader(request.rawRequest?.headers?.authorization);
  if (!bearer) {
    throw new HttpsError("unauthenticated", "Sign-in is no longer valid.");
  }
  ensureAdminApp();
  let verified: VerifiedCredential;
  let originClaim: number | null = null;
  try {
    const decoded = await getAuth().verifyIdToken(bearer, true);
    const claim = decoded[ORIGIN_AUTH_TIME_CLAIM];
    originClaim = typeof claim === "number" && Number.isFinite(claim) ? claim : null;
    verified = {
      uid: decoded.uid,
      signInProvider: decoded.firebase?.sign_in_provider ?? "",
      authTimeSeconds: decoded.auth_time,
    };
  } catch (error) {
    const kind = classifyVerifyFailure(errorCode(error));
    if (kind === "disabled") {
      throw new HttpsError("permission-denied", "This account cannot use signed-in services.");
    }
    throw new HttpsError("unauthenticated", "Sign-in is no longer valid.");
  }
  if (verified.uid !== request.auth.uid) {
    throw new HttpsError("unauthenticated", "Sign-in is no longer valid.");
  }
  const snap = await getFirestore().collection(AUTH_SECURITY_COLLECTION).doc(verified.uid).get();
  const decision = decideCallableAdmission({
    verified,
    originClaim,
    cutoff: cutoffFromData(snap.data() as Record<string, unknown> | undefined, snap.exists),
  });
  if (!decision.admit) {
    throw new HttpsError("unauthenticated", "Sign-in is no longer valid.");
  }
  const { assertRestoreTrafficClosed } = await import("../deletion/restoreGate");
  await assertRestoreTrafficClosed(verified.uid, undefined, restoreReads);
  return verified;
}
