/**
 * Authoritative onboarding profile identity model (Pass 2).
 */

import type { ProfileLogoRef } from "@/domain/types";
import type { OnboardingAccountKind } from "@/auth/onboardingWizard";

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
  | "ok";

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
    return { ok: false, blocker: "account_kind_missing", message: "Choose Individual or Business." };
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
  if (d.accountKind === "business" && !d.businessName.trim()) {
    return {
      ok: false,
      blocker: "business_name_required",
      message: "Enter the legal business name.",
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
  if (!d.profileLogo?.localUri || !d.logoPersisted) {
    return {
      ok: false,
      blocker: "logo_required",
      message:
        d.accountKind === "business"
          ? "Add a business logo before completing your profile."
          : "Add a profile image before completing your profile.",
    };
  }
  if (d.gstin.trim() && d.gstinVerificationState === "formatInvalid") {
    return {
      ok: false,
      blocker: "gstin_invalid",
      message: "Correct or remove the GSTIN before continuing.",
    };
  }
  return { ok: true };
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
  return {
    accountKind: d.accountKind,
    primaryName:
      d.accountKind === "business" ? d.businessName.trim() : d.displayName.trim(),
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
