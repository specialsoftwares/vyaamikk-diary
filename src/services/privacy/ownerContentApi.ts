/**
 * Production diary and attachment protection.
 * The content key stays on the server. This module only carries envelopes.
 */

import type { BusinessEntry } from "@/domain/businessEntry";

import {
  applyOpenedDiaryFields,
  diaryPlaintextForSeal,
  sealedDiaryCloudPayload,
  type DiaryContentSeal,
} from "./diarySealDocument";

function encodeUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeUtf8Base64(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function sealDiaryCloudPayload(record: BusinessEntry): Promise<Record<string, unknown>> {
  const { callSealOwnerContent } = await import("@/services/auth/identityCallable");
  const seal = await callSealOwnerContent({
    collection: "entries",
    recordId: record.id,
    revision: record.updatedAt,
    purpose: "diary",
    plaintextBase64: encodeUtf8Base64(diaryPlaintextForSeal(record)),
  });
  return sealedDiaryCloudPayload(record, seal);
}

export async function openSealedDiaryEntry(
  userId: string,
  entry: BusinessEntry,
  seal: DiaryContentSeal
): Promise<BusinessEntry> {
  if (seal.uid !== userId || seal.recordId !== entry.id || seal.revision !== entry.updatedAt) {
    throw new Error("seal_binding_mismatch");
  }
  const { callOpenOwnerContent } = await import("@/services/auth/identityCallable");
  const opened = await callOpenOwnerContent({
    collection: "entries",
    recordId: entry.id,
    revision: entry.updatedAt,
    purpose: "diary",
    seal,
  });
  return applyOpenedDiaryFields(entry, decodeUtf8Base64(opened.plaintextBase64));
}

export async function sealAttachmentBase64(input: {
  storagePath: string;
  revision: number;
  base64: string;
}): Promise<string> {
  const { callSealOwnerContent } = await import("@/services/auth/identityCallable");
  const seal = await callSealOwnerContent({
    collection: "attachments",
    recordId: input.storagePath,
    revision: input.revision,
    purpose: "attachment",
    plaintextBase64: input.base64,
  });
  return JSON.stringify(seal);
}

export async function openAttachmentSeal(seal: DiaryContentSeal): Promise<string> {
  const { callOpenOwnerContent } = await import("@/services/auth/identityCallable");
  const opened = await callOpenOwnerContent({
    collection: "attachments",
    recordId: seal.recordId,
    revision: seal.revision,
    purpose: "attachment",
    seal,
  });
  return opened.plaintextBase64;
}
