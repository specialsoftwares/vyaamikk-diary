import { env } from "@/config/env";
import { LEGAL_OPERATOR, PUBLIC_BRAND } from "@/config/brand";
import { findPublicLinkBlockers } from "@/config/publicLinks";

/** Policy / terms version — bump when hosted documents change materially. */
export const LEGAL_CONSENT_VERSION = "1.0.0";
export const LEGAL_PRIVACY_VERSION = "1.0.0";
export const LEGAL_TERMS_VERSION = "1.0.0";

/** Publication date confirmed by the founder. */
export const LEGAL_EFFECTIVE_DATE = "2026-07-27";

/** Legal entity placeholders — counsel must confirm before store submission. */
export const LEGAL_ENTITY_NAME = LEGAL_OPERATOR;
export const LEGAL_ENTITY_ADDRESS =
  "841, Plot 35, Sector 6, Dwarka, New Delhi, Delhi - 110075, India";

/** Public website origin from env (production: https://vyaamikk.specialsoftwares.com). */
export const LEGAL_PUBLIC_WEBSITE = env.brand.websiteUrl;

export const LEGAL_GRIEVANCE_OFFICER = {
  name: "Shivam Saurav, Designated Partner",
  email: "grievance@specialsoftwares.in",
  address: LEGAL_ENTITY_ADDRESS,
} as const;

/**
 * Single source of truth for legal URLs, contact, and versioning.
 * URLs default via env (EXPO_PUBLIC_*); override at build time for production.
 * Runtime open/validation goes through `src/config/publicLinks.ts`.
 */
export const legal = {
  appName: env.brand.appName,
  brandName: PUBLIC_BRAND,
  legalEntityName: LEGAL_ENTITY_NAME,
  legalEntityAddress: LEGAL_ENTITY_ADDRESS,
  publicWebsite: LEGAL_PUBLIC_WEBSITE,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  consentVersion: LEGAL_CONSENT_VERSION,
  privacyVersion: LEGAL_PRIVACY_VERSION,
  termsVersion: LEGAL_TERMS_VERSION,
  privacyUrl: env.brand.privacyUrl,
  termsUrl: env.brand.termsUrl,
  /** Website home / legal hub (no combined `/legal` route on Lovable site). */
  legalHubUrl: env.brand.legalUrl,
  supportUrl: env.brand.supportUrl,
  contactUrl: env.brand.contactUrl,
  accountDeletionUrl: env.brand.accountDeletionUrl,
  downloadUrl: env.brand.installUrl,
  supportEmail: env.brand.supportEmail,
  grievanceOfficer: LEGAL_GRIEVANCE_OFFICER,
} as const;

export type LegalDocumentId = "privacy" | "terms";

export function legalDocumentTitle(id: LegalDocumentId): string {
  return id === "privacy" ? "Privacy Policy" : "Terms of Use";
}

/** Production builds must not ship with placeholder legal/contact values. */
export function findLegalConfigBlockers(): string[] {
  const blockers: string[] = [];
  blockers.push(...findPublicLinkBlockers());

  if (/\.example\b|example\.com/i.test(legal.supportEmail) || !legal.supportEmail.includes("@")) {
    blockers.push(`Placeholder or invalid support email: ${legal.supportEmail}`);
  }
  if (/^\[/.test(legal.grievanceOfficer.name)) {
    blockers.push("Grievance Officer name is still a placeholder");
  }
  if (/^\[/.test(legal.legalEntityAddress)) {
    blockers.push("Legal entity registered address is still a placeholder");
  }
  return blockers;
}
