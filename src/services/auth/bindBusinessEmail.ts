/**
 * Production business-email binding via Cloud Functions (Admin SDK).
 *
 * Clients collect and normalize email for UX; authoritative hash, index claim,
 * and verified timestamps are written only by `verifyAndBindEmail`.
 */

import { AppError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";
import { normalizeEmail } from "@/utils/emailHash";

import {
  callStartEmailVerification,
  callVerifyAndBindEmail,
  useIdentityCallables,
} from "./identityCallable";

export function requiresServerEmailBinding(): boolean {
  return useIdentityCallables();
}

export async function startBusinessEmailVerification(
  rawEmail: string
): Promise<{ verificationId: string }> {
  const normalized = normalizeEmail(rawEmail);
  if (!normalized.includes("@")) {
    throw new AppError("save_failed", "A valid email address is required.");
  }
  const result = await callStartEmailVerification(normalized);
  if (!result.verificationId) {
    throw new AppError(
      "unknown",
      result.message ?? "Could not start email verification. Please try again."
    );
  }
  return { verificationId: result.verificationId };
}

export async function completeBusinessEmailBind(
  verificationId: string,
  code: string
): Promise<UserProfile> {
  return callVerifyAndBindEmail(verificationId, code);
}
