import { AppError } from "@/domain/errors";
import type { LocalSignOutResult } from "./authSessionFence";

/**
 * Confirmed logout-all. Local sign-out does not call this and stays available
 * offline. An unavailable network or a failed remote call is not reported as
 * remote success.
 *
 * The Settings control stays off until the protected callables and both
 * cutoff-enforcing Rules are deployed and validated. Enabling it earlier
 * leaves an access window between revocation and Rules enforcement.
 */
export const LOGOUT_ALL_CONTROL_ENABLED: boolean = false;

export type LogoutAllIdentity = {
  uid: string;
  generation: number;
};

export type LogoutAllRemoteStatus =
  | "complete"
  | "pending"
  | "superseded"
  | "not_recent"
  | "sign_in_invalid"
  | "account_blocked"
  | "unavailable";

export type ConfirmedLogoutAllResult =
  | { kind: "not_confirmed"; clearedThisDevice: false }
  | {
      kind: "complete" | "pending" | "offline" | LogoutAllRemoteStatus;
      clearedThisDevice: true;
    };

export async function requestLogoutAllDevices(input: {
  online: boolean;
  operationId: string;
  call: (operationId: string) => Promise<{ status: "complete" | "pending" }>;
}): Promise<{ remote: "complete" | "pending" | "unavailable" }> {
  if (!input.online) return { remote: "unavailable" };
  try {
    const result = await input.call(input.operationId);
    if (result.status === "complete" || result.status === "pending") {
      return { remote: result.status };
    }
    return { remote: "unavailable" };
  } catch {
    return { remote: "unavailable" };
  }
}

export function newLogoutOperationId(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function classifyLogoutAllCallableFailure(error: unknown): Exclude<LogoutAllRemoteStatus, "complete"> {
  const code =
    error instanceof AppError && typeof error.details?.functionsErrorCode === "string"
      ? error.details.functionsErrorCode
      : error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
  const message = error instanceof Error ? error.message : "";
  if (code === "functions/failed-precondition") return "pending";
  if (code === "functions/aborted") return "superseded";
  if (code === "functions/unauthenticated") return "sign_in_invalid";
  if (code === "functions/permission-denied") {
    return /cannot revoke sessions/i.test(message) ? "account_blocked" : "not_recent";
  }
  return "unavailable";
}

export type LogoutAllRemoteOutcome = "offline" | LogoutAllRemoteStatus;

export type LogoutAllOrchestrationResult = {
  /** What the server did, including when local UI completion is discarded. */
  remote: "not_confirmed" | "not_sent" | LogoutAllRemoteOutcome;
  localCompletion: "applied" | "device_only" | "discarded";
};

/**
 * Confirmation is required before any remote call or local cleanup.
 * Offline confirmation clears only this device. A complete remote result is
 * the only outcome that means other devices' refresh tokens were revoked.
 */
export async function runConfirmedLogoutAll(input: {
  confirmed: boolean;
  online: boolean;
  operationId: string;
  call: (operationId: string) => Promise<{ status: LogoutAllRemoteStatus }>;
  clearThisDevice: () => Promise<void>;
}): Promise<ConfirmedLogoutAllResult> {
  if (!input.confirmed) return { kind: "not_confirmed", clearedThisDevice: false };
  if (!input.online) {
    await input.clearThisDevice();
    return { kind: "offline", clearedThisDevice: true };
  }
  let status: LogoutAllRemoteStatus = "unavailable";
  try {
    const result = await input.call(input.operationId);
    if (
      result.status === "complete" ||
      result.status === "pending" ||
      result.status === "superseded" ||
      result.status === "not_recent" ||
      result.status === "sign_in_invalid" ||
      result.status === "account_blocked"
    ) {
      status = result.status;
    }
  } catch {
    status = "unavailable";
  }
  await input.clearThisDevice();
  return { kind: status, clearedThisDevice: true };
}

/**
 * Production logout-all completion. Confirmation captures the uid and
 * pre-logout generation. Local sign-out then retires that generation and
 * owns the retirement through SDK and profile-cache awaits. Navigation,
 * alerts, and busy-state completion run only when that retirement is still
 * current afterwards. The logout's own generation bump is not a newer login.
 * An unmounted screen does not navigate or alert. Profile-cache clearing
 * belongs to local sign-out, not a second step here.
 */
export async function orchestrateConfirmedLogoutAll(input: {
  confirmed: boolean;
  online: boolean;
  operationId: string;
  identity: LogoutAllIdentity;
  sessionStillCurrent: () => boolean;
  uiAttached: () => boolean;
  call: (operationId: string, identity: LogoutAllIdentity) => Promise<{ status: LogoutAllRemoteStatus }>;
  signOutThisDevice: () => Promise<LocalSignOutResult | void>;
  navigateToSignedOut: () => void;
  presentOutcome: (remote: LogoutAllRemoteOutcome) => void;
  setBusy: (busy: boolean) => void;
}): Promise<LogoutAllOrchestrationResult> {
  if (!input.confirmed) return { remote: "not_confirmed", localCompletion: "discarded" };
  if (!input.identity.uid || !input.sessionStillCurrent()) {
    return { remote: "not_sent", localCompletion: "discarded" };
  }
  if (input.uiAttached()) input.setBusy(true);

  let remote: LogoutAllRemoteOutcome;
  if (!input.online) {
    remote = "offline";
  } else {
    try {
      if (!input.sessionStillCurrent()) {
        return { remote: "not_sent", localCompletion: "discarded" };
      }
      const result = await input.call(input.operationId, input.identity);
      remote =
        result.status === "complete" ||
        result.status === "pending" ||
        result.status === "superseded" ||
        result.status === "not_recent" ||
        result.status === "sign_in_invalid" ||
        result.status === "account_blocked"
          ? result.status
          : "unavailable";
    } catch {
      remote = "unavailable";
    }
  }

  if (!input.sessionStillCurrent()) {
    return { remote, localCompletion: "discarded" };
  }
  const local = await input.signOutThisDevice();
  if (local?.superseded) {
    return { remote, localCompletion: "discarded" };
  }
  if (!input.uiAttached()) {
    return { remote, localCompletion: "device_only" };
  }
  input.setBusy(false);
  input.presentOutcome(remote);
  input.navigateToSignedOut();
  return { remote, localCompletion: "applied" };
}
