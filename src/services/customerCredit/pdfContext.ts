/**
 * Builds the HTML for a Customer Credit PDF variant from the current user +
 * record. Centralises shop-info assembly and (consent-independent) company-logo
 * reading so the screens don't duplicate it. Customer ID document images are
 * never read or embedded here.
 */

import type { CreditPaymentEntry, CustomerCreditRecord } from "@/domain/customerCredit";
import { creditDisplayStatus } from "@/domain/customerCredit";
import type { Lang } from "@/i18n/types";
import {
  buildCustomerCreditHtml,
  customerCreditPdfLabels,
  type CustomerCreditPdfVariant,
} from "@/services/pdf/customerCreditPdfService";
import { resolveGujaratiPdfExtraCss } from "@/services/pdf/resolveGujaratiPdfExtraCss";
import { readProfileLogoDataUri } from "@/services/profileLogo/storage";
import { readCustomerPhotoDataUri } from "@/services/customerCredit/customerPhotoService";

type TFn = (k: string, vars?: Record<string, string | number>) => string;

interface ShopProfile {
  businessName?: string | null;
  displayName?: string | null;
  designation?: string | null;
  gstin?: string | null;
  profileLogo?: Parameters<typeof readProfileLogoDataUri>[0] | null;
  pdfBranding?: { includeProfileLogo?: boolean } | null;
}

export interface BuildCreditPdfArgs {
  record: CustomerCreditRecord;
  variant: CustomerCreditPdfVariant;
  user: ShopProfile;
  t: TFn;
  locale: string;
  uiLang?: Lang;
  payment?: CreditPaymentEntry | null;
  useLogo?: boolean;
}

export async function buildCreditPdfHtml(args: BuildCreditPdfArgs): Promise<string> {
  const { record, variant, user, t, locale, uiLang, payment, useLogo } = args;

  let logoDataUri: string | null = null;
  const wantLogo = useLogo ?? user.pdfBranding?.includeProfileLogo !== false;
  if (wantLogo && user.profileLogo) {
    try {
      logoDataUri = await readProfileLogoDataUri(user.profileLogo);
    } catch {
      logoDataUri = null;
    }
  }

  const customerPhotoDataUri = await readCustomerPhotoDataUri(record.customerPhoto);
  const extraCss = await resolveGujaratiPdfExtraCss(uiLang);

  return buildCustomerCreditHtml({
    record,
    variant,
    locale,
    labels: customerCreditPdfLabels(t, uiLang),
    shop: {
      name: user.businessName || user.displayName || "",
      gstin: user.gstin ?? null,
      contact: null,
      address: null,
    },
    payment: payment ?? null,
    logoDataUri,
    customerPhotoDataUri,
    displayStatus: creditDisplayStatus(record),
    extraCss,
  });
}
