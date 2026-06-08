import type { PhoneE164, UserProfile } from "@/domain/types";
import type { OtpChallenge } from "@/services/auth/types";
import { getAuthService } from "@/services/auth";
import { toAppError } from "@/domain/errors";

/**
 * Thin adapter over the existing auth service — no duplicate UEID or OTP logic.
 */
export async function sendOtpForWrapper(phoneE164: PhoneE164): Promise<OtpChallenge> {
  try {
    return await getAuthService().startOtp(phoneE164);
  } catch (e) {
    throw toAppError(e);
  }
}

export async function verifyOtpForWrapper(
  challenge: OtpChallenge,
  code: string
): Promise<{ profile: UserProfile; isNewUser: boolean }> {
  try {
    return await getAuthService().confirmOtp(challenge, code);
  } catch (e) {
    throw toAppError(e);
  }
}
