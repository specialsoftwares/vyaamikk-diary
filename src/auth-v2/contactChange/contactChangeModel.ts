/**
 * Nested verified-contact change — purpose `contact_change`, not login/registration.
 * Pending values never become authoritative until verification + bind succeed.
 */

import { AppError } from "@/domain/errors";
import type { PhoneE164 } from "@/domain/types";
import { normalizePhoneE164 } from "@/utils/mobileHash";
import {
  isValidIndianLocalMobile,
  toE164FromDraft,
} from "@/auth-v2/phoneValidation";
import { DEFAULT_AUTH_V2_COUNTRY_CODE } from "@/auth-v2/types";
import { resolveContactVerificationState } from "@/auth-v2/reviewEditIntent";

export const CONTACT_CHANGE_PURPOSE = "contact_change" as const;

/** Privacy-safe collision copy — never reveal other account metadata. */
export const CONTACT_CHANGE_MOBILE_COLLISION_MESSAGE =
  "This mobile number cannot be used for this account. Please use another number or contact support.";

/** Same-number no-op — no SMS, no mutation. */
export const CONTACT_CHANGE_SAME_MOBILE_MESSAGE =
  "This is already your verified mobile number.";

/** Minimum verifying overlay so bind does not flash (contact-change path only). */
export const CONTACT_CHANGE_MIN_VERIFYING_VISIBLE_MS = 900;

export type ContactChangeChannel = "phone" | "email";

export type ContactChangePhase =
  | "overview"
  | "phone_entry"
  | "phone_otp"
  | "phone_verifying"
  | "phone_recovering"
  | "phone_verified"
  | "email_entry"
  | "email_otp"
  | "email_verifying"
  | "email_verified";

export function isContactChangeActive(phase: ContactChangePhase): boolean {
  return phase !== "overview";
}

/** Only one contact-change challenge may be active. */
export function assertSingleContactChange(active: ContactChangeChannel | null, next: ContactChangeChannel): void {
  if (active && active !== next) {
    throw new AppError(
      "permission_denied",
      "Finish or cancel the current contact change before starting another."
    );
  }
}

export function validateReplacementMobile(args: {
  localNumber: string;
  currentPhoneE164: string;
}): { ok: true; phoneE164: PhoneE164 } | { ok: false; message: string } {
  const local = args.localNumber.replace(/\D/g, "");
  if (!isValidIndianLocalMobile(local)) {
    return { ok: false, message: "Enter a valid 10-digit Indian mobile number." };
  }
  const phoneE164 = toE164FromDraft(DEFAULT_AUTH_V2_COUNTRY_CODE, local) as PhoneE164;
  if (normalizePhoneE164(phoneE164) === normalizePhoneE164(args.currentPhoneE164)) {
    return { ok: false, message: CONTACT_CHANGE_SAME_MOBILE_MESSAGE };
  }
  return { ok: true, phoneE164 };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateReplacementEmail(args: {
  email: string;
  currentEmail: string;
}): { ok: true; email: string } | { ok: false; message: string } {
  const email = args.email.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  if (email === args.currentEmail.trim().toLowerCase()) {
    return { ok: false, message: "Enter a different email than your current verified email." };
  }
  return { ok: true, email };
}

export function pendingMustNotLeak(args: {
  currentVerified: string;
  pendingInput: string;
  verificationSucceededFor: string | null;
}): string {
  return resolveContactVerificationState(args).authoritative;
}
