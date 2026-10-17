import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { assertAdmittedCallableUser } from "./admitCallableUser";
import {
  AUTH_SECURITY_COLLECTION,
  bearerFromAuthorizationHeader,
  classifyVerifyFailure,
  continuePendingLogoutAll,
  performLogoutAll,
  type AuthSecurityTransaction,
  type LogoutRecord,
  type VerifiedCredential,
} from "./sessionSecurityPolicy";

const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return "";
}

function ensureAdminApp(): void {
  if (getApps().length === 0) initializeApp();
}

function asRecord(data: Record<string, unknown> | undefined): LogoutRecord | null {
  if (!data) return null;
  const cutoff = data.revokedBeforeAuthTimeSeconds;
  const state = data.revocationState;
  const operationId = data.operationId;
  if (typeof cutoff !== "number" || (state !== "pending" && state !== "complete")) return null;
  if (typeof operationId !== "string" || !operationId) return null;
  const startedAt = data.startedAtSeconds;
  return {
    revokedBeforeAuthTimeSeconds: cutoff,
    revocationState: state,
    operationId,
    startedAtSeconds: typeof startedAt === "number" && Number.isFinite(startedAt) ? startedAt : 0,
  };
}

function authSecurityTransact<T>(uid: string, fn: AuthSecurityTransaction<T>): Promise<T> {
  const ref = getFirestore().collection(AUTH_SECURITY_COLLECTION).doc(uid);
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = asRecord(snap.data() as Record<string, unknown> | undefined);
    const result = fn(current);
    if (result.next) {
      const same =
        current &&
        current.revokedBeforeAuthTimeSeconds === result.next.revokedBeforeAuthTimeSeconds &&
        current.revocationState === result.next.revocationState &&
        current.operationId === result.next.operationId &&
        current.startedAtSeconds === result.next.startedAtSeconds;
      if (!same) {
        tx.set(ref, { ...result.next, updatedAt: Date.now() });
      }
    }
    return result.value;
  });
}

/**
 * Revokes Firebase refresh tokens for the verified user and records a
 * server-owned auth-time cutoff. A session document status is not consulted.
 * Partial revocation stays pending and is not reported as success.
 */
export const logoutAllDevices = onCall({ region: "asia-south1" }, async (request) => {
  const operationId =
    request.data && typeof request.data.operationId === "string" ? request.data.operationId.trim() : "";
  if (!OPERATION_ID.test(operationId)) {
    throw new HttpsError("invalid-argument", "A logout operation id is required.");
  }
  await assertAdmittedCallableUser(request);
  const bearer = bearerFromAuthorizationHeader(request.rawRequest?.headers?.authorization);
  if (!bearer) {
    throw new HttpsError("unauthenticated", "Sign in with phone OTP first.");
  }
  ensureAdminApp();
  let verified: VerifiedCredential;
  try {
    const decoded = await getAuth().verifyIdToken(bearer, true);
    verified = {
      uid: decoded.uid,
      signInProvider: decoded.firebase?.sign_in_provider ?? "",
      authTimeSeconds: decoded.auth_time,
    };
  } catch (error) {
    const kind = classifyVerifyFailure(errorCode(error));
    if (kind === "disabled") {
      throw new HttpsError("permission-denied", "This account cannot revoke sessions.");
    }
    throw new HttpsError("unauthenticated", "Phone sign-in is no longer valid.");
  }

  const result = await performLogoutAll(
    { verified, operationId, nowSeconds: Math.floor(Date.now() / 1000) },
    {
      transact: (fn) => authSecurityTransact(verified.uid, fn),
      revokeRefreshTokens: (uid) => getAuth().revokeRefreshTokens(uid),
    }
  );

  if (result.ok) {
    return {
      status: result.status,
      revokedBeforeAuthTimeSeconds: result.revokedBeforeAuthTimeSeconds,
    };
  }
  if (result.status === "pending") {
    throw new HttpsError(
      "failed-precondition",
      "Session revocation is incomplete. Other devices may still refresh until retry succeeds.",
      {
        partial: true,
        revocationState: "pending",
        revokedBeforeAuthTimeSeconds: result.revokedBeforeAuthTimeSeconds,
      }
    );
  }
  if (result.status === "superseded") {
    throw new HttpsError(
      "aborted",
      "A newer sign-out of every device is already recorded. This request did not mark it complete.",
      {
        partial: true,
        revocationState: "pending",
        revokedBeforeAuthTimeSeconds: result.revokedBeforeAuthTimeSeconds,
      }
    );
  }
  throw new HttpsError("permission-denied", "Recent phone sign-in is required to revoke every device.");
});

/** Server-side retry for a pending cutoff. Not a client callable. */
export async function continuePendingLogoutAllForUid(uid: string): Promise<"complete" | "idle" | "pending"> {
  ensureAdminApp();
  return continuePendingLogoutAll({
    transact: (fn) => authSecurityTransact(uid, fn),
    revokeRefreshTokens: () => getAuth().revokeRefreshTokens(uid),
  });
}
