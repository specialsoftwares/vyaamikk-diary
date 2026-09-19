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
  type DocumentReference,
  type Firestore,
  type SetOptions,
} from "firebase/firestore";

import { AppError } from "@/domain/errors";
import { getFirebaseDb } from "@/config/firebase";
import { letterheadDocToCloudStorage } from "@/services/pdf/pdfCloudSync";
import { stableRecordId } from "@/services/records/stableRecordId";
import { assertDispatchedSession, type SyncSessionToken } from "@/sync/syncSessionOwnership";
import { createLogger } from "@/utils/logger";

import { createLetterheadDocumentAtomic } from "./atomicCreate";
import { parseLetterheadDocument } from "./documentParse";
import { isSupportedLetterheadParentInput } from "./letterheadMirrorPolicy";
import type { LetterheadDocument, LetterheadDocumentRepository } from "./types";

const log = createLogger("letterhead/docs-firebase");
const COLLECTION = "letterheadDocs";

function userDocsCollection(userId: string) {
  return collection(getFirebaseDb(), "users", userId, COLLECTION);
}

function fromDoc(id: string, raw: Record<string, unknown>, userId: string): LetterheadDocument {
  return parseLetterheadDocument(id, raw, userId);
}

export type LetterheadDocumentPatch = Parameters<LetterheadDocumentRepository["update"]>[2];

type LetterheadSnap = {
  exists: () => boolean;
  id: string;
  data: () => Record<string, unknown> | undefined;
};

export type LetterheadUpdateDbDeps = {
  getDoc?: (ref: DocumentReference) => Promise<LetterheadSnap>;
  setDoc?: (
    ref: DocumentReference,
    data: Record<string, unknown>,
    options?: SetOptions
  ) => Promise<unknown>;
  /** Test seam so production update can run without a live Firestore instance. */
  docRef?: DocumentReference;
  /**
   * Test-only barrier after the internal getDoc snapshot is obtained and
   * before the session recheck / setDoc. Must not recapture the live session.
   */
  afterInternalRead?: () => Promise<void>;
};

/**
 * Production parent UPDATE dispatch. Rechecks the originating token after
 * the internal getDoc await and before setDoc. Cloud payload always strips
 * device-local pdfUri.
 */
export async function updateLetterheadDocumentOnDb(
  db: Firestore,
  userId: string,
  id: string,
  patch: LetterheadDocumentPatch,
  session?: SyncSessionToken | null,
  deps: LetterheadUpdateDbDeps = {}
): Promise<LetterheadDocument> {
  const getDocFn = deps.getDoc ?? (getDoc as LetterheadUpdateDbDeps["getDoc"])!;
  const setDocFn = deps.setDoc ?? (setDoc as LetterheadUpdateDbDeps["setDoc"])!;
  const ref = deps.docRef ?? doc(db, "users", userId, COLLECTION, id);
  const snap = await getDocFn(ref);
  if (deps.afterInternalRead) await deps.afterInternalRead();
  if (!snap.exists()) throw new AppError("not_found", "Letterhead document not found.");
  const existing = fromDoc(snap.id, snap.data() as Record<string, unknown>, userId);
  const next: LetterheadDocument = {
    ...existing,
    ...patch,
    input: patch.input ?? existing.input,
    updatedAt: Date.now(),
  };
  if (patch.input !== undefined && !isSupportedLetterheadParentInput(next.input)) {
    throw new AppError("permission_denied", "Letterhead document is not valid.", undefined, {
      reason: "letterhead_parent_input_invalid",
    });
  }
  assertDispatchedSession(session, userId);
  await setDocFn(ref, letterheadDocToCloudStorage(next), { merge: true });
  return next;
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

  async create(userId, record, session) {
    if (!userId) throw new AppError("permission_denied", "Not signed in.");
    const nowMs = Date.now();
    const id = stableRecordId(record.clientRecordId, "lhd");
    const created = await createLetterheadDocumentAtomic(
      getFirebaseDb(),
      userId,
      record,
      session === undefined ? undefined : { session },
      nowMs,
      id
    );
    log.info("doc created (firebase)");
    return created;
  },

  async update(userId, id, patch, session) {
    return updateLetterheadDocumentOnDb(getFirebaseDb(), userId, id, patch, session);
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
