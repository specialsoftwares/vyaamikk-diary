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
};

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

export function applyLogoutAllWrite(
  existing: LogoutRecord | null,
  input: { operationId: string; nowSeconds: number }
): { record: LogoutRecord; shouldRevoke: boolean } {
  if (
    existing &&
    existing.operationId === input.operationId &&
    existing.revocationState === "complete"
  ) {
    return { record: existing, shouldRevoke: false };
  }
  if (
    existing &&
    existing.operationId === input.operationId &&
    existing.revocationState === "pending"
  ) {
    return { record: existing, shouldRevoke: true };
  }
  return {
    record: {
      revokedBeforeAuthTimeSeconds: nextCutoff(
        existing?.revokedBeforeAuthTimeSeconds ?? null,
        input.nowSeconds
      ),
      revocationState: "pending",
      operationId: input.operationId,
    },
    shouldRevoke: true,
  };
}

export function markLogoutComplete(existing: LogoutRecord, completedCutoff: number): LogoutRecord {
  return {
    revokedBeforeAuthTimeSeconds: Math.max(
      existing.revokedBeforeAuthTimeSeconds,
      Math.floor(completedCutoff)
    ),
    revocationState: "complete",
    operationId: existing.operationId,
  };
}

export type LogoutAllResult =
  | { ok: true; status: "complete"; revokedBeforeAuthTimeSeconds: number }
  | {
      ok: false;
      status: "pending";
      partial: true;
      reason: "revoke_failed";
      revokedBeforeAuthTimeSeconds: number;
    }
  | { ok: false; status: "rejected"; reason: string };

export async function performLogoutAll(
  input: {
    verified: VerifiedCredential | null;
    operationId: string;
    nowSeconds: number;
  },
  ports: {
    read: () => Promise<LogoutRecord | null>;
    write: (record: LogoutRecord) => Promise<void>;
    revokeRefreshTokens: (uid: string) => Promise<void>;
  }
): Promise<LogoutAllResult> {
  const admission = decideLogoutAllAdmission({
    verified: input.verified,
    nowSeconds: input.nowSeconds,
  });
  if (!admission.ok) return { ok: false, status: "rejected", reason: admission.reason };
  const existing = await ports.read();
  const plan = applyLogoutAllWrite(existing, {
    operationId: input.operationId,
    nowSeconds: input.nowSeconds,
  });
  if (
    !existing ||
    existing.revokedBeforeAuthTimeSeconds !== plan.record.revokedBeforeAuthTimeSeconds ||
    existing.revocationState !== plan.record.revocationState ||
    existing.operationId !== plan.record.operationId
  ) {
    await ports.write(plan.record);
  }
  if (!plan.shouldRevoke) {
    return {
      ok: true,
      status: "complete",
      revokedBeforeAuthTimeSeconds: plan.record.revokedBeforeAuthTimeSeconds,
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
      revokedBeforeAuthTimeSeconds: plan.record.revokedBeforeAuthTimeSeconds,
    };
  }
  const after = (await ports.read()) ?? plan.record;
  const complete = markLogoutComplete(after, plan.record.revokedBeforeAuthTimeSeconds);
  await ports.write(complete);
  return {
    ok: true,
    status: "complete",
    revokedBeforeAuthTimeSeconds: complete.revokedBeforeAuthTimeSeconds,
  };
}

/**
 * Trusted server continuation for a pending cutoff. It does not accept a
 * user token and cannot lower the stored cutoff.
 */
export async function continuePendingLogoutAll(ports: {
  read: () => Promise<LogoutRecord | null>;
  write: (record: LogoutRecord) => Promise<void>;
  revokeRefreshTokens: () => Promise<void>;
}): Promise<"complete" | "idle" | "pending"> {
  const existing = await ports.read();
  if (!existing) return "idle";
  if (existing.revocationState === "complete") return "complete";
  try {
    await ports.revokeRefreshTokens();
  } catch {
    return "pending";
  }
  const after = (await ports.read()) ?? existing;
  await ports.write(markLogoutComplete(after, existing.revokedBeforeAuthTimeSeconds));
  return "complete";
}
