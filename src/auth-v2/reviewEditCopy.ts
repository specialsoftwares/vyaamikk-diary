/**
 * Production-facing Review Edit copy and capability flags.
 * Keep free of harness / DEV / simulate language.
 */

import type { ReviewEditTarget } from "@/auth-v2/reviewEditIntent";

/**
 * Verified phone change is implemented for local-mock / shared-dev via
 * AuthService.startMobileChange / confirmMobileChange (UID + UEID preserved).
 * Production Firebase requires deployed server callable + native phone update —
 * UI still offers Change; firebase adapter fails safely until deploy.
 */
export const REVIEW_PHONE_CHANGE_AVAILABLE = true;

/** Verified email change reuses startBusinessEmailVerification / completeBusinessEmailBind. */
export const REVIEW_EMAIL_CHANGE_AVAILABLE = true;

export type ReviewEditCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryCta: string;
};

export function reviewEditCopy(target: ReviewEditTarget): ReviewEditCopy {
  switch (target) {
    case "identity":
      return {
        eyebrow: "Business identity",
        title: "Identity",
        subtitle:
          "These details identify the account owner and business or practice on your records.",
        primaryCta: "Save changes",
      };
    case "media":
      return {
        eyebrow: "Business identity",
        title: "Business / practice logo",
        subtitle:
          "Optional branding for supported records and documents. You can change or remove it later.",
        primaryCta: "Done",
      };
    case "contacts":
      return {
        eyebrow: "Business identity",
        title: "Verified contacts",
        subtitle:
          "Your mobile number and email are linked to your Vyaamikk identity. Any change must be verified before it can replace the current contact.",
        primaryCta: "Done",
      };
    case "location":
      return {
        eyebrow: "Business identity",
        title: "PIN / location",
        subtitle: "Enter your 6-digit PIN. We'll confirm the place.",
        primaryCta: "Continue",
      };
    case "gstin":
      return {
        eyebrow: "Business identity",
        title: "GSTIN",
        subtitle:
          "Optional. Enter a 15-character GSTIN where applicable. Vyaamikk checks format and checksum only — not government verification.",
        primaryCta: "Save changes",
      };
    case "constitution":
      return {
        eyebrow: "Business identity",
        title: "Business / practice type",
        subtitle:
          "Choose the legal or professional structure that best describes this account.",
        primaryCta: "Save changes",
      };
  }
}

/** Accurate logo usage — matches userPdfBranding / pdfComponents behavior. */
export const REVIEW_LOGO_USAGE_POINTS = [
  "Shown on supported records and documents when logo branding is enabled.",
  "Letterhead uses its own template branding — profile logo is not applied there.",
  "Does not change legal name, business name, or verified contacts.",
] as const;

export const REVIEW_CONTACTS_SECURITY_NOTE =
  "A new mobile number or email becomes active only after successful verification. Your current verified contact remains linked until then.";

/** Shared Review list section titles — must match editor titles. */
export const REVIEW_SECTION_TITLES = {
  identity: "Identity",
  media: "Business / practice logo",
  contacts: "Verified contacts",
  location: "PIN / location",
  gstin: "GSTIN",
  constitution: "Business / practice type",
} as const;

export const REVIEW_SECTION_ACTION_LABELS: Record<
  ReviewEditTarget,
  { action: string; accessibilityLabel: string }
> = {
  identity: { action: "Edit", accessibilityLabel: "Edit business identity" },
  media: { action: "Edit", accessibilityLabel: "Edit business logo" },
  contacts: { action: "Change", accessibilityLabel: "Change verified contacts" },
  location: { action: "Edit", accessibilityLabel: "Edit PIN and location" },
  gstin: { action: "Edit", accessibilityLabel: "Edit GSTIN" },
  constitution: { action: "Edit", accessibilityLabel: "Edit business or practice type" },
};
