/**
 * Phone-send provenance invariant
 * -------------------------------
 * The Firebase Phone Auth send argument must equal the phone the user confirmed
 * (and the active challenge phone on resend). Profile / session / native-auth
 * phone must never substitute at the send boundary.
 */

import { AppError } from "@/domain/errors";
import { normalizePhoneE164 } from "@/utils/mobileHash";
import { phonesMatchE164 } from "./phoneChallengeAuthInvariant";

export const PHONE_SEND_TARGET_MISMATCH = "PHONE_SEND_TARGET_MISMATCH";

export function phoneE164Suffix(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export type PhoneSendProvenanceInput = {
  /** Canonical E.164 from the confirmation UI (draft → toE164). */
  confirmedPhoneE164: string;
  /**
   * Optional React-state phone captured at Continue.
   * When present must match confirmedPhoneE164.
   */
  statePhoneE164?: string | null;
  /**
   * Optional profile / session phone — NEVER used as send target; when provided
   * and different from confirmed, send still proceeds with confirmed.
   */
  profilePhoneE164?: string | null;
  /** Optional prior challenge phone (must not win over confirmed on a fresh send). */
  priorChallengePhoneE164?: string | null;
};

export type PhoneSendProvenanceOk = {
  ok: true;
  firebaseSendPhoneE164: string;
  diagnostics: {
    confirmedPhoneSuffix: string | null;
    statePhoneSuffix: string | null;
    profilePhoneSuffix: string | null;
    priorChallengePhoneSuffix: string | null;
    firebaseSendPhoneSuffix: string | null;
  };
};

export type PhoneSendProvenanceFail = {
  ok: false;
  diagnosticCode: typeof PHONE_SEND_TARGET_MISMATCH;
  diagnostics: PhoneSendProvenanceOk["diagnostics"] & {
    reason: "invalid_confirmed" | "state_mismatch";
  };
};

export type PhoneSendProvenanceResult = PhoneSendProvenanceOk | PhoneSendProvenanceFail;

/**
 * Resolve the Firebase send target for a fresh OTP send.
 * Returns firebaseSendPhoneE164 = confirmed only when invariants hold.
 */
export function resolveFreshPhoneSendTarget(
  input: PhoneSendProvenanceInput
): PhoneSendProvenanceResult {
  let confirmed: string;
  try {
    confirmed = normalizePhoneE164(input.confirmedPhoneE164);
  } catch {
    return {
      ok: false,
      diagnosticCode: PHONE_SEND_TARGET_MISMATCH,
      diagnostics: {
        reason: "invalid_confirmed",
        confirmedPhoneSuffix: phoneE164Suffix(input.confirmedPhoneE164),
        statePhoneSuffix: phoneE164Suffix(input.statePhoneE164),
        profilePhoneSuffix: phoneE164Suffix(input.profilePhoneE164),
        priorChallengePhoneSuffix: phoneE164Suffix(input.priorChallengePhoneE164),
        firebaseSendPhoneSuffix: null,
      },
    };
  }

  if (
    input.statePhoneE164 != null &&
    String(input.statePhoneE164).trim() !== "" &&
    !phonesMatchE164(input.statePhoneE164, confirmed)
  ) {
    return {
      ok: false,
      diagnosticCode: PHONE_SEND_TARGET_MISMATCH,
      diagnostics: {
        reason: "state_mismatch",
        confirmedPhoneSuffix: phoneE164Suffix(confirmed),
        statePhoneSuffix: phoneE164Suffix(input.statePhoneE164),
        profilePhoneSuffix: phoneE164Suffix(input.profilePhoneE164),
        priorChallengePhoneSuffix: phoneE164Suffix(input.priorChallengePhoneE164),
        firebaseSendPhoneSuffix: null,
      },
    };
  }

  return {
    ok: true,
    firebaseSendPhoneE164: confirmed,
    diagnostics: {
      confirmedPhoneSuffix: phoneE164Suffix(confirmed),
      statePhoneSuffix: phoneE164Suffix(input.statePhoneE164),
      profilePhoneSuffix: phoneE164Suffix(input.profilePhoneE164),
      priorChallengePhoneSuffix: phoneE164Suffix(input.priorChallengePhoneE164),
      firebaseSendPhoneSuffix: phoneE164Suffix(confirmed),
    },
  };
}

/**
 * Resend must target the ACTIVE challenge phone only.
 */
export function resolveResendPhoneSendTarget(input: {
  activeChallengePhoneE164: string;
  statePhoneE164?: string | null;
}): PhoneSendProvenanceResult {
  let challengePhone: string;
  try {
    challengePhone = normalizePhoneE164(input.activeChallengePhoneE164);
  } catch {
    return {
      ok: false,
      diagnosticCode: PHONE_SEND_TARGET_MISMATCH,
      diagnostics: {
        reason: "invalid_confirmed",
        confirmedPhoneSuffix: phoneE164Suffix(input.activeChallengePhoneE164),
        statePhoneSuffix: phoneE164Suffix(input.statePhoneE164),
        profilePhoneSuffix: null,
        priorChallengePhoneSuffix: null,
        firebaseSendPhoneSuffix: null,
      },
    };
  }

  if (
    input.statePhoneE164 != null &&
    String(input.statePhoneE164).trim() !== "" &&
    !phonesMatchE164(input.statePhoneE164, challengePhone)
  ) {
    return {
      ok: false,
      diagnosticCode: PHONE_SEND_TARGET_MISMATCH,
      diagnostics: {
        reason: "state_mismatch",
        confirmedPhoneSuffix: phoneE164Suffix(challengePhone),
        statePhoneSuffix: phoneE164Suffix(input.statePhoneE164),
        profilePhoneSuffix: null,
        priorChallengePhoneSuffix: null,
        firebaseSendPhoneSuffix: null,
      },
    };
  }

  return {
    ok: true,
    firebaseSendPhoneE164: challengePhone,
    diagnostics: {
      confirmedPhoneSuffix: phoneE164Suffix(challengePhone),
      statePhoneSuffix: phoneE164Suffix(input.statePhoneE164),
      profilePhoneSuffix: null,
      priorChallengePhoneSuffix: null,
      firebaseSendPhoneSuffix: phoneE164Suffix(challengePhone),
    },
  };
}

export function assertPhoneSendProvenance(
  result: PhoneSendProvenanceResult
): asserts result is PhoneSendProvenanceOk {
  if (result.ok) return;
  throw new AppError(
    "auth_failed",
    "Could not send the verification code because the confirmed number did not match the send target. Go back and confirm your mobile number again.",
    undefined,
    {
      authPhase: "send",
      failureDomain: "auth",
      diagnosticCode: PHONE_SEND_TARGET_MISMATCH,
      confirmedPhoneSuffix: result.diagnostics.confirmedPhoneSuffix,
      statePhoneSuffix: result.diagnostics.statePhoneSuffix,
      profilePhoneSuffix: result.diagnostics.profilePhoneSuffix,
      priorChallengePhoneSuffix: result.diagnostics.priorChallengePhoneSuffix,
      reason: result.diagnostics.reason,
    }
  );
}
