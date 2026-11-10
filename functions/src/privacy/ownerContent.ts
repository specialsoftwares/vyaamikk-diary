/**
 * Admitted-owner seal and open. The content key never leaves this process.
 * Request and response bodies are not logged.
 */

import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";

import { assertAdmittedCallableUser } from "../identity/admitCallableUser";
import { assertBusinessAccountActive } from "../identity/businessAdmission";
import {
  assertContentBinding,
  loadContentKey,
  loadNamedContentKey,
  openStoredContent,
  sealContent,
  sealContentV2,
  type ContentSeal,
} from "./contentEncryption";
import { contentDataKey } from "./secrets";
import { assertRestoreTrafficClosed } from "../deletion/restoreGate";

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
  if (!recordId || data.revision == null) {
    throw new HttpsError("invalid-argument", "Content binding is not valid.");
  }
  try {
    assertContentBinding({ collection, purpose, revision, keyId: typeof data.keyId === "string" ? data.keyId : undefined });
  } catch {
    throw new HttpsError("invalid-argument", "Content binding is not valid.");
  }
  if (data.uid != null && String(data.uid) !== uid) {
    throw new HttpsError("permission-denied", "Content owner does not match the signed-in account.");
  }
  return { collection, recordId, revision, purpose };
}

/** Injectable I/O guards; callable exports and regressions execute these same handlers. */
export type OwnerContentGuards = {
  admit: (request: CallableRequest) => Promise<unknown>;
  activeAccount: (uid: string) => Promise<void>;
  restore: (uid: string) => Promise<void>;
};
const productionGuards: OwnerContentGuards = {
  admit: assertAdmittedCallableUser,
  activeAccount: assertBusinessAccountActive,
  restore: assertRestoreTrafficClosed,
};

export async function performSealOwnerContent(
  request: CallableRequest, guards: OwnerContentGuards = productionGuards
) {
  await guards.admit(request);
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  await guards.activeAccount(uid);
  await guards.restore(uid);
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
  const activeKeyId = process.env.CONTENT_DATA_KEY_ID?.trim();
  let seal: ContentSeal;
  if (activeKeyId) {
    const activeKey = loadNamedContentKey(activeKeyId);
    if (!activeKey) throw new HttpsError("failed-precondition", "Content protection is unavailable.");
    seal = sealContentV2({ key: activeKey, keyId: activeKeyId, uid, plaintext, ...binding });
  } else {
    let key: Buffer;
    try {
      key = loadContentKey();
    } catch {
      throw new HttpsError("failed-precondition", "Content protection is unavailable.");
    }
    seal = sealContent({ key, uid, plaintext, ...binding });
  }
  return { seal };
}

export async function performOpenOwnerContent(
  request: CallableRequest, guards: OwnerContentGuards = productionGuards
) {
  await guards.admit(request);
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  await guards.activeAccount(uid);
  await guards.restore(uid);
  const data = asRecord(request.data);
  const binding = requireBinding(data, uid);
  const seal = data.seal as ContentSeal | undefined;
  if (!seal || typeof seal !== "object") {
    throw new HttpsError("invalid-argument", "Content could not be opened.");
  }
  try {
    const plaintext = openStoredContent({ uid, seal, ...binding });
    return { plaintextBase64: plaintext.toString("base64") };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "content_key_unavailable" || code === "unknown_key") {
      throw new HttpsError("failed-precondition", "Content protection is unavailable.");
    }
    throw new HttpsError("permission-denied", "Content could not be opened.");
  }
}

export const sealOwnerContent = onCall(
  { region: "asia-south1", secrets: [contentDataKey] },
  (request) => performSealOwnerContent(request)
);
export const openOwnerContent = onCall(
  { region: "asia-south1", secrets: [contentDataKey] },
  (request) => performOpenOwnerContent(request)
);
