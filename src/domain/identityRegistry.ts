/**
 * Canonical identity registry shapes (mobile/email indexes, audit trail).
 * Server/Firestore is authoritative in production; mock registry mirrors locally.
 */

import type { AccountStatus } from "./accountDeletion";
import type { EmailStatus } from "./types";
import type { PhoneE164, UEID } from "./types";

export type MobileIndexStatus = "active" | "released" | "pending_deletion" | "deleted";

export type MobileReleasedReason = "mobile_change" | "account_deletion";

export interface MobileIndexEntry {
  mobileHash: string;
  userId: string;
  ueid: UEID;
  status: MobileIndexStatus;
  linkedAt: number;
  releasedAt?: number | null;
  releasedReason?: MobileReleasedReason | null;
}

export type IdentityChangeAction =
  | "account_created"
  | "mobile_changed"
  | "email_verification_started"
  | "email_verified"
  | "email_changed";

export interface IdentityChangeHistoryEntry {
  at: number;
  action: IdentityChangeAction;
  /** Non-PII metadata only (e.g. releasedReason). */
  meta?: Record<string, string>;
}

export type PendingEmailVerificationStatus =
  | "pending"
  | "verified"
  | "expired"
  | "cancelled";

/** Short-lived pending email claim — not written to users until verified. */
export interface PendingEmailVerification {
  verificationId: string;
  userId: string;
  ueid: UEID;
  normalizedEmail: string;
  emailHash: string;
  otpOrTokenHash: string;
  expiresAt: number;
  attemptCount: number;
  status: PendingEmailVerificationStatus;
  createdAt: number;
}

export interface EmailIndexRecord {
  emailHash: string;
  userId: string;
  ueid: UEID;
  status: AccountStatus;
  emailStatus: Extract<EmailStatus, "verified">;
  linkedAt: number;
  releasedAt?: number | null;
}
