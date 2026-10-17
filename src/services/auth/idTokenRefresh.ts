/**
 * ID-token refresh policy for the native identity-callable gate.
 * Routine calls use the SDK cache. Forced refresh is only for an explicit
 * invalidation or one bounded recovery after a missing/expired token.
 * Never logs token text.
 */

const RECOVERABLE_TOKEN_CODES = new Set([
  "auth/user-token-expired",
  "auth/invalid-user-token",
  "auth/network-request-failed",
]);

const NON_RECOVERABLE_CODES = new Set([
  "auth/user-disabled",
  "auth/user-not-found",
  "permission-denied",
  "unauthenticated",
]);

export function firebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.length > 0 && code.length < 80 ? code : null;
}

export function isRecoverableIdTokenError(error: unknown): boolean {
  const code = firebaseErrorCode(error);
  if (!code) return false;
  if (NON_RECOVERABLE_CODES.has(code)) return false;
  return RECOVERABLE_TOKEN_CODES.has(code);
}

export function shouldForceIdTokenRefresh(input: {
  explicitInvalidation: boolean;
  recoveryAttempt: number;
}): boolean {
  if (input.explicitInvalidation) return true;
  return input.recoveryAttempt > 0;
}

export function tokenLooksAttachable(token: unknown): token is string {
  return typeof token === "string" && token.length > 20;
}

export interface IdTokenRead {
  forced: boolean;
  recoveryUsed: boolean;
}

/**
 * Reads an attachable ID token. Does not return the token to logs.
 * The token itself is returned only to the caller that must hold it
 * until the callable SDK attaches it; callers must not persist it.
 */
export async function readNativeIdToken(
  user: { getIdToken: (forceRefresh?: boolean) => Promise<string> },
  options: { explicitInvalidation: boolean }
): Promise<IdTokenRead & { token: string }> {
  const firstForce = shouldForceIdTokenRefresh({
    explicitInvalidation: options.explicitInvalidation,
    recoveryAttempt: 0,
  });
  try {
    const token = await user.getIdToken(firstForce);
    if (tokenLooksAttachable(token)) {
      return { token, forced: firstForce, recoveryUsed: false };
    }
  } catch (error) {
    if (firstForce || !isRecoverableIdTokenError(error)) throw error;
    const token = await user.getIdToken(true);
    if (!tokenLooksAttachable(token)) {
      throw error;
    }
    return { token, forced: true, recoveryUsed: true };
  }

  if (firstForce) {
    throw new Error("id_token_empty");
  }
  const token = await user.getIdToken(true);
  if (!tokenLooksAttachable(token)) {
    throw new Error("id_token_empty");
  }
  return { token, forced: true, recoveryUsed: true };
}
