/**
 * Shapes a diary cloud document so business fields are not stored beside the envelope.
 * Encryption itself runs on the server. This module does not hold a key.
 */

import type { BusinessEntry } from "@/domain/businessEntry";
import { emptyDocumentHistory } from "@/domain/documentHistory";

export type DiaryContentSeal = {
  v: 1;
  alg: "AES-256-GCM";
  uid: string;
  collection: string;
  recordId: string;
  revision: number;
  purpose: string;
  nonce: string;
  ciphertext: string;
  tag: string;
};

export function isDiaryContentSeal(value: unknown): value is DiaryContentSeal {
  if (!value || typeof value !== "object") return false;
  const seal = value as Partial<DiaryContentSeal>;
  return (
    seal.v === 1 &&
    seal.alg === "AES-256-GCM" &&
    typeof seal.uid === "string" &&
    typeof seal.recordId === "string" &&
    typeof seal.revision === "number" &&
    typeof seal.ciphertext === "string" &&
    typeof seal.tag === "string"
  );
}

export function diaryPlaintextForSeal(record: BusinessEntry): string {
  return JSON.stringify({
    title: record.title,
    notes: record.notes,
    reminder: record.reminder,
    location: record.location,
    attachments: record.attachments,
    payload: record.payload,
    documentHistory: record.documentHistory,
  });
}

export function sealedDiaryCloudPayload(
  record: BusinessEntry,
  seal: DiaryContentSeal
): Record<string, unknown> {
  if (seal.uid !== record.userId) throw new Error("seal_owner_mismatch");
  if (seal.recordId !== record.id) throw new Error("seal_record_mismatch");
  if (seal.revision !== record.updatedAt) throw new Error("seal_revision_mismatch");
  return {
    id: record.id,
    userId: record.userId,
    ueid: record.ueid,
    entryType: record.entryType,
    entryDate: record.entryDate,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    source: record.source,
    status: record.status,
    deletedAt: record.deletedAt,
    title: "sealed",
    notes: null,
    reminder: null,
    location: null,
    attachments: [],
    payload: null,
    documentHistory: emptyDocumentHistory(),
    pdfUri: null,
    contentSeal: seal,
  };
}

export function applyOpenedDiaryFields(entry: BusinessEntry, plaintextJson: string): BusinessEntry {
  const parsed = JSON.parse(plaintextJson) as Partial<BusinessEntry>;
  return {
    ...entry,
    title: typeof parsed.title === "string" ? parsed.title : entry.title,
    notes: parsed.notes ?? null,
    reminder: parsed.reminder ?? null,
    location: parsed.location ?? null,
    attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
    payload: parsed.payload ?? entry.payload,
    documentHistory: parsed.documentHistory ?? entry.documentHistory,
    pdfUri: null,
  };
}

export function cloudPayloadLeaksPlaintext(
  cloud: Record<string, unknown>,
  sensitive: string
): boolean {
  const copy = { ...cloud };
  delete copy.contentSeal;
  return JSON.stringify(copy).includes(sensitive);
}
