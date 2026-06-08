/**
 * @internal Admin / support-only mobile change APIs.
 *
 * Self-service mobile change is NOT exposed in the consumer app UI.
 * These helpers remain for manual support tooling, migration scripts, and tests.
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
