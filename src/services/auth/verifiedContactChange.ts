/**
 * Account-level verified contact change (Review + future Settings).
 * Purpose: contact_change — never login / registration routing.
 *
 * Phone: AuthService.startMobileChange / confirmMobileChange (UID + UEID preserved).
 * Email: startBusinessEmailVerification / completeBusinessEmailBind.
 *
 * Production Firebase phone rebind requires native phone update + server callable
 * (see functions/src/identity/confirmVerifiedMobileChange.ts). Until that callable
 * is deployed, firebaseAuthService.confirmMobileChange remains blocked.
 */

import { AppError } from "@/domain/errors";
import type { PhoneE164, UserProfile } from "@/domain/types";
import { getActiveBackend } from "@/config/env";
import { getAuthService } from "@/services/auth";
import {
  completeBusinessEmailBind,
  resendBusinessEmailVerification,
  startBusinessEmailVerification,
} from "@/services/auth/bindBusinessEmail";
import type { OtpChallenge } from "@/services/auth/types";
import { CONTACT_CHANGE_PURPOSE } from "@/auth-v2/contactChange/contactChangeModel";

export function isVerifiedPhoneChangeSupportedInSource(): boolean {
  const backend = getActiveBackend();
  if (backend === "local-mock" || backend === "firebase-shared-dev") return true;
  if (backend === "firebase-production") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { isNativePhoneAuthAvailable } = require("./nativePhoneAuth") as {
        isNativePhoneAuthAvailable: () => boolean;
      };
      return isNativePhoneAuthAvailable();
    } catch {
      return false;
    }
  }
  return false;
}

export function isVerifiedEmailChangeSupportedInSource(): boolean {
  return true;
}

export async function startVerifiedPhoneChange(
  newPhoneE164: PhoneE164
): Promise<OtpChallenge> {
  void CONTACT_CHANGE_PURPOSE;
  return getAuthService().startMobileChange(newPhoneE164);
}

export async function confirmVerifiedPhoneChange(
  currentUid: string,
  challenge: OtpChallenge,
  code: string
): Promise<UserProfile> {
  const beforeBackend = getActiveBackend();
  const next = await getAuthService().confirmMobileChange(currentUid, challenge, code);
  if (next.uid !== currentUid) {
    throw new AppError(
      "auth_failed",
      "Mobile change could not preserve your account. No change was applied."
    );
  }
  void beforeBackend;
  return next;
}

export async function startVerifiedEmailChange(
  uid: string,
  email: string
): Promise<{
  verificationId: string;
  resendAvailableAt?: number;
  expiresAt?: number;
}> {
  return startBusinessEmailVerification(uid, email);
}

export async function resendVerifiedEmailChange(
  uid: string,
  challengeId: string,
  email: string
): Promise<{
  verificationId: string;
  resendAvailableAt?: number;
  expiresAt?: number;
}> {
  return resendBusinessEmailVerification(uid, challengeId, email);
}

export async function confirmVerifiedEmailChange(
  uid: string,
  verificationId: string,
  code: string,
  applyLocalProfile: (patch: Partial<UserProfile>) => Promise<UserProfile>
): Promise<UserProfile> {
  return completeBusinessEmailBind(uid, verificationId, code, applyLocalProfile);
}
