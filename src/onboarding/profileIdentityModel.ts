/**
 * Authoritative onboarding profile identity model (Pass 2).
 */

import type { ProfileLogoRef } from "@/domain/types";
import type { OnboardingAccountKind } from "@/auth/onboardingWizard";
import { isIndividualProfessionalPractice } from "@/onboarding/businessConstitution";

export type GstinVerificationState =
  | "notProvided"
  | "formatInvalid"
  | "formatValid"
  | "verificationPending"
  | "officiallyVerified"
  | "verificationUnavailable"
  | "verificationFailed"
  | "identityMismatch";

export interface ConfirmedPinLocation {
  pinCode: string;
  locality: string | null;
  district: string;
  state: string;
  country: string;
  confirmedAt: number;
  source: "offline" | "api" | "cache" | "manual";
}

export interface OnboardingProfileDraftV2 {
  schemaVersion: 2;
  uid: string;
  environment: string;
  accountKind: OnboardingAccountKind;
  displayName: string;
  businessName: string;
  constitution: string;
  gstin: string;
  gstinVerificationState: GstinVerificationState;
  pinCode: string;
  pinLocalityChoices: string[];
  selectedLocality: string | null;
  confirmedLocation: ConfirmedPinLocation | null;
  /** Durable stored logo ref after persist — never a transient picker URI alone. */
  profileLogo: ProfileLogoRef | null;
  /** Transient picker preview only (not sufficient for completion). */
  logoPreviewUri: string | null;
  logoPersisted: boolean;
  updatedAt: number;
}

export const ONBOARDING_DRAFT_SCHEMA_VERSION = 2 as const;

export interface DocumentFacingIdentity {
  accountKind: OnboardingAccountKind;
  /** Primary outward name (legal name for Individual; business name for Business). */
  primaryName: string;
  /** Account owner line for Business PDFs. */
  accountOwnerName: string | null;
  phoneE164: string;
  email: string;
  pinCode: string;
  locality: string | null;
  district: string;
  state: string;
  constitution: string | null;
  gstin: string | null;
  gstinVerificationState: GstinVerificationState;
  logo: ProfileLogoRef | null;
  snapshotVersion: number;
  createdAt: number;
}

export type ProfileCompletionBlocker =
  | "unauthenticated"
  | "email_unverified"
  | "account_kind_missing"
  | "display_name_required"
  | "business_name_required"
  | "pin_required"
  | "pin_confirmation_required"
  | "pin_mismatch"
  | "logo_required"
  | "logo_not_persisted"
  | "gstin_invalid"
  | "constitution_required"
  | "ok";

/** Identity substep — name/kind only. Profile image is optional. */
export function isIdentityDetailsContinueEnabled(input: {
  displayName: string;
  accountKind: OnboardingAccountKind | string;
  businessName: string;
  constitution?: string;
  gstin?: string;
  gstinVerificationState?: GstinVerificationState;
  submitting?: boolean;
}): boolean {
  if (input.submitting) return false;
  if (!input.displayName.trim()) return false;
  if (input.accountKind === "business") {
    if (!(input.constitution ?? "").trim()) return false;
    const professional = isIndividualProfessionalPractice(input.constitution ?? "");
    if (!professional && !input.businessName.trim()) return false;
    if ((input.gstin ?? "").trim() && input.gstinVerificationState === "formatInvalid") {
      return false;
    }
  }
  return true;
}

/**
 * Save & continue must stay disabled while PIN lookup/confirmation is incomplete
 * or media persistence is in flight — never only fail after tap.
 */
export function isIdentityContinueEnabled(input: {
  submitting: boolean;
  mediaBusy: boolean;
  pinStatus:
    | "idle"
    | "invalid_format"
    | "looking_up"
    | "choices"
    | "ready_to_confirm"
    | "not_found"
    | "unavailable"
    | "confirmed";
  confirmedLocation: ConfirmedPinLocation | null;
  pinCode: string;
}): boolean {
  if (input.submitting || input.mediaBusy) return false;
  if (input.pinStatus === "looking_up") return false;
  if (!input.confirmedLocation) return false;
  if (input.confirmedLocation.pinCode !== input.pinCode) return false;
  return true;
}

export function validateOnboardingDraftForCompletion(input: {
  signedIn: boolean;
  emailVerified: boolean;
  phoneE164: string;
  email: string;
  draft: OnboardingProfileDraftV2;
}): { ok: true } | { ok: false; blocker: ProfileCompletionBlocker; message: string } {
  if (!input.signedIn) {
    return { ok: false, blocker: "unauthenticated", message: "Sign in again to continue." };
  }
  if (!input.emailVerified) {
    return {
      ok: false,
      blocker: "email_unverified",
      message: "Verify your email before completing your profile.",
    };
  }
  const d = input.draft;
  if (!d.accountKind) {
    return { ok: false, blocker: "account_kind_missing", message: "Business profile is required." };
  }
  if (!d.displayName.trim()) {
    return {
      ok: false,
      blocker: "display_name_required",
      message:
        d.accountKind === "business"
          ? "Enter the account owner's full legal name."
          : "Enter your full legal name.",
    };
  }
  if (d.accountKind === "business" && !d.constitution.trim()) {
    return {
      ok: false,
      blocker: "constitution_required",
      message: "Select the business / practice type.",
    };
  }
  if (
    d.accountKind === "business" &&
    !isIndividualProfessionalPractice(d.constitution) &&
    !d.businessName.trim()
  ) {
    return {
      ok: false,
      blocker: "business_name_required",
      message: "Enter the business / firm / practice name.",
    };
  }
  if (!/^[1-9]\d{5}$/.test(d.pinCode)) {
    return { ok: false, blocker: "pin_required", message: "Enter a valid 6-digit PIN code." };
  }
  if (!d.confirmedLocation) {
    return {
      ok: false,
      blocker: "pin_confirmation_required",
      message: "Confirm the city, district, and state for your PIN.",
    };
  }
  if (d.confirmedLocation.pinCode !== d.pinCode) {
    return {
      ok: false,
      blocker: "pin_mismatch",
      message: "PIN changed after confirmation. Confirm the location again.",
    };
  }
  // Profile image / logo is optional for V1 onboarding completion.
  if (d.gstin.trim() && d.gstinVerificationState === "formatInvalid") {
    return {
      ok: false,
      blocker: "gstin_invalid",
      message: "Correct or remove the GSTIN before continuing.",
    };
  }
  return { ok: true };
}

/** Persist explicit practice/firm name; sole practice may reuse legal name — never invent a firm. */
export function resolvePersistedBusinessName(
  draft: Pick<OnboardingProfileDraftV2, "accountKind" | "businessName" | "constitution" | "displayName">
): string | null {
  if (draft.accountKind !== "business") return null;
  const explicit = draft.businessName.trim();
  if (explicit) return explicit;
  if (isIndividualProfessionalPractice(draft.constitution)) {
    return draft.displayName.trim() || null;
  }
  return null;
}

export function buildDocumentFacingIdentity(input: {
  draft: OnboardingProfileDraftV2;
  phoneE164: string;
  email: string;
  snapshotVersion: number;
  now?: number;
}): DocumentFacingIdentity {
  const d = input.draft;
  const loc = d.confirmedLocation!;
  const professional =
    d.accountKind === "business" && isIndividualProfessionalPractice(d.constitution);
  const practiceFacingName =
    d.businessName.trim() || (professional ? d.displayName.trim() : "");
  return {
    accountKind: d.accountKind,
    primaryName:
      d.accountKind === "business" ? practiceFacingName : d.displayName.trim(),
    accountOwnerName: d.accountKind === "business" ? d.displayName.trim() : null,
    phoneE164: input.phoneE164,
    email: input.email,
    pinCode: loc.pinCode,
    locality: loc.locality,
    district: loc.district,
    state: loc.state,
    constitution: d.constitution.trim() || null,
    gstin: d.gstin.trim() || null,
    gstinVerificationState: d.gstin.trim() ? d.gstinVerificationState : "notProvided",
    logo: d.profileLogo,
    snapshotVersion: input.snapshotVersion,
    createdAt: input.now ?? Date.now(),
  };
}
