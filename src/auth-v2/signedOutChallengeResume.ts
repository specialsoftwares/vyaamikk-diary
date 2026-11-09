import type { AuthWrapperChallengeSnapshot } from "@/auth-v2/authWrapperProgress";
import type { AuthChallengeIdentity } from "@/services/auth/authChallengePersistence";
import type { MobileOtpDigitSnapshot } from "@/services/auth/mobileOtpSecureDigits";
import {
  loadNativePhoneAuthSession,
  type NativePhoneAuthPersistedSession,
} from "@/services/auth/nativePhoneAuthSession";
import { phonesMatchE164 } from "@/services/auth/phoneChallengeAuthInvariant";

export type SignedOutPhoneChallengeResume =
  | {
      action: "resume";
      phoneE164: string;
      verificationId: string;
      devCodeHint: string | null;
      resendAvailableAt: number | null;
      /** Native-session expiry. Reopening must not move this timestamp. */
      expiresAt: number;
    }
  | { action: "phone" }
  | { action: "stale" };

type WrapperSnapshot = Pick<AuthWrapperChallengeSnapshot, "phoneE164" | "verificationId" | "devCodeHint">;

type ResumeDependencies = {
  isCurrent?: () => boolean;
  loadWrapper?: () => Promise<WrapperSnapshot | null>;
  loadNative?: () => Promise<NativePhoneAuthPersistedSession | null>;
  loadDigits?: () => Promise<MobileOtpDigitSnapshot | null>;
  clearWrapper?: (expected: AuthChallengeIdentity, isCurrent: () => boolean) => Promise<void>;
};

function sameIdentity(left: AuthChallengeIdentity, right: AuthChallengeIdentity): boolean {
  return left.phoneE164 === right.phoneE164 && left.verificationId === right.verificationId;
}

async function loadWrapperDefault(): Promise<WrapperSnapshot | null> {
  const { loadAuthWrapperChallenge } = await import("@/auth-v2/authWrapperProgress");
  return loadAuthWrapperChallenge();
}

async function loadDigitsDefault(): Promise<MobileOtpDigitSnapshot | null> {
  const { loadMobileOtpDigitSnapshot } = await import("@/services/auth/mobileOtpSecureDigits");
  return loadMobileOtpDigitSnapshot();
}

async function clearWrapperDefault(
  expected: AuthChallengeIdentity,
  isCurrent: () => boolean
): Promise<void> {
  const { clearAuthWrapperChallenge } = await import("@/auth-v2/authWrapperProgress");
  await clearAuthWrapperChallenge(expected, isCurrent);
}

function inspectedIdentity(wrapper: WrapperSnapshot): AuthChallengeIdentity {
  return { phoneE164: wrapper.phoneE164, verificationId: wrapper.verificationId };
}

/**
 * Signed-out launch decision. A saved wrapper opens the OTP screen only while
 * the native-session loader still returns that verification and phone.
 * This function never requests an SMS.
 */
export async function resumeSignedOutPhoneChallenge(
  input: ResumeDependencies = {}
): Promise<SignedOutPhoneChallengeResume> {
  const isCurrent = input.isCurrent ?? (() => true);
  const loadWrapper = input.loadWrapper ?? loadWrapperDefault;
  const loadNative = input.loadNative ?? loadNativePhoneAuthSession;
  const loadDigits = input.loadDigits ?? loadDigitsDefault;
  const clearWrapper = input.clearWrapper ?? clearWrapperDefault;

  if (!isCurrent()) return { action: "stale" };
  const wrapper = await loadWrapper();
  if (!isCurrent()) return { action: "stale" };
  if (!wrapper) return { action: "phone" };

  const native = await loadNative();
  if (!isCurrent()) return { action: "stale" };
  const inspected = inspectedIdentity(wrapper);
  const matches =
    native != null &&
    native.firebaseVerificationId === wrapper.verificationId &&
    phonesMatchE164(native.phoneE164, wrapper.phoneE164);

  if (!matches) {
    const latest = await loadWrapper();
    if (!isCurrent() || !latest || !sameIdentity(inspectedIdentity(latest), inspected)) {
      return { action: "stale" };
    }
    await clearWrapper(inspected, isCurrent);
    if (!isCurrent()) return { action: "stale" };
    return { action: "phone" };
  }

  const beforeDigits = await loadWrapper();
  if (!isCurrent() || !beforeDigits || !sameIdentity(inspectedIdentity(beforeDigits), inspected)) {
    return { action: "stale" };
  }
  const digits = await loadDigits();
  if (!isCurrent()) return { action: "stale" };
  const afterDigits = await loadWrapper();
  if (!isCurrent() || !afterDigits || !sameIdentity(inspectedIdentity(afterDigits), inspected)) {
    return { action: "stale" };
  }
  const resendAvailableAt =
    digits &&
    digits.verificationId === wrapper.verificationId &&
    phonesMatchE164(digits.phoneE164, wrapper.phoneE164) &&
    Number.isFinite(digits.resendAvailableAt)
      ? digits.resendAvailableAt
      : null;
  return {
    action: "resume",
    phoneE164: wrapper.phoneE164,
    verificationId: wrapper.verificationId,
    devCodeHint: wrapper.devCodeHint ?? null,
    resendAvailableAt,
    expiresAt: native.expiresAt,
  };
}
