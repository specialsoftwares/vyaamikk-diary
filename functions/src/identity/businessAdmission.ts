/**
 * Active-account admission for protected business operations.
 * Age is an optional demographic field, never authorization. Historical age
 * assessments stay untouched. Authentication/owner/restore checks run in callers.
 * Assessment, authentication, support, privacy, sign-out, deletion, and
 * account recovery do not call this helper.
 */

import { HttpsError } from "firebase-functions/v2/https";

import { getAdminDb } from "../admin";

export type BusinessAccountDecision = "active" | "missing" | "inactive";

export function decideBusinessAccount(
  profile: { status?: unknown; [key: string]: unknown } | null | undefined
): BusinessAccountDecision {
  if (!profile) return "missing";
  // Preserve the existing legacy status default; an explicit inactive status
  // is never admitted, regardless of any historical age assertion.
  const status = profile.status == null ? "active" : String(profile.status);
  return status === "active" ? "active" : "inactive";
}

export async function assertBusinessAccountActive(
  uid: string,
  readProfile: (uid: string) => Promise<Record<string, unknown> | null> = readUserProfile
): Promise<void> {
  if (decideBusinessAccount(await readProfile(uid)) !== "active") {
    throw new HttpsError("failed-precondition", "account_not_active");
  }
}

async function readUserProfile(uid: string): Promise<Record<string, unknown> | null> {
  const snap = await getAdminDb().collection("users").doc(uid).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

/** Compatibility names for older callers; demographic age never grants admission. */
export type BusinessAgeDecision = BusinessAccountDecision;
export const decideBusinessAge = decideBusinessAccount;
export const assertBusinessAgeAdmitted = assertBusinessAccountActive;
