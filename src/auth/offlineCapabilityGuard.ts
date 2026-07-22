/**
 * Central offline / session capability guard.
 * Apply at feature-entry AND mutation/service level — UI disable alone is insufficient.
 */

import { AppError } from "@/domain/errors";
import {
  OFFLINE_FULL_ACCESS_MS,
  resolveOfflineAccessMode,
  type OfflineAccessMode,
} from "@/auth/offlineAccessPolicy";

export type CapabilityState =
  | "onlineValidated"
  | "offlineFullAccess"
  | "offlineReadOnly"
  | "sessionRevoked"
  | "accountDisabled"
  | "accountDeleted"
  | "ownershipUnverified";

export const OFFLINE_READ_ONLY_CODE = "OFFLINE_READ_ONLY" as const;

export const OFFLINE_READ_ONLY_USER_MESSAGE =
  "You can view existing records, but creating, editing, deleting, PDF generation, sharing, and sync are unavailable until you reconnect and this device is re-validated.";

export type ProtectedMutationKind =
  | "create"
  | "edit"
  | "delete"
  | "pdf"
  | "share"
  | "sync"
  | "export"
  | "identity_change"
  | "security";

const READ_ONLY_BLOCKED: ReadonlySet<ProtectedMutationKind> = new Set([
  "create",
  "edit",
  "delete",
  "pdf",
  "share",
  "sync",
  "export",
  "identity_change",
  "security",
]);

export interface CapabilityContext {
  isOnline: boolean;
  lastSuccessfulOnlineValidationAt: number | null;
  sessionRevoked?: boolean;
  accountDisabled?: boolean;
  accountDeleted?: boolean;
  ownershipVerified?: boolean;
  now?: number;
}

export function resolveCapabilityState(ctx: CapabilityContext): CapabilityState {
  if (ctx.accountDeleted) return "accountDeleted";
  if (ctx.accountDisabled) return "accountDisabled";
  if (ctx.sessionRevoked) return "sessionRevoked";
  if (ctx.ownershipVerified === false) return "ownershipUnverified";

  if (ctx.isOnline) return "onlineValidated";

  const mode: OfflineAccessMode = resolveOfflineAccessMode({
    isOnline: false,
    lastSuccessfulOnlineValidationAt: ctx.lastSuccessfulOnlineValidationAt,
    now: ctx.now,
  });
  return mode === "offline_full" ? "offlineFullAccess" : "offlineReadOnly";
}

export function mutationAllowedForCapability(
  state: CapabilityState,
  kind: ProtectedMutationKind
): boolean {
  if (
    state === "sessionRevoked" ||
    state === "accountDisabled" ||
    state === "accountDeleted" ||
    state === "ownershipUnverified"
  ) {
    return false;
  }
  if (state === "onlineValidated" || state === "offlineFullAccess") {
    return true;
  }
  // offlineReadOnly
  return !READ_ONLY_BLOCKED.has(kind);
}

export function assertMutationAllowed(
  ctx: CapabilityContext,
  kind: ProtectedMutationKind
): CapabilityState {
  const state = resolveCapabilityState(ctx);
  if (!mutationAllowedForCapability(state, kind)) {
    if (state === "offlineReadOnly") {
      throw new AppError("offline_read_only", OFFLINE_READ_ONLY_USER_MESSAGE, undefined, {
        code: OFFLINE_READ_ONLY_CODE,
        offlineWindowMs: OFFLINE_FULL_ACCESS_MS,
      });
    }
    throw new AppError(
      "permission_denied",
      state === "sessionRevoked"
        ? "This session is no longer valid. Sign in again."
        : state === "accountDeleted"
          ? "This account has been deleted."
          : state === "accountDisabled"
            ? "This account is disabled."
            : "This action is not available right now.",
      undefined,
      { capability: state, mutation: kind }
    );
  }
  return state;
}

/** Feature-entry helper — same rules as service-level assert. */
export function canEnterMutatingFeature(
  ctx: CapabilityContext,
  kind: ProtectedMutationKind = "create"
): { allowed: true; state: CapabilityState } | { allowed: false; state: CapabilityState; message: string } {
  const state = resolveCapabilityState(ctx);
  if (mutationAllowedForCapability(state, kind)) {
    return { allowed: true, state };
  }
  return {
    allowed: false,
    state,
    message:
      state === "offlineReadOnly"
        ? OFFLINE_READ_ONLY_USER_MESSAGE
        : "This action is not available right now.",
  };
}

/** In-memory last validation clock used by services when NetInfo is not injected. */
let lastSuccessfulOnlineValidationAt: number | null = Date.now();
let lastKnownOnline = true;
let sessionRevoked = false;
let accountDisabled = false;
let accountDeleted = false;

export function recordSuccessfulOnlineValidation(at = Date.now()): void {
  lastSuccessfulOnlineValidationAt = at;
  lastKnownOnline = true;
  sessionRevoked = false;
}

export function recordConnectivity(isOnline: boolean): void {
  lastKnownOnline = isOnline;
}

export function markSessionRevoked(): void {
  sessionRevoked = true;
}

export function markAccountDisabled(disabled: boolean): void {
  accountDisabled = disabled;
}

export function markAccountDeleted(deleted: boolean): void {
  accountDeleted = deleted;
}

export function getLiveCapabilityContext(now = Date.now()): CapabilityContext {
  return {
    isOnline: lastKnownOnline,
    lastSuccessfulOnlineValidationAt,
    sessionRevoked,
    accountDisabled,
    accountDeleted,
    ownershipVerified: true,
    now,
  };
}

export function assertLiveMutationAllowed(kind: ProtectedMutationKind): CapabilityState {
  return assertMutationAllowed(getLiveCapabilityContext(), kind);
}

/** Test-only reset. */
export function __resetCapabilityGuardForTests(opts?: {
  lastValidationAt?: number | null;
  isOnline?: boolean;
}): void {
  lastSuccessfulOnlineValidationAt =
    opts?.lastValidationAt === undefined ? Date.now() : opts.lastValidationAt;
  lastKnownOnline = opts?.isOnline ?? true;
  sessionRevoked = false;
  accountDisabled = false;
  accountDeleted = false;
}
