const UEID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function fnv1a(input: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function normalizePhoneE164(phone: string): string {
  if (typeof phone !== "string") {
    throw new TypeError("phone must be a string");
  }
  const trimmed = phone.trim();
  if (!trimmed) {
    throw new TypeError("phone must be non-empty");
  }
  // Strip formatting while preserving E.164 ("+91 64208 35745" → "+916420835745").
  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length >= 8) return `+${digits}`;
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return trimmed;
}

export function hashMobileE164(phoneE164: string): string {
  const normalized = normalizePhoneE164(phoneE164);
  return fnv1a(normalized).toString(16).padStart(8, "0");
}

export function generateUEID(year = new Date().getFullYear()): string {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    const idx = Math.floor(Math.random() * UEID_ALPHABET.length);
    suffix += UEID_ALPHABET[idx];
  }
  return `VYD-${year}-${suffix}`;
}

export const DEFAULT_PDF_BRANDING = { includeProfileLogo: true };

export type AccountStatus = "active" | "pending_deletion" | "deleted";

export interface UserProfileDoc {
  uid: string;
  ueid: string;
  phoneE164: string;
  mobileHash: string;
  displayName: string | null;
  salutation: string | null;
  businessName: string | null;
  workType: string | null;
  designation: string | null;
  businessEmail: string | null;
  normalizedEmail: string | null;
  emailHash: string | null;
  emailStatus: string | null;
  emailLinkedAt: number | null;
  emailVerifiedAt: number | null;
  language: string | null;
  profileCompletedAt: number | null;
  ueidReleasedAt: number | null;
  onboardingIntroSeenAt: number | null;
  profileLogo: unknown;
  pdfBranding: { includeProfileLogo: boolean };
  lastLoginAt: number | null;
  previousLoginAt: number | null;
  lastActiveAt: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  status: AccountStatus;
  deletionRequestedAt: number | null;
  deletionScheduledFor: number | null;
  deletionCompletedAt: number | null;
  reactivationRequestedAt: number | null;
  reactivationPhoneVerifiedAt: number | null;
  reactivationEmailVerifiedAt: number | null;
  retiredUeid: boolean;
  businessNameChangeCount: number;
  emailChangeCount: number;
}

export function freshProfileShell(
  authUid: string,
  phone: string,
  ueid: string,
  now: number
): UserProfileDoc {
  return {
    uid: authUid,
    ueid,
    phoneE164: phone,
    mobileHash: hashMobileE164(phone),
    displayName: null,
    salutation: null,
    businessName: null,
    workType: null,
    designation: null,
    businessEmail: null,
    normalizedEmail: null,
    emailHash: null,
    emailStatus: null,
    emailLinkedAt: null,
    emailVerifiedAt: null,
    language: null,
    profileCompletedAt: null,
    ueidReleasedAt: null,
    onboardingIntroSeenAt: null,
    profileLogo: null,
    pdfBranding: { ...DEFAULT_PDF_BRANDING },
    lastLoginAt: now,
    previousLoginAt: null,
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    status: "active",
    deletionRequestedAt: null,
    deletionScheduledFor: null,
    deletionCompletedAt: null,
    reactivationRequestedAt: null,
    reactivationPhoneVerifiedAt: null,
    reactivationEmailVerifiedAt: null,
    retiredUeid: false,
    businessNameChangeCount: 0,
    emailChangeCount: 0,
  };
}

export function applyLoginTimestamps(
  profile: UserProfileDoc,
  now: number
): UserProfileDoc {
  const priorLogin = profile.lastLoginAt;
  return {
    ...profile,
    previousLoginAt: priorLogin ?? profile.previousLoginAt ?? null,
    lastLoginAt: now,
    lastActiveAt: now,
    updatedAt: now,
  };
}
