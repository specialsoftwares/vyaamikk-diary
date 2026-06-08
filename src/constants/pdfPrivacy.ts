/**
 * PDF privacy & trust — shared policy constants.
 *
 * Wording is honest: we do not automatically read/review PDFs on device;
 * we do not claim “cannot access” unless zero-knowledge encryption is implemented.
 */

import { PUBLIC_BRAND, LEGAL_OPERATOR } from "@/config/brand";

/** Feature flag — cloud PDF backup is not implemented in V1. */
export const PDF_CLOUD_BACKUP_ENABLED = false;

export const PDF_STORAGE_MODE = {
  LOCAL_ONLY: "local_only",
  CLOUD_BACKED: "cloud_backed",
  CLOUD_ENCRYPTED: "cloud_encrypted",
} as const;

export type PdfStorageMode = (typeof PDF_STORAGE_MODE)[keyof typeof PDF_STORAGE_MODE];

/** Default: PDF files stay on device; only metadata may sync. */
export const PDF_DEFAULT_STORAGE_MODE: PdfStorageMode = PDF_STORAGE_MODE.LOCAL_ONLY;

/** Operator names used in privacy copy (keep in sync with i18n). */
export const PDF_PRIVACY_OPERATOR = {
  brand: PUBLIC_BRAND,
  legalOperator: LEGAL_OPERATOR,
} as const;

/**
 * i18n key paths — single source for PDF privacy strings in UI and legal screens.
 */
export const PDF_PRIVACY_COPY_KEYS = {
  screenTitle: "pdfPrivacy.title",
  trustLead: "pdfPrivacy.trustLead",
  localFirstTitle: "pdfPrivacy.localFirstTitle",
  localFirstBody: "pdfPrivacy.localFirstBody",
  noAutoUploadTitle: "pdfPrivacy.noAutoUploadTitle",
  noAutoUploadBody: "pdfPrivacy.noAutoUploadBody",
  metadataTitle: "pdfPrivacy.metadataTitle",
  metadataBody: "pdfPrivacy.metadataBody",
  noReviewTitle: "pdfPrivacy.noReviewTitle",
  noReviewBody: "pdfPrivacy.noReviewBody",
  shareTitle: "pdfPrivacy.shareTitle",
  shareBody: "pdfPrivacy.shareBody",
  syncTitle: "pdfPrivacy.syncTitle",
  syncBody: "pdfPrivacy.syncBody",
  accessTitle: "pdfPrivacy.accessTitle",
  accessBody: "pdfPrivacy.accessBody",
  deletionTitle: "pdfPrivacy.deletionTitle",
  deletionBody: "pdfPrivacy.deletionBody",
  cloudBackupLabel: "pdfPrivacy.cloudBackupLabel",
  cloudBackupComingSoon: "pdfPrivacy.cloudBackupComingSoon",
  cloudBackupHint: "pdfPrivacy.cloudBackupHint",
  storageModesTitle: "pdfPrivacy.storageModesTitle",
  storageLocalOnly: "pdfPrivacy.storageLocalOnly",
  storageCloudBacked: "pdfPrivacy.storageCloudBacked",
  storageCloudEncrypted: "pdfPrivacy.storageCloudEncrypted",
} as const;
