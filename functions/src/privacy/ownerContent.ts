/**
 * Admitted-owner seal and open. The content key never leaves this process.
 * Request and response bodies are not logged.
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";

import { assertAdmittedCallableUser } from "../identity/admitCallableUser";
import { assertBusinessAgeAdmitted } from "../identity/businessAdmission";
import {
  loadContentKey,
  loadNamedContentKey,
  openContent,
  sealContent,
  sealContentV2,
  type ContentSeal,
} from "./contentEncryption";
import { contentDataKey } from "./secrets";
import { assertRestoreTrafficClosed } from "../deletion/restoreGate";

const COLLECTIONS = new Set([
  "entries",
  "attachments",
  "customerCreditRecords",
  "purchaseOrders",
  "professionalPacks",
  "letterheadDocs",
  "users",
]);
const PURPOSES = new Set([
  "diary",
  "attachment",
  "customer_credit",
  "purchase_order",
  "professional_pack",
  "letterhead_document",
  "profile",
]);
const MAX_PLAINTEXT_BYTES = 7_000_000;

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function requireBinding(data: Record<string, unknown>, uid: string): {
  collection: string;
  recordId: string;
  revision: number;
  purpose: string;
} {
  const collection = String(data.collection ?? "");
  const recordId = String(data.recordId ?? "");
  const purpose = String(data.purpose ?? "");
  const revision = Number(data.revision);
  if (!COLLECTIONS.has(collection) || !PURPOSES.has(purpose) || !recordId || !Number.isFinite(revision)) {
    throw new HttpsError("invalid-argument", "Content binding is not valid.");
  }
  if (data.uid != null && String(data.uid) !== uid) {
    throw new HttpsError("permission-denied", "Content owner does not match the signed-in account.");
  }
  return { collection, recordId, revision, purpose };
}

export const sealOwnerContent = onCall(
  { region: "asia-south1", secrets: [contentDataKey] },
  async (request) => {
    await assertAdmittedCallableUser(request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
    await assertBusinessAgeAdmitted(uid);
    await assertRestoreTrafficClosed(uid);
    const data = asRecord(request.data);
    const binding = requireBinding(data, uid);
    const plaintextBase64 = String(data.plaintextBase64 ?? "");
    let plaintext: Buffer;
    try {
      plaintext = Buffer.from(plaintextBase64, "base64");
    } catch {
      throw new HttpsError("invalid-argument", "Content could not be protected.");
    }
    if (plaintext.length === 0 || plaintext.length > MAX_PLAINTEXT_BYTES) {
      throw new HttpsError("invalid-argument", "Content could not be protected.");
    }
    let key: Buffer;
    try {
      key = loadContentKey();
    } catch {
      throw new HttpsError("failed-precondition", "Content protection is unavailable.");
    }
    const activeKeyId = process.env.CONTENT_DATA_KEY_ID?.trim();
    let seal: ContentSeal;
    if (activeKeyId) {
      const activeKey = loadNamedContentKey(activeKeyId);
      if (!activeKey) throw new HttpsError("failed-precondition", "Content protection is unavailable.");
      seal = sealContentV2({ key: activeKey, keyId: activeKeyId, uid, plaintext, ...binding });
    } else {
      seal = sealContent({ key, uid, plaintext, ...binding });
    }
    return { seal };
  }
);

export const openOwnerContent = onCall(
  { region: "asia-south1", secrets: [contentDataKey] },
  async (request) => {
    await assertAdmittedCallableUser(request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
    await assertBusinessAgeAdmitted(uid);
    await assertRestoreTrafficClosed(uid);
    const data = asRecord(request.data);
    const binding = requireBinding(data, uid);
    const seal = data.seal as ContentSeal | undefined;
    if (!seal || typeof seal !== "object") {
      throw new HttpsError("invalid-argument", "Content could not be opened.");
    }
    let key: Buffer;
    try {
      key = loadContentKey();
    } catch {
      throw new HttpsError("failed-precondition", "Content protection is unavailable.");
    }
    try {
      const plaintext = openContent({
        key,
        uid,
        seal,
        ...binding,
        resolveKey: (keyId) => loadNamedContentKey(keyId),
      });
      return { plaintextBase64: plaintext.toString("base64") };
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "content_key_unavailable") {
        throw new HttpsError("failed-precondition", "Content protection is unavailable.");
      }
      throw new HttpsError("permission-denied", "Content could not be opened.");
    }
  }
);
