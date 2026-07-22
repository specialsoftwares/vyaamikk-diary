import type { UserProfile } from "@/domain/types";

import type { ProfilePatch } from "./types";

/**
 * Client-safe profile fields allowed by production Firestore rules
 * (`clientProfilePatchAllowed`). Keep aligned with `firestore.rules`.
 */
export const CLIENT_PROFILE_PATCH_ALLOWLIST = [
  "displayName",
  "salutation",
  "businessName",
  "workType",
  "designation",
  "businessEmail",
  "normalizedEmail",
  "language",
  "profileCompletedAt",
  "ueidReleasedAt",
  "onboardingIntroSeenAt",
  "profileLogo",
  "pdfBranding",
  "lastLoginAt",
  "previousLoginAt",
  "lastActiveAt",
  "businessNameChangeCount",
  "emailChangeCount",
  "profileChangeHistory",
  "lastProfileEditedAt",
  "legalConsents",
  "updatedAt",
  "emailStatus",
  "emailLinkedAt",
  "accountKind",
  "pinCode",
  "pinLocality",
  "pinDistrict",
  "pinState",
  "gstin",
  "gstinVerificationState",
  "issuerIdentitySnapshotId",
  "onboardingProfileVersion",
] as const;

export type ClientAllowlistedPatchKey = (typeof CLIENT_PROFILE_PATCH_ALLOWLIST)[number];

/** Immutable identity / lifecycle — never written by production clients. */
export const SERVER_OWNED_PROFILE_PATCH_KEYS = [
  "uid",
  "ueid",
  "phoneE164",
  "mobileHash",
  "emailHash",
  "emailVerifiedAt",
  "status",
  "deletionRequestedAt",
  "deletionScheduledFor",
  "deletionCompletedAt",
  "retiredUeid",
  "reactivationRequestedAt",
  "reactivationPhoneVerifiedAt",
  "reactivationEmailVerifiedAt",
  "createdAt",
  "deletedAt",
  "mobileChangedAt",
  "mobileChangeCount",
] as const;

/**
 * Email identity fields bound server-side in production (`verifyAndBindEmail`).
 * Shared-dev and local-mock may still write these via the legacy merge path.
 */
export const PRODUCTION_SERVER_EMAIL_PATCH_KEYS = [
  "businessEmail",
  "normalizedEmail",
  "emailStatus",
  "emailLinkedAt",
  "emailHash",
  "emailVerifiedAt",
] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fieldValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function readUserField(user: UserProfile, key: ClientAllowlistedPatchKey): unknown {
  if (key === "updatedAt") return user.updatedAt;
  return (user as unknown as Record<string, unknown>)[key];
}

/** Remove server-owned and (in production) email-identity keys from a patch. */
export function stripServerOwnedProfilePatchKeys(
  patch: ProfilePatch,
  options?: { production?: boolean }
): ProfilePatch {
  const out: ProfilePatch = { ...patch };
  for (const key of SERVER_OWNED_PROFILE_PATCH_KEYS) {
    delete (out as Record<string, unknown>)[key];
  }
  if (options?.production) {
    for (const key of PRODUCTION_SERVER_EMAIL_PATCH_KEYS) {
      delete (out as Record<string, unknown>)[key];
    }
  }
  return out;
}

/** Keys present in a patch that must not be sent to Firestore by production clients. */
export function findRejectedProductionPatchKeys(patch: ProfilePatch): string[] {
  const rejected: string[] = [];
  for (const key of SERVER_OWNED_PROFILE_PATCH_KEYS) {
    if ((patch as Record<string, unknown>)[key] !== undefined) {
      rejected.push(key);
    }
  }
  for (const key of PRODUCTION_SERVER_EMAIL_PATCH_KEYS) {
    if ((patch as Record<string, unknown>)[key] !== undefined) {
      rejected.push(key);
    }
  }
  return rejected;
}

/**
 * Build a minimal Firestore merge payload: only allowlisted fields that changed
 * between `existing` and `next`, plus `updatedAt` when there is at least one change.
 */
export function buildClientProfileFirestoreWrite(
  existing: UserProfile,
  next: UserProfile,
  options?: { production?: boolean }
): Record<string, unknown> | null {
  const production = options?.production === true;
  const payload: Record<string, unknown> = {};

  for (const key of CLIENT_PROFILE_PATCH_ALLOWLIST) {
    if (key === "updatedAt") continue;
    if (
      production &&
      (PRODUCTION_SERVER_EMAIL_PATCH_KEYS as readonly string[]).includes(key)
    ) {
      continue;
    }
    const prev = readUserField(existing, key);
    const value = readUserField(next, key);
    if (!fieldValueEqual(prev, value)) {
      payload[key] = value ?? null;
    }
  }

  if (Object.keys(payload).length === 0) return null;
  payload.updatedAt = next.updatedAt;
  return payload;
}

/** Shape of the legacy full-document merge (pre-remediation) for rules tests. */
export function legacyProfileDocumentMergeFields(
  next: UserProfile
): Record<string, unknown> {
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
