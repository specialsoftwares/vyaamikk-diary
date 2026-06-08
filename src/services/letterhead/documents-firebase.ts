/**
 * Firestore-backed letterhead-documents repository (shared-dev / prod).
 *
 * Collection layout: users/{uid}/letterheadDocs/{docId}
 *
 * Records hold the form input + metadata. The PDF itself is not stored
 * in Firestore (the temp file URI is captured but is best-effort and
 * device-local).
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";

import { AppError } from "@/domain/errors";
import { getFirebaseDb } from "@/config/firebase";
import { letterheadDocToCloudStorage } from "@/services/pdf/pdfCloudSync";
import { stableRecordId } from "@/services/records/stableRecordId";
import { createLogger } from "@/utils/logger";

import type {
  LetterheadDocument,
  LetterheadDocumentInput,
  LetterheadDocumentRepository,
} from "./types";

const log = createLogger("letterhead/docs-firebase");
const COLLECTION = "letterheadDocs";

function userDocsCollection(userId: string) {
  return collection(getFirebaseDb(), "users", userId, COLLECTION);
}

function optStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function fromDoc(id: string, raw: Record<string, unknown>, userId: string): LetterheadDocument {
  const input = (raw.input ?? {}) as Partial<LetterheadDocumentInput>;
  const editHistory = Array.isArray(raw.editHistory)
    ? (raw.editHistory as LetterheadDocument["editHistory"])
    : undefined;
  return {
    id,
    userId,
    ueid: String(raw.ueid ?? ""),
    title: String(raw.title ?? ""),
    input: {
      title: String(input.title ?? ""),
      date: Number(input.date ?? Date.now()),
      reference: optStr(input.reference),
      recipientName: optStr(input.recipientName),
      recipientDesignation: optStr(input.recipientDesignation),
      recipientCompany: optStr(input.recipientCompany),
      recipientAddress: optStr(input.recipientAddress),
      subject: String(input.subject ?? ""),
      salutation: optStr(input.salutation),
      body: String(input.body ?? ""),
      closing: String(input.closing ?? ""),
      name: String(input.name ?? ""),
      designation: String(input.designation ?? ""),
      place: String(input.place ?? ""),
      useSignature: input.useSignature === true,
      useStamp: input.useStamp === true,
    },
    templateRefUpdatedAt:
      raw.templateRefUpdatedAt == null ? null : Number(raw.templateRefUpdatedAt),
    pdfUri: typeof raw.pdfUri === "string" ? raw.pdfUri : null,
    saved: Boolean(raw.saved ?? true),
    firstGeneratedAt:
      raw.firstGeneratedAt == null ? undefined : Number(raw.firstGeneratedAt),
    lastEditedAt: raw.lastEditedAt == null ? null : Number(raw.lastEditedAt),
    version: raw.version == null ? undefined : Number(raw.version),
    editHistory,
    createdAt: Number(raw.createdAt ?? Date.now()),
    updatedAt: Number(raw.updatedAt ?? Date.now()),
  };
}

export const firebaseLetterheadDocumentRepository: LetterheadDocumentRepository = {
  async list(userId) {
    if (!userId) return [];
    const q = query(userDocsCollection(userId), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => fromDoc(d.id, d.data() as Record<string, unknown>, userId));
  },

  async get(userId, id) {
    if (!userId || !id) return null;
    const ref = doc(getFirebaseDb(), "users", userId, COLLECTION, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return fromDoc(snap.id, snap.data() as Record<string, unknown>, userId);
  },

  async create(userId, record) {
    if (!userId) throw new AppError("permission_denied", "Not signed in.");
    const { clientRecordId, ...rest } = record;
    const id = stableRecordId(clientRecordId, "lhd");
    const ref = doc(getFirebaseDb(), "users", userId, COLLECTION, id);
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      return fromDoc(
        existingSnap.id,
        existingSnap.data() as Record<string, unknown>,
        userId
      );
    }

    const now = Date.now();
    const payload = letterheadDocToCloudStorage({
      ...rest,
      userId,
      createdAt: now,
      updatedAt: now,
    });
    (payload as Record<string, unknown>).id = id;
    await setDoc(ref, payload);
    log.info("doc created (firebase)");
    return fromDoc(id, payload as Record<string, unknown>, userId);
  },

  async update(userId, id, patch) {
    const ref = doc(getFirebaseDb(), "users", userId, COLLECTION, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AppError("not_found", "Letterhead document not found.");
    const existing = fromDoc(snap.id, snap.data() as Record<string, unknown>, userId);
    const next: LetterheadDocument = {
      ...existing,
      ...patch,
      input: patch.input ?? existing.input,
      updatedAt: Date.now(),
    };
    await setDoc(ref, letterheadDocToCloudStorage(next), { merge: true });
    return next;
  },

  async remove(userId, id) {
    const ref = doc(getFirebaseDb(), "users", userId, COLLECTION, id);
    try {
      await deleteDoc(ref);
      log.info("doc removed (firebase)");
    } catch (e) {
      log.warn("remove failed", e);
      throw new AppError("delete_failed", "Could not delete the document.");
    }
  },
};
