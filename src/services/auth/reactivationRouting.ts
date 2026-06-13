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
