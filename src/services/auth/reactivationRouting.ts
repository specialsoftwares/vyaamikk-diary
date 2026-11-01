/**
 * Pure routing helpers for resolveOrCreateUserByPhone deletion_pending responses.
 */

import { AppError } from "@/domain/errors";
import type { PhoneE164 } from "@/domain/types";

export interface ResolveByPhoneSuccessResponse {
  profile: Record<string, unknown>;
  isNewUser: boolean;
}

export interface DeletionPendingResponse {
  status: "deletion_pending";
  requiresReactivation: true;
  requiresEmailVerification: true;
  maskedEmail: string | null;
  deletionScheduledFor: number;
  policyTextVersion: string;
  profile: Record<string, unknown>;
  isNewUser: false;
}

export type ResolveByPhoneResponse = ResolveByPhoneSuccessResponse | DeletionPendingResponse;

export function isDeletionPendingResponse(
  data: ResolveByPhoneResponse
): data is DeletionPendingResponse {
  return "status" in data && data.status === "deletion_pending";
}

export function deletionPendingToAppError(data: DeletionPendingResponse): AppError {
  const phoneE164 = String(data.profile.phoneE164 ?? "") as PhoneE164;
  return new AppError(
    "account_pending_deletion",
    "Account deletion is in progress. Reactivate your account with your registered business email, or wait for deletion to complete.",
    undefined,
    {
      phoneE164,
      deletionScheduledFor: data.deletionScheduledFor,
      deletionPolicyVersion: Number(data.profile.deletionPolicyVersion ?? 0) || null,
      maskedEmail: data.maskedEmail ?? "",
      requiresReactivation: true,
      requiresEmailVerification: data.requiresEmailVerification,
      policyTextVersion: data.policyTextVersion,
    }
  );
}

export function routeResolveByPhoneResponse(data: ResolveByPhoneResponse): ResolveByPhoneSuccessResponse {
  if (isDeletionPendingResponse(data)) {
    throw deletionPendingToAppError(data);
  }
  return data;
}

export interface PendingDeletionRouteParams {
  phoneE164: string;
  deletionScheduledFor: string;
  deletionPolicyVersion: string;
  maskedEmail: string;
}

export type AccountSetupFailureRoute =
  | { kind: "stale" }
  | { kind: "reactivation"; params: PendingDeletionRouteParams }
  | { kind: "display" };

/**
 * Initial OTP completion and authenticated account-setup retry share this path.
 * A superseded attempt does not navigate or publish.
 */
export function routeAccountSetupFailure(input: {
  error: unknown;
  stillCurrent: boolean;
  fallbackPhoneE164: string;
}): AccountSetupFailureRoute {
  if (!input.stillCurrent) return { kind: "stale" };
  if (!(input.error instanceof AppError) || input.error.code !== "account_pending_deletion") {
    return { kind: "display" };
  }
  const details = input.error.details ?? {};
  return {
    kind: "reactivation",
    params: {
      phoneE164: String(details.phoneE164 ?? input.fallbackPhoneE164),
      deletionScheduledFor: String(details.deletionScheduledFor ?? ""),
      deletionPolicyVersion: String(details.deletionPolicyVersion ?? ""),
      maskedEmail: String(details.maskedEmail ?? ""),
    },
  };
}

export type ReactivationPublicMessageId =
  | "reactivateExpired"
  | "reactivateAttempts"
  | "reactivateLatestCode"
  | "reactivateSendFailed"
  | "reactivateUnavailable";

/** Maps a server reactivation code to catalogue copy. Unknown codes stay with the caller. */
export function reactivationPublicMessageId(serverCode: string): ReactivationPublicMessageId | null {
  if (serverCode === "expired") return "reactivateExpired";
  if (serverCode === "attempts_exhausted" || serverCode === "rate_limited" || serverCode === "cooldown") {
    return "reactivateAttempts";
  }
  if (serverCode === "superseded") return "reactivateLatestCode";
  if (serverCode === "provider_unavailable") return "reactivateSendFailed";
  if (serverCode === "no_verified_email" || serverCode === "purge_underway" || serverCode === "ineligible") {
    return "reactivateUnavailable";
  }
  return null;
}
