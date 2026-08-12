/**
 * Admin / support-facing mobile change entry (also used by Review contact_change).
 *
 * Production path (firebase-production + native linked):
 *   preflight callable → verifyPhoneNumber → updatePhoneNumber → confirm callable
 * Local-mock / shared-dev: AuthService.startMobileChange / confirmMobileChange
 * preserve UID + UEID via applyMockMobileChange / shared-dev transaction.
 *
 * Self-service is available from Review verified contacts (and later Settings).
 */

import { getAuthService } from "./index";

import type { OtpChallenge } from "./types";
import type { PhoneE164, UserProfile } from "@/domain/types";

export async function adminStartMobileChange(
  newPhoneE164: PhoneE164
): Promise<OtpChallenge> {
  return getAuthService().startMobileChange(newPhoneE164);
}

export async function adminConfirmMobileChange(
  currentUid: string,
  challenge: OtpChallenge,
  code: string
): Promise<UserProfile> {
  return getAuthService().confirmMobileChange(currentUid, challenge, code);
}
