import { AppError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";

export type ProfileChangeSource = "onboarding" | "settings";

export type ProfileTrackedField =
  | "displayName"
  | "businessName"
  | "businessEmail"
  | "workType"
  | "designation"
  | "salutation";

export interface ProfileChangeHistoryEntry {
  at: number;
  field: ProfileTrackedField;
  /** Truncated summary for support — avoid storing full values in logs. */
  oldSummary: string;
  newSummary: string;
  source: ProfileChangeSource;
}

export const MAX_BUSINESS_NAME_CHANGES = 2;
export const MAX_EMAIL_CHANGES = 2;

const LIMITED_FIELDS: Partial<
  Record<ProfileTrackedField, keyof Pick<UserProfile, "businessNameChangeCount" | "emailChangeCount">>
> = {
  businessName: "businessNameChangeCount",
  businessEmail: "emailChangeCount",
};

export function summarizeProfileValue(field: ProfileTrackedField, value: string | null): string {
  const v = (value ?? "").trim();
  if (!v) return "—";
  if (field === "businessEmail") {
    const at = v.indexOf("@");
    if (at > 1) return `${v.slice(0, 2)}***@${v.slice(at + 1, at + 4)}***`;
  }
  if (v.length <= 24) return v;
  return `${v.slice(0, 21)}…`;
}

export function canEditProfileField(
  user: UserProfile,
  field: ProfileTrackedField
): { allowed: true } | { allowed: false; reason: "limit_reached" } {
  const countKey = LIMITED_FIELDS[field];
  if (!countKey) return { allowed: true };
  const count = user[countKey] ?? 0;
  const max = field === "businessEmail" ? MAX_EMAIL_CHANGES : MAX_BUSINESS_NAME_CHANGES;
  if (count >= max) return { allowed: false, reason: "limit_reached" };
  return { allowed: true };
}

export function assertCanEditProfileField(user: UserProfile, field: ProfileTrackedField): void {
  const gate = canEditProfileField(user, field);
  if (!gate.allowed) {
    const message =
      field === "businessEmail"
        ? "For account safety and misuse prevention, this email can no longer be changed from the app. Please contact support."
        : "For account safety and misuse prevention, this detail can no longer be changed from the app. Please contact support if correction is required.";
    throw new AppError("permission_denied", message);
  }
}

export function nextChangeCount(
  user: UserProfile,
  field: ProfileTrackedField,
  changed: boolean
): Pick<UserProfile, "businessNameChangeCount" | "emailChangeCount"> {
  if (!changed) return {};
  const countKey = LIMITED_FIELDS[field];
  if (!countKey) return {};
  return { [countKey]: (user[countKey] ?? 0) + 1 };
}

export function appendProfileChangeHistory(
  user: UserProfile,
  entry: ProfileChangeHistoryEntry,
  maxEntries = 40
): ProfileChangeHistoryEntry[] {
  const prev = user.profileChangeHistory ?? [];
  return [...prev, entry].slice(-maxEntries);
}

/**
 * Identity fields frozen after authoritative profile completion.
 * (Historically keyed off ueidReleasedAt; V1 locks on profileCompletedAt.)
 */
export function isOnboardingIdentityLocked(user: UserProfile): boolean {
  return Boolean(user.profileCompletedAt || user.ueidReleasedAt);
}
