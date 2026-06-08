import type { UserProfile } from "@/domain/types";

/** Full mutable profile fields written to Firestore on update (fixes prior omission bug). */
export function profileDocumentMergeFields(next: UserProfile): Record<string, unknown> {
  return {
    displayName: next.displayName,
    salutation: next.salutation,
    businessName: next.businessName,
    workType: next.workType,
    designation: next.designation,
    businessEmail: next.businessEmail,
    normalizedEmail: next.normalizedEmail ?? null,
    emailHash: next.emailHash ?? null,
    emailStatus: next.emailStatus ?? null,
    emailLinkedAt: next.emailLinkedAt ?? null,
    emailVerifiedAt: next.emailVerifiedAt ?? null,
    language: next.language,
    profileCompletedAt: next.profileCompletedAt,
    ueidReleasedAt: next.ueidReleasedAt,
    onboardingIntroSeenAt: next.onboardingIntroSeenAt,
    profileLogo: next.profileLogo,
    pdfBranding: next.pdfBranding,
    lastLoginAt: next.lastLoginAt,
    previousLoginAt: next.previousLoginAt,
    lastActiveAt: next.lastActiveAt,
    status: next.status ?? "active",
    mobileHash: next.mobileHash ?? null,
    deletionRequestedAt: next.deletionRequestedAt ?? null,
    deletionScheduledFor: next.deletionScheduledFor ?? null,
    deletionCompletedAt: next.deletionCompletedAt ?? null,
    retiredUeid: next.retiredUeid ?? false,
    businessNameChangeCount: next.businessNameChangeCount ?? 0,
    emailChangeCount: next.emailChangeCount ?? 0,
    profileChangeHistory: next.profileChangeHistory ?? [],
    lastProfileEditedAt: next.lastProfileEditedAt ?? null,
    legalConsents: next.legalConsents ?? [],
    updatedAt: next.updatedAt,
  };
}
