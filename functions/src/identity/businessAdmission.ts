/**
 * Age admission for protected business operations.
 * Assessment, authentication, support, privacy, sign-out, deletion, and
 * account recovery do not call this helper.
 */

import { HttpsError } from "firebase-functions/v2/https";

import { getAdminDb } from "../admin";

export type BusinessAgeDecision = "eligible" | "unassessed" | "ineligible" | "inactive";

export function decideBusinessAge(
  profile: { ageEligibility?: unknown; status?: unknown } | null | undefined
): BusinessAgeDecision {
  if (!profile) return "unassessed";
  const status = profile.status == null ? "active" : String(profile.status);
  if (status !== "active") return "inactive";
  if (profile.ageEligibility === "ineligible") return "ineligible";
  if (profile.ageEligibility === "eligible") return "eligible";
  return "unassessed";
}

export async function assertBusinessAgeAdmitted(
  uid: string,
  readProfile: (uid: string) => Promise<Record<string, unknown> | null> = readUserProfile
): Promise<void> {
  const decision = decideBusinessAge(await readProfile(uid));
  if (decision !== "eligible") {
    throw new HttpsError("failed-precondition", "age_not_admitted");
  }
}

async function readUserProfile(uid: string): Promise<Record<string, unknown> | null> {
  const snap = await getAdminDb().collection("users").doc(uid).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}
