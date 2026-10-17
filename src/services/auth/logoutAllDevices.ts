/**
 * Confirmed logout-all. Local sign-out does not call this and stays available
 * offline. An unavailable network or a failed remote call is not reported as
 * remote success. This device is cleared only after the user confirms.
 */

import { AppError } from "@/domain/errors";

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
