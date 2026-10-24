/**
 * Records the 18+ result. The submitted date is not written to the profile.
 * A client-supplied eligibility flag is rejected.
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";

import { getAdminDb } from "../admin";
import { assertAdmittedCallableUser } from "./admitCallableUser";
import { assessSelfDeclaredDob } from "./ageEligibility";

const FORGED_FIELDS = ["ageEligibility", "eligible", "nowMs", "assessedAt", "policyVersion"];

export const recordAgeAssessment = onCall({ region: "asia-south1" }, async (request) => {
  await assertAdmittedCallableUser(request);
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const data = request.data && typeof request.data === "object" ? (request.data as Record<string, unknown>) : {};
  if (FORGED_FIELDS.some((field) => field in data)) {
    throw new HttpsError("invalid-argument", "Eligibility is decided by the server.");
  }

  const db = getAdminDb();
  const ref = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Account not found.");
    const existing = snap.data() as Record<string, unknown>;
    if (existing.status !== "active") {
      throw new HttpsError("failed-precondition", "This account cannot update age eligibility.");
    }
    if (existing.ageEligibility === "eligible") {
      return {
        ageEligibility: "eligible",
        agePolicyVersion: existing.agePolicyVersion ?? null,
        ageAssessedAt: existing.ageAssessedAt ?? null,
        ageMethod: "self_declared_dob",
      };
    }

    const nowMs = Date.now();
    const assessment = assessSelfDeclaredDob({ dateOfBirth: data.dateOfBirth, nowMs });
    if (!assessment.ok) {
      throw new HttpsError("invalid-argument", "Enter a real date of birth as YYYY-MM-DD.");
    }

    const fields = {
      ageEligibility: assessment.ageEligibility,
      agePolicyVersion: assessment.policyVersion,
      ageAssessedAt: assessment.assessedAt,
      ageMethod: assessment.method,
      updatedAt: nowMs,
    };
    tx.set(ref, fields, { merge: true });
    return {
      ageEligibility: fields.ageEligibility,
      agePolicyVersion: fields.agePolicyVersion,
      ageAssessedAt: fields.ageAssessedAt,
      ageMethod: fields.ageMethod,
    };
  });
});
