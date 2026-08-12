/**
 * Phone Auth identity binding
 * ---------------------------
 * For resolveOrCreateUserByPhone / claimMobile, the phone used to create or
 * resolve a Vyaamikk identity MUST be the phone verified by Firebase Auth for
 * request.auth.
 *
 * Client phoneE164 is a consistency assertion only. The server source of truth
 * is request.auth.token.phone_number (DecodedIdToken), after the same
 * canonical E.164 normalisation as client input.
 *
 * Do NOT fall back to client phone when the claim is missing.
 */

import { HttpsError } from "firebase-functions/v2/https";

import { normalizePhoneE164 } from "./shared";

export const AUTH_PHONE_MISMATCH = "AUTH_PHONE_MISMATCH" as const;
export const AUTH_PHONE_CLAIM_MISSING = "AUTH_PHONE_CLAIM_MISSING" as const;

/** Canonical E.164 for identity comparison (digit-stable, India-aware via normalize). */
export function canonicalizePhoneE164(phone: string): string {
  const normalized = normalizePhoneE164(phone);
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    throw new TypeError("phone E.164 length invalid");
  }
  const e164 = `+${digits}`;
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
    throw new TypeError("phone E.164 format invalid");
  }
  return e164;
}

export type PhoneAuthBindingInput = {
  authUid: string | null | undefined;
  /** request.auth.token.phone_number */
  tokenPhoneNumber: unknown;
  /** request.data.phoneE164 — consistency assertion, not ownership proof */
  clientPhoneE164: unknown;
};

export type PhoneAuthBindingResult = {
  authUid: string;
  /** Authoritative phone for all identity mutations (from Firebase Auth claim). */
  phoneE164: string;
};

/**
 * Resolve the authoritative phone for Phone Auth identity callables.
 * Throws HttpsError before any Firestore identity mutation should begin.
 */
export function resolveAuthoritativePhoneAuthIdentity(
  input: PhoneAuthBindingInput
): PhoneAuthBindingResult {
  const authUid = typeof input.authUid === "string" ? input.authUid.trim() : "";
  if (!authUid) {
    throw new HttpsError("unauthenticated", "Sign in with phone OTP first.");
  }

  if (typeof input.tokenPhoneNumber !== "string" || !input.tokenPhoneNumber.trim()) {
    throw new HttpsError(
      "failed-precondition",
      "Phone authentication is required to continue.",
      { diagnosticCode: AUTH_PHONE_CLAIM_MISSING }
    );
  }

  if (typeof input.clientPhoneE164 !== "string" || !input.clientPhoneE164.trim()) {
    throw new HttpsError("invalid-argument", "phoneE164 is required.");
  }

  let authenticatedPhone: string;
  try {
    authenticatedPhone = canonicalizePhoneE164(input.tokenPhoneNumber);
  } catch {
    throw new HttpsError(
      "failed-precondition",
      "Phone authentication is required to continue.",
      { diagnosticCode: AUTH_PHONE_CLAIM_MISSING }
    );
  }

  let requestedPhone: string;
  try {
    requestedPhone = canonicalizePhoneE164(input.clientPhoneE164);
  } catch {
    throw new HttpsError("invalid-argument", "phoneE164 is invalid.");
  }

  if (authenticatedPhone !== requestedPhone) {
    throw new HttpsError(
      "permission-denied",
      "This sign-in does not match the mobile number being used. Sign out and try again.",
      { diagnosticCode: AUTH_PHONE_MISMATCH }
    );
  }

  // Derive identity phone from the authenticated claim (not client trust).
  return { authUid, phoneE164: authenticatedPhone };
}

/** Safe metadata for diagnostics — never includes full phone/token. */
export function phoneAuthBindingSafeMeta(input: {
  authUid: string | null | undefined;
  tokenPhoneNumber: unknown;
}): {
  authUidPresent: boolean;
  tokenPhonePresent: boolean;
  tokenPhoneSuffix: string | null;
} {
  const authUidPresent = typeof input.authUid === "string" && input.authUid.length > 0;
  let tokenPhonePresent = false;
  let tokenPhoneSuffix: string | null = null;
  if (typeof input.tokenPhoneNumber === "string" && input.tokenPhoneNumber.trim()) {
    try {
      const phone = canonicalizePhoneE164(input.tokenPhoneNumber);
      tokenPhonePresent = true;
      tokenPhoneSuffix = phone.slice(-4);
    } catch {
      tokenPhonePresent = false;
      tokenPhoneSuffix = null;
    }
  }
  return { authUidPresent, tokenPhonePresent, tokenPhoneSuffix };
}
