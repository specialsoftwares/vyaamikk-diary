import type { ProfilePatch } from "@/services/auth/types";
import type { UserProfile } from "@/domain/types";
import {
  appendProfileChangeHistory,
  assertCanEditProfileField,
  nextChangeCount,
  summarizeProfileValue,
  type ProfileChangeSource,
  type ProfileTrackedField,
} from "@/domain/profileUpdatePolicy";

function fieldChanged(
  field: ProfileTrackedField,
  user: UserProfile,
  patch: ProfilePatch
): { oldVal: string | null; newVal: string | null } | null {
  switch (field) {
    case "displayName":
      if (patch.displayName === undefined) return null;
      return { oldVal: user.displayName, newVal: patch.displayName };
    case "businessName":
      if (patch.businessName === undefined) return null;
      return { oldVal: user.businessName, newVal: patch.businessName };
    case "businessEmail":
      if (patch.businessEmail === undefined) return null;
      return { oldVal: user.businessEmail, newVal: patch.businessEmail };
    case "workType":
      if (patch.workType === undefined) return null;
      return { oldVal: user.workType, newVal: patch.workType };
    case "designation":
      if (patch.designation === undefined) return null;
      return { oldVal: user.designation, newVal: patch.designation };
    case "salutation":
      if (patch.salutation === undefined) return null;
      return { oldVal: user.salutation, newVal: patch.salutation };
    default:
      return null;
  }
}

const TRACKED_FIELDS: ProfileTrackedField[] = [
  "displayName",
  "businessName",
  "businessEmail",
  "workType",
  "designation",
  "salutation",
];

/**
 * Validates Settings change limits and returns patch extras (counts + history).
 * Onboarding first-time saves should use source `onboarding` (no limits).
 */
export function enrichProfilePatchWithPolicy(
  user: UserProfile,
  patch: ProfilePatch,
  source: ProfileChangeSource
): ProfilePatch {
  const applyLimits = source === "settings" && Boolean(user.profileCompletedAt);
  const now = Date.now();
  let next: ProfilePatch = { ...patch };
  let history = [...(user.profileChangeHistory ?? [])];
  let counts: Pick<UserProfile, "businessNameChangeCount" | "emailChangeCount"> = {
    businessNameChangeCount: user.businessNameChangeCount ?? 0,
    emailChangeCount: user.emailChangeCount ?? 0,
  };
  let running = user;
  let changed = false;

  for (const field of TRACKED_FIELDS) {
    const delta = fieldChanged(field, running, patch);
    if (!delta) continue;
    const oldS = (delta.oldVal ?? "").trim();
    const newS = (delta.newVal ?? "").trim();
    if (oldS === newS) continue;

    if (applyLimits) {
      assertCanEditProfileField(running, field);
    }

    history = appendProfileChangeHistory(running, {
      at: now,
      field,
      oldSummary: summarizeProfileValue(field, delta.oldVal),
      newSummary: summarizeProfileValue(field, delta.newVal),
      source,
    });

    if (applyLimits) {
      counts = { ...counts, ...nextChangeCount(running, field, true) };
    }
    running = {
      ...running,
      profileChangeHistory: history,
      businessNameChangeCount: counts.businessNameChangeCount,
      emailChangeCount: counts.emailChangeCount,
    };
    changed = true;
  }

  if (changed) {
    next = {
      ...next,
      profileChangeHistory: history,
      lastProfileEditedAt: now,
      ...(applyLimits
        ? {
            businessNameChangeCount: counts.businessNameChangeCount,
            emailChangeCount: counts.emailChangeCount,
          }
        : {}),
    };
  }

  return next;
}
