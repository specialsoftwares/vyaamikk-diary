/**
 * Core domain types for Vyaamikk Diary.
 *
 * These mirror the Firestore document shapes and are also used by the
 * mock (dev) backend so the rest of the app is implementation-agnostic.
 */

import type { AccountStatus } from "./accountDeletion";
import type { LegalConsentRecord } from "./legalConsent";
import type { IdentityChangeHistoryEntry } from "./identityRegistry";
import type { ProfileChangeHistoryEntry } from "./profileUpdatePolicy";

import type { ProfileSalutationId } from "./profileSalutation";

export type UEID = string; // e.g. "VYD-2026-8K4P9X"
export type PhoneE164 = string; // e.g. "+919876543210"
export type LangCode = "en" | "hi";

/** Lifecycle of email trust for account recovery / security communication. */
export type EmailStatus = "unverified" | "verification_pending" | "verified";

/** Reverse index entry: email hash → owning account (server-authoritative in production). */
export interface EmailIndexEntry {
  emailHash: string;
  userId: string;
  ueid: UEID;
  status: AccountStatus;
  emailStatus: EmailStatus;
  linkedAt: number;
  verifiedAt: number | null;
}

/** Saved profile / company logo on device (Firebase-ready metadata shape). */
export interface ProfileLogoRef {
  /** Persistent file URI under app document storage. */
  localUri: string;
  mimeType: string;
  updatedAt: number;
}

/** Controls logo on exported PDFs (not letterhead template PDFs). */
export interface PdfBrandingSettings {
  /** When true, include profile/company logo in PDF headers where applicable. */
  includeProfileLogo: boolean;
}

export const DEFAULT_PDF_BRANDING: PdfBrandingSettings = {
  includeProfileLogo: true,
};

export interface UserProfile {
  uid: string;
  ueid: UEID;
  phoneE164: PhoneE164;
  /** Personal name. Required to unlock the dashboard. */
  displayName: string | null;
  /** Optional honorific (Mr, Shri, etc.) — shown before name in greeting. */
  salutation: ProfileSalutationId | null;
  /** Optional business / shop / entity name. */
  businessName: string | null;
  /** Optional free-text type of work (e.g. "Plastics manufacturing"). */
  workType: string | null;
  /** Role or title (e.g. "Proprietor", "Site Manager"). */
  designation: string | null;
  /** Business email shown on the digital visiting card back. */
  businessEmail: string | null;
  /** Canonical normalized form of `businessEmail` (lowercase trim). */
  normalizedEmail?: string | null;
  /** SHA-256 hex of `normalizedEmail` for emailBindings / emailIndex keys. */
  emailHash?: string | null;
  /** Trust level for recovery / security communication. */
  emailStatus?: EmailStatus;
  /** When email was first linked to this account. */
  emailLinkedAt?: number | null;
  /** When email was verified (null until verification succeeds). */
  emailVerifiedAt?: number | null;
  /** Server-authoritative binding generation (increments on email replace). */
  emailBindingVersion?: number | null;
  /** Server identity mutation clock. */
  identityUpdatedAt?: number | null;
  /** Active email-verification cycle lock (wrong OTP ×3). */
  emailVerificationLockUntil?: number | null;
  /** Automated / manual recovery in progress. */
  recoveryPending?: boolean;
  /** High-risk action cooling-off after recovery (server ms). */
  coolingOffUntil?: number | null;
  /** User-selected app language. UI mirrors this to local storage too. */
  language: LangCode | null;
  /**
   * Epoch millis when the user finished the Complete Profile step.
   *
   * `null` ⇒ user has not yet completed the profile. The router will keep
   * routing them back to /(auth)/complete-profile on every boot until they
   * either complete it or sign out.
   */
  profileCompletedAt: number | null;
  /**
   * When the user was shown their Vyaamikk ID after completing profile identity.
   * `null` until first release; returning users are back-filled from `profileCompletedAt`.
   */
  ueidReleasedAt: number | null;
  /** First-time benefit intro cards — once per user after UEID release. */
  onboardingIntroSeenAt: number | null;
  /** Personal photo or business logo for UI + optional PDF header. */
  profileLogo: ProfileLogoRef | null;
  pdfBranding: PdfBrandingSettings;
  /** Current sign-in (OTP success only). Never updated on app open or resume. */
  lastLoginAt: number | null;
  /** Prior sign-in before the current `lastLoginAt` (dashboard "Last login"). */
  previousLoginAt: number | null;
  /** Usage heartbeat (ms). Updated on OTP + optional activity touch — not "last login". */
  lastActiveAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** @deprecated Prefer `status` + `deletionCompletedAt` for deletion lifecycle. */
  deletedAt: number | null;
  status?: AccountStatus;
  /** SHA-like hash of normalized E.164 for registry audit (optional on legacy profiles). */
  mobileHash?: string | null;
  /** When the current mobile was last bound to this account. */
  mobileLinkedAt?: number | null;
  /** When mobile was last changed via OTP-verified flow. */
  mobileChangedAt?: number | null;
  mobileChangeCount?: number;
  identityChangeHistory?: IdentityChangeHistoryEntry[];
  deletionRequestedAt?: number | null;
  /** Epoch ms when pending deletion becomes final (request + grace period). */
  deletionScheduledFor?: number | null;
  deletionCompletedAt?: number | null;
  /** True once account deletion has retired this UEID (must not restore old data). */
  retiredUeid?: boolean;
  /** Settings edits to business / profession name after onboarding (max 2). */
  businessNameChangeCount?: number;
  /** Settings edits to business email after onboarding (max 2). */
  emailChangeCount?: number;
  /** Internal audit trail for support — not shown in UI. */
  profileChangeHistory?: ProfileChangeHistoryEntry[];
  lastProfileEditedAt?: number | null;
  /** Affirmative Terms / Privacy consent log (registration and re-consent). */
  legalConsents?: LegalConsentRecord[];
}

export type DiaryCategory =
  | "work"
  | "business"
  | "site"
  | "shop"
  | "factory"
  | "staff"
  | "issue"
  | "production"
  | "followup"
  | "personal"
  | "other";

/**
 * Foreground-captured GPS coordinates, opt-in per entry. We deliberately
 * do not store altitude/heading/speed — only what's useful for "where did
 * this happen". `accuracy` is meters as reported by expo-location.
 */
export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: number;
}

/**
 * User-set follow-up reminder for an entry. `notificationId` is the OS
 * scheduler handle returned by expo-notifications, retained so we can
 * cancel/reschedule if the entry is edited or soft-deleted.
 */
export interface EntryReminder {
  at: number;
  note: string;
  notificationId: string | null;
}

/** @deprecated Import from `@/domain/businessEntry` — alias preserved for migration. */
export type { BusinessEntry as DiaryEntry } from "./businessEntry";

