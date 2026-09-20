/**
 * Production diary UPDATE write path. Transaction callbacks perform only
 * transactional reads, pure record construction, and transactional writes.
 * Notification cancellation happens after commit.
 */

import {
  doc,
  getDoc,
  runTransaction,
  setDoc,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase/firestore";

import { AppError } from "@/domain/errors";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { EntryReminder } from "@/domain/types";
import { entryFromFirestoreDoc } from "./atomicCreate";
import { entryToCloudStorage } from "@/services/pdf/pdfCloudSync";
import type { UpdateBusinessEntryInput } from "./types";
import {
  buildDiaryUpdateRecord,
  reminderCancelIdAfterUpdate,
  runAfterDiaryUpdateCommit,
} from "./firebaseUpdatePlan";

function reminderToJson(r: EntryReminder | null) {
  if (!r) return null;
  return { at: r.at, note: r.note, notificationId: r.notificationId };
}

export type DiaryUpdateDbDeps = {
  cancelNotification: (id: string) => Promise<void>;
  runTransaction?: typeof runTransaction;
  getDoc?: typeof getDoc;
  setDoc?: typeof setDoc;
  /** Test seam for fake transactions. Production uses `doc(db, ...)`. */
  docRef?: DocumentReference;
};

function cloudPatch(next: BusinessEntry): Record<string, unknown> {
  const patch = entryToCloudStorage(next);
  patch.reminder = reminderToJson(next.reminder);
  return patch;
}

export async function updateDiaryEntryOnDb(
  db: Firestore,
  userId: string,
  input: UpdateBusinessEntryInput,
  deps: DiaryUpdateDbDeps
): Promise<BusinessEntry> {
  const { expectedUpdatedAt, ...edit } = input;
  const ref = deps.docRef ?? doc(db, "users", userId, "entries", input.id);
  const txFn = deps.runTransaction ?? runTransaction;
  const getDocFn = deps.getDoc ?? getDoc;
  const setDocFn = deps.setDoc ?? setDoc;

  if (expectedUpdatedAt != null) {
    const committed = await txFn(db, async (tx: Transaction) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new AppError("not_found", "Entry not found.");
      const existing = entryFromFirestoreDoc(snap.id, snap.data() as Record<string, unknown>)!;
      if (existing.updatedAt !== expectedUpdatedAt) {
        throw new AppError("save_failed", "Entry changed remotely.", undefined, { remoteChanged: true });
      }
      const next = buildDiaryUpdateRecord(existing, edit);
      const cancelId = reminderCancelIdAfterUpdate(existing, edit);
      tx.set(ref, cloudPatch(next), { merge: true });
      return { next, cancelId };
    });
    await runAfterDiaryUpdateCommit(committed.cancelId, deps.cancelNotification);
    return committed.next;
  }

  const snap = await getDocFn(ref);
  if (!snap.exists()) throw new AppError("not_found", "Entry not found.");
  const existing = entryFromFirestoreDoc(snap.id, snap.data() as Record<string, unknown>)!;
  const next = buildDiaryUpdateRecord(existing, edit);
  const cancelId = reminderCancelIdAfterUpdate(existing, edit);
  const patch = cloudPatch(next);
  await setDocFn(ref, patch, { merge: true });
  await runAfterDiaryUpdateCommit(cancelId, deps.cancelNotification);
  return next;
}
