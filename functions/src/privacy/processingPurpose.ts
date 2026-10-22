/**
 * Owner-scoped purpose grant and withdrawal.
 * receivedAt is the server clock. The client cannot choose it.
 * Required service processing cannot be withdrawn.
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";

import { assertAdmittedCallableUser } from "../identity/admitCallableUser";
import { getAdminDb } from "../admin";

export const PROCESSING_NOTICE_VERSION = "privacy-notice-2026-10";
export const PROCESSING_POLICY_VERSION = "processing-purpose-2026-10";

const PURPOSES = new Set(["crash_diagnostics", "service_operation"]);

export function processingPurposeReceipt(input: {
  uid: string;
  purpose: string;
  decision: string;
  noticeVersion: string;
  policyVersion: string;
  clientReceivedAt?: number;
}, serverNow: number): {
  uid: string;
  purpose: string;
  decision: "grant" | "withdraw";
  noticeVersion: string;
  policyVersion: string;
  receivedAt: number;
} {
  if (!PURPOSES.has(input.purpose)) {
    throw new HttpsError("invalid-argument", "Unknown processing purpose.");
  }
  if (input.decision !== "grant" && input.decision !== "withdraw") {
    throw new HttpsError("invalid-argument", "Unknown purpose decision.");
  }
  if (input.purpose === "service_operation" && input.decision === "withdraw") {
    throw new HttpsError("failed-precondition", "required_processing");
  }
  void input.clientReceivedAt;
  return {
    uid: input.uid,
    purpose: input.purpose,
    decision: input.decision,
    noticeVersion: input.noticeVersion || PROCESSING_NOTICE_VERSION,
    policyVersion: input.policyVersion || PROCESSING_POLICY_VERSION,
    receivedAt: serverNow,
  };
}

export const recordProcessingPurpose = onCall({ region: "asia-south1" }, async (request) => {
  await assertAdmittedCallableUser(request);
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const data = request.data && typeof request.data === "object" ? (request.data as Record<string, unknown>) : {};
  const receipt = processingPurposeReceipt(
    {
      uid,
      purpose: String(data.purpose ?? ""),
      decision: String(data.decision ?? ""),
      noticeVersion: String(data.noticeVersion ?? ""),
      policyVersion: String(data.policyVersion ?? ""),
      clientReceivedAt: typeof data.receivedAt === "number" ? data.receivedAt : undefined,
    },
    Date.now()
  );
  await getAdminDb()
    .collection("users")
    .doc(uid)
    .collection("processingPurposes")
    .doc(receipt.purpose)
    .set(receipt, { merge: true });
  return { ok: true as const, receivedAt: receipt.receivedAt, purpose: receipt.purpose, decision: receipt.decision };
});
