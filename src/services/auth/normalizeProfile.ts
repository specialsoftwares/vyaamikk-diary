import type { LegalConsentRecord } from "@/domain/legalConsent";
import {
  DEFAULT_PDF_BRANDING,
  type EmailStatus,
  type PdfBrandingSettings,
  type ProfileLogoRef,
  type UserProfile,
} from "@/domain/types";
import type { ProfilePatch } from "./types";
import { normaliseProfileSalutation } from "@/domain/profileSalutation";
import { hashEmail, normalizeEmail } from "@/utils/emailHash";

function normaliseLogo(raw: unknown): ProfileLogoRef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.localUri !== "string" || !o.localUri.trim()) return null;
  return {
    localUri: o.localUri.trim(),
    mimeType: typeof o.mimeType === "string" ? o.mimeType : "image/jpeg",
    updatedAt: Number(o.updatedAt ?? Date.now()),
  };
}

function normalisePdfBranding(raw: unknown): PdfBrandingSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PDF_BRANDING };
  const o = raw as Record<string, unknown>;
  return {
    includeProfileLogo:
      o.includeProfileLogo === false ? false : DEFAULT_PDF_BRANDING.includeProfileLogo,
  };
}

/** Normalise Firestore / mock profile documents with safe defaults. */
export function normaliseUserProfile(
  uid: string,
  raw: Record<string, unknown>
): UserProfile {
  return {
    uid,
    ueid: String(raw.ueid ?? ""),
    phoneE164: String(raw.phoneE164 ?? ""),
    displayName: typeof raw.displayName === "string" ? raw.displayName : null,
    salutation: normaliseProfileSalutation(raw.salutation),
    businessName: typeof raw.businessName === "string" ? raw.businessName : null,
    workType: typeof raw.workType === "string" ? raw.workType : null,
    designation: typeof raw.designation === "string" ? raw.designation : null,
    businessEmail: typeof raw.businessEmail === "string" ? raw.businessEmail : null,
    normalizedEmail:
      typeof raw.normalizedEmail === "string"
        ? raw.normalizedEmail
        : typeof raw.businessEmail === "string"
          ? normalizeEmail(raw.businessEmail)
          : null,
    emailHash:
      typeof raw.emailHash === "string"
        ? raw.emailHash
        : typeof raw.businessEmail === "string" && raw.businessEmail.trim()
          ? hashEmail(normalizeEmail(raw.businessEmail))
          : null,
    emailStatus:
      raw.emailStatus === "unverified" ||
      raw.emailStatus === "verification_pending" ||
      raw.emailStatus === "verified"
        ? raw.emailStatus
        : raw.businessEmail
          ? ("unverified" as EmailStatus)
          : undefined,
    emailLinkedAt: raw.emailLinkedAt == null ? null : Number(raw.emailLinkedAt),
    emailVerifiedAt: raw.emailVerifiedAt == null ? null : Number(raw.emailVerifiedAt),
    emailBindingVersion:
      raw.emailBindingVersion == null ? null : Number(raw.emailBindingVersion),
    identityUpdatedAt:
      raw.identityUpdatedAt == null ? null : Number(raw.identityUpdatedAt),
    emailVerificationLockUntil:
      raw.emailVerificationLockUntil == null
        ? null
        : Number(raw.emailVerificationLockUntil),
    recoveryPending: raw.recoveryPending === true,
    coolingOffUntil: raw.coolingOffUntil == null ? null : Number(raw.coolingOffUntil),
    mobileHash: typeof raw.mobileHash === "string" ? raw.mobileHash : null,
    language: raw.language === "en" || raw.language === "hi" ? raw.language : null,
    profileCompletedAt:
      raw.profileCompletedAt == null ? null : Number(raw.profileCompletedAt),
    ueidReleasedAt:
      raw.ueidReleasedAt == null
        ? raw.profileCompletedAt == null
          ? null
          : Number(raw.profileCompletedAt)
        : Number(raw.ueidReleasedAt),
    onboardingIntroSeenAt:
      raw.onboardingIntroSeenAt == null
        ? raw.profileCompletedAt == null
          ? null
          : Number(raw.profileCompletedAt)
        : Number(raw.onboardingIntroSeenAt),
    profileLogo: normaliseLogo(raw.profileLogo),
    pdfBranding: normalisePdfBranding(raw.pdfBranding),
    lastLoginAt: raw.lastLoginAt == null ? null : Number(raw.lastLoginAt),
    previousLoginAt:
      raw.previousLoginAt == null ? null : Number(raw.previousLoginAt),
    lastActiveAt: raw.lastActiveAt == null ? null : Number(raw.lastActiveAt),
    createdAt: Number(raw.createdAt ?? Date.now()),
    updatedAt: Number(raw.updatedAt ?? Date.now()),
    deletedAt: raw.deletedAt == null ? null : Number(raw.deletedAt),
    status:
      raw.status === "active" ||
      raw.status === "pending_deletion" ||
      raw.status === "deleted"
        ? raw.status
        : raw.deletedAt != null
          ? "deleted"
          : "active",
    deletionRequestedAt:
      raw.deletionRequestedAt == null ? null : Number(raw.deletionRequestedAt),
    deletionScheduledFor:
      raw.deletionScheduledFor == null ? null : Number(raw.deletionScheduledFor),
    deletionCompletedAt:
      raw.deletionCompletedAt == null ? null : Number(raw.deletionCompletedAt),
    retiredUeid: raw.retiredUeid === true,
    businessNameChangeCount:
      typeof raw.businessNameChangeCount === "number"
        ? Math.max(0, Math.floor(raw.businessNameChangeCount))
        : 0,
    emailChangeCount:
      typeof raw.emailChangeCount === "number"
        ? Math.max(0, Math.floor(raw.emailChangeCount))
        : 0,
    profileChangeHistory: Array.isArray(raw.profileChangeHistory)
      ? (raw.profileChangeHistory as UserProfile["profileChangeHistory"])
      : [],
    lastProfileEditedAt:
      raw.lastProfileEditedAt == null ? null : Number(raw.lastProfileEditedAt),
    legalConsents: Array.isArray(raw.legalConsents)
      ? (raw.legalConsents as LegalConsentRecord[])
      : [],
  };
}

/** Merge profile patch from settings / identity screen. Skips `updatedAt` when nothing changes. */
export function applyProfilePatch(user: UserProfile, patch: ProfilePatch): UserProfile {
  const next: UserProfile = { ...user };
  let changed = false;

  if (patch.displayName !== undefined) {
    const v = patch.displayName?.trim() ? patch.displayName.trim() : null;
    if (v !== user.displayName) {
      next.displayName = v;
      changed = true;
    }
  }
  if (patch.salutation !== undefined && patch.salutation !== user.salutation) {
    next.salutation = patch.salutation ?? null;
    changed = true;
  }
  if (patch.businessName !== undefined) {
    const v = patch.businessName?.trim() ? patch.businessName.trim() : null;
    if (v !== user.businessName) {
      next.businessName = v;
      changed = true;
    }
  }
  if (patch.workType !== undefined) {
    const v = patch.workType?.trim() ? patch.workType.trim() : null;
    if (v !== user.workType) {
      next.workType = v;
      changed = true;
    }
  }
  if (patch.designation !== undefined) {
    const v = patch.designation?.trim() ? patch.designation.trim() : null;
    if (v !== user.designation) {
      next.designation = v;
      changed = true;
    }
  }
  if (patch.businessEmail !== undefined) {
    const v = patch.businessEmail?.trim() ? normalizeEmail(patch.businessEmail) : null;
    if (v !== user.businessEmail) {
      next.businessEmail = v;
      changed = true;
    }
  }
  if (patch.normalizedEmail !== undefined && patch.normalizedEmail !== user.normalizedEmail) {
    next.normalizedEmail = patch.normalizedEmail ?? null;
    changed = true;
  }
  if (patch.emailHash !== undefined && patch.emailHash !== user.emailHash) {
    next.emailHash = patch.emailHash ?? null;
    changed = true;
  }
  if (patch.emailStatus !== undefined && patch.emailStatus !== user.emailStatus) {
    next.emailStatus = patch.emailStatus ?? undefined;
    changed = true;
  }
  if (patch.emailLinkedAt !== undefined && patch.emailLinkedAt !== user.emailLinkedAt) {
    next.emailLinkedAt = patch.emailLinkedAt ?? null;
    changed = true;
  }
  if (patch.emailVerifiedAt !== undefined && patch.emailVerifiedAt !== user.emailVerifiedAt) {
    next.emailVerifiedAt = patch.emailVerifiedAt ?? null;
    changed = true;
  }
  if (patch.language !== undefined && patch.language !== user.language) {
    next.language = patch.language ?? null;
    changed = true;
  }
  if (patch.profileCompletedAt !== undefined && patch.profileCompletedAt !== user.profileCompletedAt) {
    next.profileCompletedAt = patch.profileCompletedAt ?? null;
    changed = true;
  }
  if (patch.ueidReleasedAt !== undefined && patch.ueidReleasedAt !== user.ueidReleasedAt) {
    next.ueidReleasedAt = patch.ueidReleasedAt ?? null;
    changed = true;
  }
  if (
    patch.onboardingIntroSeenAt !== undefined &&
    patch.onboardingIntroSeenAt !== user.onboardingIntroSeenAt
  ) {
    next.onboardingIntroSeenAt = patch.onboardingIntroSeenAt ?? null;
    changed = true;
  }
  if (patch.profileLogo !== undefined) {
    const prevUri = user.profileLogo?.localUri ?? null;
    const nextUri = patch.profileLogo?.localUri ?? null;
    if (prevUri !== nextUri) {
      next.profileLogo = patch.profileLogo;
      changed = true;
    }
  }
  if (patch.pdfBranding !== undefined) {
    const include =
      patch.pdfBranding.includeProfileLogo === false
        ? false
        : user.pdfBranding?.includeProfileLogo ?? DEFAULT_PDF_BRANDING.includeProfileLogo;
    if (include !== (user.pdfBranding?.includeProfileLogo !== false)) {
      next.pdfBranding = { includeProfileLogo: include };
      changed = true;
    }
  }
  if (patch.lastActiveAt !== undefined && patch.lastActiveAt !== user.lastActiveAt) {
    next.lastActiveAt = patch.lastActiveAt;
    changed = true;
  }
  if (patch.status !== undefined && patch.status !== user.status) {
    next.status = patch.status ?? undefined;
    changed = true;
  }
  if (patch.mobileHash !== undefined && patch.mobileHash !== user.mobileHash) {
    next.mobileHash = patch.mobileHash;
    changed = true;
  }
  if (
    patch.deletionRequestedAt !== undefined &&
    patch.deletionRequestedAt !== user.deletionRequestedAt
  ) {
    next.deletionRequestedAt = patch.deletionRequestedAt;
    changed = true;
  }
  if (
    patch.deletionScheduledFor !== undefined &&
    patch.deletionScheduledFor !== user.deletionScheduledFor
  ) {
    next.deletionScheduledFor = patch.deletionScheduledFor;
    changed = true;
  }
  if (
    patch.deletionCompletedAt !== undefined &&
    patch.deletionCompletedAt !== user.deletionCompletedAt
  ) {
    next.deletionCompletedAt = patch.deletionCompletedAt;
    changed = true;
  }
  if (patch.retiredUeid !== undefined && patch.retiredUeid !== user.retiredUeid) {
    next.retiredUeid = patch.retiredUeid ?? undefined;
    changed = true;
  }
  if (
    patch.businessNameChangeCount !== undefined &&
    patch.businessNameChangeCount !== user.businessNameChangeCount
  ) {
    next.businessNameChangeCount = patch.businessNameChangeCount;
    changed = true;
  }
  if (patch.emailChangeCount !== undefined && patch.emailChangeCount !== user.emailChangeCount) {
    next.emailChangeCount = patch.emailChangeCount;
    changed = true;
  }
  if (patch.profileChangeHistory !== undefined) {
    next.profileChangeHistory = patch.profileChangeHistory;
    changed = true;
  }
  if (
    patch.lastProfileEditedAt !== undefined &&
    patch.lastProfileEditedAt !== user.lastProfileEditedAt
  ) {
    next.lastProfileEditedAt = patch.lastProfileEditedAt ?? null;
    changed = true;
  }
  if (patch.legalConsents !== undefined) {
    next.legalConsents = patch.legalConsents;
    changed = true;
  }

  if (!changed) return user;
  next.updatedAt = Date.now();
  if (!next.pdfBranding) next.pdfBranding = { ...DEFAULT_PDF_BRANDING };
  return next;
}
