import type { UserProfile } from "@/domain/types";
import { readProfileLogoDataUri } from "@/services/profileLogo/storage";
import { formatDisplayPhone } from "@/utils/phone";
import { defaultPdfLegalFooterLabels, pdfLegalLabelsFromT, type PdfLegalFooterLabels } from "./pdfLegalFooter";
import { pdfUserProfileHeaderHtml, type PdfUserProfileLabels } from "./pdfLayout";

export interface UserPdfBranding {
  displayName: string;
  businessName: string | null;
  ueid: string;
  mobile: string | null;
  email: string | null;
  includeLogo: boolean;
  logoDataUri: string | null;
  legal: PdfLegalFooterLabels;
}

export type PdfBrandingContext = "default" | "letterhead";

/**
 * Shared PDF identity — logo only when enabled and resolvable.
 * Letterhead exports skip the profile logo (template already has branding).
 */
export async function getUserPdfBranding(
  user: UserProfile,
  options?: {
    context?: PdfBrandingContext;
    t?: (key: string, vars?: Record<string, string | number>) => string;
  }
): Promise<UserPdfBranding> {
  const context = options?.context ?? "default";
  const legal = options?.t ? pdfLegalLabelsFromT(options.t) : defaultPdfLegalFooterLabels();

  const includeLogo =
    context !== "letterhead" && (user.pdfBranding?.includeProfileLogo ?? true);

  let logoDataUri: string | null = null;
  if (includeLogo && user.profileLogo?.localUri) {
    logoDataUri = await readProfileLogoDataUri(user.profileLogo);
  }

  return {
    displayName: user.displayName?.trim() || "—",
    businessName: user.businessName?.trim() || null,
    ueid: user.ueid,
    mobile: user.phoneE164?.trim() ? formatDisplayPhone(user.phoneE164) : null,
    email: user.businessEmail?.trim() || null,
    includeLogo: includeLogo && Boolean(logoDataUri),
    logoDataUri,
    legal,
  };
}

/** @deprecated Use pdfUserProfileHeaderHtml from pdfLayout.ts */
export function pdfBrandingHeaderHtml(
  branding: UserPdfBranding,
  labels?: PdfUserProfileLabels
): string {
  return pdfUserProfileHeaderHtml(branding, labels);
}

export { pdfUserProfileHeaderHtml };
