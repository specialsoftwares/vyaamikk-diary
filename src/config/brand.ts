/**
 * Central brand and legal-entity constants for Vyaamikk Diary.
 *
 * LEGAL_REVIEW_TODO: Product-protective boilerplate only. Have qualified counsel
 * review all user-facing legal copy and PDF footers before public launch. This
 * does not eliminate liability for the operator's own negligence, unlawful
 * conduct, data breaches, or statutory obligations.
 */

export const APP_BRAND_NAME = "Vyaamikk Diary";
export const PUBLIC_BRAND = "SPECIAL SOFTWARES";
export const LEGAL_OPERATOR =
  "Ananya Engineered Industrial Components & Pay Systems LLP";

/** Display line: "Vyaamikk Diary by SPECIAL SOFTWARES" */
export const APP_BRAND_LINE = `${APP_BRAND_NAME} by ${PUBLIC_BRAND}`;

/** Product attribution (About, Settings footer). */
export const DESIGNED_BY_LINE = `Designed and developed by ${PUBLIC_BRAND}.`;

/** Legal operator attribution (About, PDF metadata). */
export const LEGALLY_OPERATED_LINE = `Legally operated by ${LEGAL_OPERATOR}.`;

/** @deprecated Prefer LEGALLY_OPERATED_LINE — kept for PDF/legal compat. */
export const LEGAL_OPERATOR_LINE = `Operated by ${LEGAL_OPERATOR}`;
