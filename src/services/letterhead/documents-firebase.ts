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

import { createLetterheadDocumentAtomic } from "./atomicCreate";
import { parseLetterheadDocument } from "./documentParse";
import type { LetterheadDocument, LetterheadDocumentRepository } from "./types";

const log = createLogger("letterhead/docs-firebase");
const COLLECTION = "letterheadDocs";

function userDocsCollection(userId: string) {
  return collection(getFirebaseDb(), "users", userId, COLLECTION);
}

function fromDoc(id: string, raw: Record<string, unknown>, userId: string): LetterheadDocument {
  return parseLetterheadDocument(id, raw, userId);
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
    const nowMs = Date.now();
    const id = stableRecordId(record.clientRecordId, "lhd");
    const created = await createLetterheadDocumentAtomic(
      getFirebaseDb(),
      userId,
      record,
      undefined,
      nowMs,
      id
    );
    log.info("doc created (firebase)");
    return created;
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
