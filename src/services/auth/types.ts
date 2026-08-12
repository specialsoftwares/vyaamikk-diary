import type { AccountDeletionResult } from "@/domain/accountDeletion";
import type { AccountStatus } from "@/domain/accountDeletion";
import type { ProfileChangeHistoryEntry } from "@/domain/profileUpdatePolicy";
import type { ProfileSalutationId } from "@/domain/profileSalutation";
import type { LegalConsentRecord } from "@/domain/legalConsent";
import type {
  LangCode,
  PdfBrandingSettings,
  PhoneE164,
  ProfileLogoRef,
  UserProfile,
} from "@/domain/types";

export interface OtpChallenge {
  verificationId: string;
  phoneE164: PhoneE164;
  /**
   * Must remain null on user-facing surfaces. Local-mock OTP is documented
   * for controlled testers only (`000000` under explicit env flag).
   */
  devCodeHint: string | null;
  /** Authoritative expiry (ms) when provided by adapter. */
  expiresAt?: number;
  /** Authoritative resend availability (ms). */
  resendAvailableAt?: number;
}

/**
 * Result of a successful OTP verification.
 *
 * `isNewUser` is true ONLY when this verification minted a brand-new UEID
 * for the phone number. Returning users (including re-installs on a new
 * device) get `false` so the welcome/intro UEID screen is skipped — the
 * dashboard becomes the immediate landing place.
 */
export interface AuthResult {
  profile: UserProfile;
  isNewUser: boolean;
}

/**
 * Patch shape accepted by `updateProfile`. Every field is optional;
 * `undefined` means "leave unchanged", `null` means "clear".
 */
export interface ProfilePatch {
  displayName?: string | null;
  businessName?: string | null;
  workType?: string | null;
  designation?: string | null;
  businessEmail?: string | null;
  normalizedEmail?: string | null;
  emailHash?: string | null;
  emailStatus?: import("@/domain/types").EmailStatus | null;
  emailLinkedAt?: number | null;
  emailVerifiedAt?: number | null;
  salutation?: ProfileSalutationId | null;
  language?: LangCode | null;
  /**
   * Pass `Date.now()` once the user finishes the Complete Profile step.
   * Setting this to a number unlocks the dashboard for the user.
   */
  profileCompletedAt?: number | null;
  ueidReleasedAt?: number | null;
  onboardingIntroSeenAt?: number | null;
  profileLogo?: ProfileLogoRef | null;
  pdfBranding?: PdfBrandingSettings;
  lastActiveAt?: number | null;
  status?: AccountStatus | null;
  mobileHash?: string | null;
  deletionRequestedAt?: number | null;
  deletionScheduledFor?: number | null;
  deletionCompletedAt?: number | null;
  retiredUeid?: boolean | null;
  businessNameChangeCount?: number;
    emailChangeCount?: number;
    mobileReviewChangeCount?: number;
    emailReviewChangeCount?: number;
  profileChangeHistory?: ProfileChangeHistoryEntry[];
  lastProfileEditedAt?: number | null;
  legalConsents?: LegalConsentRecord[];
  accountKind?: "individual" | "business" | null;
  pinCode?: string | null;
  pinLocality?: string | null;
  pinDistrict?: string | null;
  pinState?: string | null;
  gstin?: string | null;
  gstinVerificationState?:
    | "notProvided"
    | "formatInvalid"
    | "formatValid"
    | "verificationPending"
    | "officiallyVerified"
    | "verificationUnavailable"
    | "verificationFailed"
    | "identityMismatch"
    | null;
  issuerIdentitySnapshotId?: string | null;
  onboardingProfileVersion?: number | null;
}

export interface AuthService {
  startOtp(phoneE164: PhoneE164): Promise<OtpChallenge>;
  confirmOtp(challenge: OtpChallenge, code: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  /**
   * Permanently delete the account (not sign-out): purge local data, retire UEID,
   * and best-effort server erasure when a Firebase backend is active.
   */
  requestAccountDeletion(profile: UserProfile): Promise<AccountDeletionResult>;

  /** Cancel in-progress deletion during the grace period. */
  cancelAccountDeletion(profile: UserProfile): Promise<UserProfile>;

  /**
   * Update profile metadata (name, business, work type, language, profile
   * completion marker). Identity (uid, UEID, phoneE164) is NOT mutable here.
   * Mobile change is support/admin-only — see `adminMobileChange.ts`.
   */
  updateProfile(uid: string, patch: ProfilePatch): Promise<UserProfile>;

  /**
   * @internal Support/admin-only — not exposed in consumer app UI.
   * Begin OTP verification for a proposed new mobile (manual support flow).
   */
  startMobileChange(newPhoneE164: PhoneE164): Promise<OtpChallenge>;

  /**
   * @internal Support/admin-only — not exposed in consumer app UI.
   * Atomically swap linked mobile while preserving UEID (manual support flow).
   */
  confirmMobileChange(
    currentUid: string,
    challenge: OtpChallenge,
    code: string
  ): Promise<UserProfile>;
}
