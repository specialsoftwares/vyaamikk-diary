/**
 * Active-account admission for protected business operations.
 * Age is an optional demographic field, never authorization. Historical age
 * assessments stay on the profile and are not consulted. Authentication,
 * owner, and restore checks run in callers.
 * Assessment, authentication, support, privacy, sign-out, deletion, and
 * account recovery do not call this helper.
 * seal/open and GRIN production callables call `assertBusinessAgeAdmitted`.
 * A missing band must not be turned into a login or first-save failure here.
 */

import { HttpsError } from "firebase-functions/v2/https";

import { getAdminDb } from "../admin";

export type BusinessAgeDecision = "active" | "missing" | "inactive";

export function decideBusinessAge(
  profile: {
    status?: unknown;
    ageEligibility?: unknown;
    demographicAgeBand?: unknown;
  } | null | undefined
): BusinessAgeDecision {
  if (!profile) return "missing";
  // Preserve the existing legacy status default. An explicit inactive status
  // is never admitted, regardless of any historical age assertion or band.
  void profile.ageEligibility;
  void profile.demographicAgeBand;
  const status = profile.status == null ? "active" : String(profile.status);
  return status === "active" ? "active" : "inactive";
}

export async function assertBusinessAgeAdmitted(
  uid: string,
  readProfile: (uid: string) => Promise<Record<string, unknown> | null> = readUserProfile
): Promise<void> {
  if (decideBusinessAge(await readProfile(uid)) !== "active") {
    throw new HttpsError("failed-precondition", "account_not_active");
  }
}

async function readUserProfile(uid: string): Promise<Record<string, unknown> | null> {
  const snap = await getAdminDb().collection("users").doc(uid).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}
