/**
 * Owner-scoped purpose grant and withdrawal.
 * receivedAt is the server clock. The client cannot choose it.
 * Required service processing cannot be withdrawn.
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";

import { assertAdmittedCallableUser } from "../identity/admitCallableUser";
import { getAdminDb } from "../admin";
import { projectRestoreAuthority } from "../deletion/restoreAuthority";
import { purposeTransition, type PurposeState } from "./processingPurposeState";

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
  if (data.uid !== uid) throw new HttpsError("permission-denied", "Purpose owner changed.");
  const purpose = String(data.purpose ?? "");
  if (!PURPOSES.has(purpose)) throw new HttpsError("invalid-argument", "Unknown purpose.");
  const db = getAdminDb();
  const ref = db.collection("users").doc(uid).collection("processingPurposes").doc(purpose);
  const readState = (data: Record<string, unknown> | undefined): PurposeState => ({
    revision: Number.isSafeInteger(data?.revision) ? Number(data!.revision) : 0,
    decision: data?.decision === "withdraw" ? "withdraw" :
      data?.decision === "grant" && data.noticeVersion === PROCESSING_NOTICE_VERSION &&
      data.policyVersion === PROCESSING_POLICY_VERSION ? "grant" : null,
    receivedAt: typeof data?.receivedAt === "number" ? data.receivedAt : null,
  });
  if (data.action === "read") {
    const user = await db.collection("users").doc(uid).get();
    if (!user.exists || user.data()?.status !== "active") {
      throw new HttpsError("failed-precondition", "This account cannot enable optional processing.");
    }
    return { ok: true as const, ...readState((await ref.get()).data()) };
  }
  if (data.noticeVersion !== PROCESSING_NOTICE_VERSION || data.policyVersion !== PROCESSING_POLICY_VERSION) {
    throw new HttpsError("failed-precondition", "Purpose notice is outdated.");
  }
  if (typeof data.operationId !== "string" || !/^[A-Za-z0-9_-]{8,120}$/.test(data.operationId) ||
      !Number.isSafeInteger(data.expectedRevision) || Number(data.expectedRevision) < 0) {
    throw new HttpsError("invalid-argument", "Purpose operation is not valid.");
  }
  const receipt = processingPurposeReceipt({ uid, purpose, decision: String(data.decision ?? ""),
    noticeVersion: PROCESSING_NOTICE_VERSION, policyVersion: PROCESSING_POLICY_VERSION }, Date.now());
  const eventRef = db.collection("users").doc(uid).collection("processingPurposeEvents").doc(data.operationId);
  if (receipt.decision === "withdraw") {
    const existingEvent = await eventRef.get();
    if (existingEvent.exists && (existingEvent.data()?.purpose !== purpose || existingEvent.data()?.decision !== receipt.decision)) {
      throw new HttpsError("invalid-argument", "Purpose operation was already used.");
    }
    try {
      await projectRestoreAuthority(uid, { withdrawPurposes: [purpose] });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (
        code === "restore_authority_unprovisioned" ||
        code === "restore_authority_projection_failed" ||
        code === "restore_authority_write_failed"
      ) {
        throw new HttpsError("failed-precondition", code);
      }
      throw error;
    }
    const { noteWithdrawnPurposeOnDeletionJob } = await import("../deletion/finalPurge");
    await noteWithdrawnPurposeOnDeletionJob(uid, purpose);
  }
  return db.runTransaction(async tx => {
    const [snapshot, event, user] = await Promise.all([
      tx.get(ref), tx.get(eventRef), tx.get(db.collection("users").doc(uid)),
    ]);
    const status = user.data()?.status;
    if (!user.exists || (status !== "active" && !(status === "pending_deletion" && receipt.decision === "withdraw"))) {
      throw new HttpsError("failed-precondition", "This account cannot change processing purposes.");
    }
    const current = readState(snapshot.data());
    if (event.exists && (event.data()?.purpose !== purpose || event.data()?.decision !== receipt.decision)) {
      throw new HttpsError("invalid-argument", "Purpose operation was already used.");
    }
    const transition = purposeTransition(current, { decision: receipt.decision,
      expectedRevision: Number(data.expectedRevision), alreadyReceived: event.exists }, Date.now());
    if (transition.apply) {
      tx.set(ref, { ...receipt, ...transition.state });
      tx.create(eventRef, { ...receipt, ...transition.state, operationId: data.operationId });
    }
    return { ok: true as const, ...transition.state, conflict: transition.conflict };
  });
});
