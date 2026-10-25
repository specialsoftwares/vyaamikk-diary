/**
 * Pure admission policy for the native-to-JS bridge and logout-all.
 * Firebase Auth remains the token authority. Caller-supplied uid is ignored.
 */

export const RECENT_NATIVE_AUTH_WINDOW_SECONDS = 10 * 60;
export const AUTH_SECURITY_COLLECTION = "authSecurity";
export const ORIGIN_AUTH_TIME_CLAIM = "vydOriginAuthTime";

export type VerifiedCredential = {
  uid: string;
  signInProvider: string;
  authTimeSeconds: number;
};

export type LogoutRecord = {
  revokedBeforeAuthTimeSeconds: number;
  revocationState: "pending" | "complete";
  operationId: string;
  /** Server seconds when this operation became the current one. */
  startedAtSeconds: number;
};

export function decideCallableAdmission(input: {
  verified: VerifiedCredential | null;
  originClaim: number | null;
  cutoff: number | null;
}): { admit: true; originSeconds: number } | { admit: false; reason: "unverified" | "cutoff" } {
  if (!input.verified?.uid) return { admit: false, reason: "unverified" };
  const originSeconds = originAuthSeconds({
    signInProvider: input.verified.signInProvider,
    authTimeSeconds: input.verified.authTimeSeconds,
    originClaim: input.originClaim,
  });
  if (!sessionAdmitted({ cutoff: input.cutoff, originSeconds })) {
    return { admit: false, reason: "cutoff" };
  }
  return { admit: true, originSeconds };
}

export function bearerFromAuthorizationHeader(
  header: string | string[] | undefined
): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export function classifyVerifyFailure(code: string): "revoked" | "disabled" | "invalid" {
  if (code === "auth/id-token-revoked") return "revoked";
  if (code === "auth/user-disabled" || code === "auth/user-not-found") return "disabled";
  return "invalid";
}

export function decideMintAdmission(input: {
  verified: VerifiedCredential | null;
  callerUid: string | null;
}):
  | { ok: true; uid: string; originAuthTimeSeconds: number }
  | { ok: false; reason: "unverified" | "uid_mismatch" | "provider" | "auth_time" } {
  if (!input.verified?.uid) return { ok: false, reason: "unverified" };
  if (input.callerUid && input.callerUid !== input.verified.uid) {
    return { ok: false, reason: "uid_mismatch" };
  }
  if (input.verified.signInProvider !== "phone") return { ok: false, reason: "provider" };
  if (!Number.isFinite(input.verified.authTimeSeconds) || input.verified.authTimeSeconds <= 0) {
    return { ok: false, reason: "auth_time" };
  }
  return {
    ok: true,
    uid: input.verified.uid,
    originAuthTimeSeconds: Math.floor(input.verified.authTimeSeconds),
  };
}

/**
 * Phone tokens use auth_time. Bridged custom tokens use the server-stamped
 * origin claim. A custom token without that claim is not given the
 * redemption auth_time, which would be after a revocation cutoff.
 */
export function originAuthSeconds(token: {
  signInProvider: string;
  authTimeSeconds: number;
  originClaim: number | null;
}): number {
  if (token.signInProvider === "phone") return Math.floor(token.authTimeSeconds);
  if (
    token.signInProvider === "custom" &&
    token.originClaim != null &&
    Number.isFinite(token.originClaim)
  ) {
    return Math.floor(token.originClaim);
  }
  return 0;
}

/** Equal seconds are denied. A missing cutoff document admits the session. */
export function sessionAdmitted(input: { cutoff: number | null; originSeconds: number }): boolean {
  if (input.cutoff == null) return true;
  return input.originSeconds > input.cutoff;
}

export function decideLogoutAllAdmission(input: {
  verified: VerifiedCredential | null;
  nowSeconds: number;
}): { ok: true; uid: string } | { ok: false; reason: "unverified" | "provider" | "auth_not_recent" } {
  if (!input.verified?.uid) return { ok: false, reason: "unverified" };
  if (input.verified.signInProvider !== "phone") return { ok: false, reason: "provider" };
  const age = input.nowSeconds - input.verified.authTimeSeconds;
  if (!Number.isFinite(age) || age < 0 || age > RECENT_NATIVE_AUTH_WINDOW_SECONDS) {
    return { ok: false, reason: "auth_not_recent" };
  }
  return { ok: true, uid: input.verified.uid };
}

export function nextCutoff(existing: number | null, nowSeconds: number): number {
  const now = Math.floor(nowSeconds);
  if (existing == null) return now;
  return Math.max(existing, now);
}

export type BeginLogoutOutcome =
  | { action: "revoke"; record: LogoutRecord }
  | { action: "already_complete"; record: LogoutRecord }
  | { action: "leave"; record: LogoutRecord };

/**
 * A different operation may replace the current one only when its server
 * time is strictly newer. Same-second and older requests leave the record.
 */
export function beginLogoutOperation(
  existing: LogoutRecord | null,
  input: { operationId: string; nowSeconds: number }
): { next: LogoutRecord | null; outcome: BeginLogoutOutcome } {
  const now = Math.floor(input.nowSeconds);
  if (existing && existing.operationId === input.operationId) {
    if (existing.revocationState === "complete") {
      return { next: null, outcome: { action: "already_complete", record: existing } };
    }
    return { next: null, outcome: { action: "revoke", record: existing } };
  }
  if (existing && now <= existing.startedAtSeconds) {
    return { next: null, outcome: { action: "leave", record: existing } };
  }
  const next: LogoutRecord = {
    revokedBeforeAuthTimeSeconds: nextCutoff(existing?.revokedBeforeAuthTimeSeconds ?? null, now),
    revocationState: "pending",
    operationId: input.operationId,
    startedAtSeconds: now,
  };
  return { next, outcome: { action: "revoke", record: next } };
}

export function completeLogoutOperation(
  existing: LogoutRecord | null,
  input: { operationId: string; completedCutoff: number }
): { next: LogoutRecord | null; record: LogoutRecord | null; completed: boolean } {
  if (!existing || existing.operationId !== input.operationId) {
    return { next: null, record: existing, completed: false };
  }
  if (existing.revocationState === "complete") {
    return { next: null, record: existing, completed: true };
  }
  const next = markLogoutComplete(existing, input.completedCutoff);
  return { next, record: next, completed: true };
}

export function markLogoutComplete(existing: LogoutRecord, completedCutoff: number): LogoutRecord {
  return {
    revokedBeforeAuthTimeSeconds: Math.max(
      existing.revokedBeforeAuthTimeSeconds,
      Math.floor(completedCutoff)
    ),
    revocationState: "complete",
    operationId: existing.operationId,
    startedAtSeconds: existing.startedAtSeconds,
  };
}

export type LogoutAllResult =
  | { ok: true; status: "complete"; revokedBeforeAuthTimeSeconds: number; operationId: string }
  | {
      ok: false;
      status: "pending";
      partial: true;
      reason: "revoke_failed";
      revokedBeforeAuthTimeSeconds: number;
      operationId: string;
    }
  | {
      ok: false;
      status: "superseded";
      reason: "newer_operation";
      revokedBeforeAuthTimeSeconds: number;
      operationId: string;
    }
  | { ok: false; status: "rejected"; reason: string };

export type AuthSecurityTransaction<T> = (
  current: LogoutRecord | null
) => { next: LogoutRecord | null; value: T };

export async function performLogoutAll(
  input: {
    verified: VerifiedCredential | null;
    operationId: string;
    nowSeconds: number;
  },
  ports: {
    transact: <T>(fn: AuthSecurityTransaction<T>) => Promise<T>;
    revokeRefreshTokens: (uid: string) => Promise<void>;
  }
): Promise<LogoutAllResult> {
  const admission = decideLogoutAllAdmission({
    verified: input.verified,
    nowSeconds: input.nowSeconds,
  });
  if (!admission.ok) return { ok: false, status: "rejected", reason: admission.reason };
  const begun = await ports.transact((current) => {
    const step = beginLogoutOperation(current, {
      operationId: input.operationId,
      nowSeconds: input.nowSeconds,
    });
    return { next: step.next, value: step.outcome };
  });
  if (begun.action === "leave") {
    return {
      ok: false,
      status: "superseded",
      reason: "newer_operation",
      revokedBeforeAuthTimeSeconds: begun.record.revokedBeforeAuthTimeSeconds,
      operationId: begun.record.operationId,
    };
  }
  if (begun.action === "already_complete") {
    return {
      ok: true,
      status: "complete",
      revokedBeforeAuthTimeSeconds: begun.record.revokedBeforeAuthTimeSeconds,
      operationId: begun.record.operationId,
    };
  }
  try {
    await ports.revokeRefreshTokens(admission.uid);
  } catch {
    return {
      ok: false,
      status: "pending",
      partial: true,
      reason: "revoke_failed",
      revokedBeforeAuthTimeSeconds: begun.record.revokedBeforeAuthTimeSeconds,
      operationId: begun.record.operationId,
    };
  }
  const finished = await ports.transact((current) => {
    const step = completeLogoutOperation(current, {
      operationId: input.operationId,
      completedCutoff: begun.record.revokedBeforeAuthTimeSeconds,
    });
    return { next: step.next, value: step };
  });
  if (!finished.completed || !finished.record) {
    return {
      ok: false,
      status: "superseded",
      reason: "newer_operation",
      revokedBeforeAuthTimeSeconds:
        finished.record?.revokedBeforeAuthTimeSeconds ??
        begun.record.revokedBeforeAuthTimeSeconds,
      operationId: finished.record?.operationId ?? begun.record.operationId,
    };
  }
  return {
    ok: true,
    status: "complete",
    revokedBeforeAuthTimeSeconds: finished.record.revokedBeforeAuthTimeSeconds,
    operationId: finished.record.operationId,
  };
}

/**
 * Trusted server continuation for a pending cutoff. It does not accept a
 * user token. Revocation stays outside the transaction. A newer operation
 * is left pending rather than marked complete.
 */
export async function continuePendingLogoutAll(ports: {
  transact: <T>(fn: AuthSecurityTransaction<T>) => Promise<T>;
  revokeRefreshTokens: () => Promise<void>;
}): Promise<"complete" | "idle" | "pending"> {
  const captured = await ports.transact((current) => ({ next: null, value: current }));
  if (!captured) return "idle";
  if (captured.revocationState === "complete") return "complete";
  try {
    await ports.revokeRefreshTokens();
  } catch {
    return "pending";
  }
  const completed = await ports.transact((current) => {
    const step = completeLogoutOperation(current, {
      operationId: captured.operationId,
      completedCutoff: captured.revokedBeforeAuthTimeSeconds,
    });
    return { next: step.next, value: step.completed };
  });
  return completed ? "complete" : "pending";
}
