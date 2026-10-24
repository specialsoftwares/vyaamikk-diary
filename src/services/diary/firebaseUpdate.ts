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
import { currentAuthMutationGeneration } from "@/services/auth/authSessionFence";
import {
  commitExpectedRevision,
  nextContentRevision,
  RevisionConflict,
  settleIssuedWrite,
} from "@/services/privacy/expectedRevisionCommit";
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
  /** Production-only. Opens a sealed existing row before the edit is merged. */
  openExisting?: (entry: BusinessEntry, raw: Record<string, unknown>) => Promise<BusinessEntry>;
  /** Production-only. Returns the cloud document, with business fields sealed. */
  protectCloud?: (entry: BusinessEntry) => Promise<Record<string, unknown>>;
};

function cloudPatch(next: BusinessEntry): Record<string, unknown> {
  const patch = entryToCloudStorage(next);
  patch.reminder = reminderToJson(next.reminder);
  return patch;
}

function diaryOperationPresent(existing: BusinessEntry, edit: UpdateBusinessEntryInput): boolean {
  if (edit.title !== undefined && existing.title !== edit.title) return false;
  if (edit.entryDate !== undefined && existing.entryDate !== edit.entryDate) return false;
  if (edit.notes !== undefined && (existing.notes ?? null) !== (edit.notes ?? null)) return false;
  if (edit.status !== undefined && existing.status !== edit.status) return false;
  if (edit.pdfUri !== undefined && (existing.pdfUri ?? null) !== (edit.pdfUri ?? null)) return false;
  if (edit.reminder !== undefined && JSON.stringify(existing.reminder ?? null) !== JSON.stringify(edit.reminder)) return false;
  if (edit.location !== undefined && JSON.stringify(existing.location ?? null) !== JSON.stringify(edit.location)) return false;
  if (edit.attachments !== undefined && JSON.stringify(existing.attachments ?? []) !== JSON.stringify(edit.attachments)) return false;
  if (edit.payload !== undefined && JSON.stringify(existing.payload) !== JSON.stringify(edit.payload)) return false;
  return true;
}

function holdSealedPlaintextEdit(raw: Record<string, unknown>): void {
  if (raw.contentSeal && typeof raw.contentSeal === "object") {
    throw new AppError(
      "save_failed",
      "This edit is held while new protection is paused.",
      undefined,
      { reason: "sealed_edit_held" }
    );
  }
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

  if (deps.protectCloud) {
    const generationAtStart = currentAuthMutationGeneration();
    let lastIssued: unknown = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (currentAuthMutationGeneration() !== generationAtStart) {
        throw new AppError("permission_denied", "Sign in again.", undefined, { reason: "session_changed" });
      }
      const snap = await getDocFn(ref);
      if (!snap.exists()) throw new AppError("not_found", "Entry not found.");
      const raw = snap.data() as Record<string, unknown>;
      let existing = entryFromFirestoreDoc(snap.id, raw);
      if (!existing) throw new AppError("save_failed", "Entry could not be read.");
      if (deps.openExisting) existing = await deps.openExisting(existing, raw);
      if (expectedUpdatedAt != null && existing.updatedAt !== expectedUpdatedAt) {
        throw new AppError("save_failed", "Entry changed remotely.", undefined, { remoteChanged: true });
      }
      const next = buildDiaryUpdateRecord(existing, edit);
      const stamped = { ...next, updatedAt: nextContentRevision(existing.updatedAt, next.updatedAt) };
      const cancelId = reminderCancelIdAfterUpdate(existing, edit);
      const patch = await deps.protectCloud(stamped);
      try {
        await commitExpectedRevision({
          db,
          ref,
          expectedRevision: Number(raw.updatedAt),
          cloud: patch,
          generationAtStart,
          currentGeneration: currentAuthMutationGeneration,
        });
        await runAfterDiaryUpdateCommit(cancelId, deps.cancelNotification);
        return stamped;
      } catch (error) {
        if (error instanceof RevisionConflict) {
          if (expectedUpdatedAt != null) {
            throw new AppError("save_failed", "Entry changed remotely.", undefined, { remoteChanged: true });
          }
          lastIssued = null;
          continue;
        }
        const settled = await settleIssuedWrite({
          error,
          generationAtStart,
          currentGeneration: currentAuthMutationGeneration,
          inspect: async () => {
            const again = await getDocFn(ref);
            if (again.metadata?.fromCache === true) return { state: "cached" };
            if (!again.exists()) return { state: "deleted" };
            const againRaw = again.data() as Record<string, unknown>;
            let opened = entryFromFirestoreDoc(again.id, againRaw);
            if (!opened) return { state: "unavailable" };
            if (deps.openExisting) opened = await deps.openExisting(opened, againRaw);
            if (!opened) return { state: "unavailable" };
            return {
              state: "server",
              revisionMoved: Number(againRaw.updatedAt) !== Number(raw.updatedAt),
              operationPresent: diaryOperationPresent(opened, input),
              current: opened,
            };
          },
        });
        if (settled.action === "missing") throw new AppError("not_found", "Entry not found.");
        if (settled.action === "return" && settled.current) {
          await runAfterDiaryUpdateCommit(cancelId, deps.cancelNotification);
          return settled.current;
        }
        lastIssued = error;
      }
    }
    if (lastIssued) throw lastIssued;
    throw new AppError("save_failed", "This entry changed on another device. Try again.", undefined, {
      reason: "revision_conflict",
    });
  }

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
      holdSealedPlaintextEdit(snap.data() as Record<string, unknown>);
      tx.set(ref, cloudPatch(next), { merge: true });
      return { next, cancelId };
    });
    await runAfterDiaryUpdateCommit(committed.cancelId, deps.cancelNotification);
    return committed.next;
  }

  const snap = await getDocFn(ref);
  if (!snap.exists()) throw new AppError("not_found", "Entry not found.");
  const raw = snap.data() as Record<string, unknown>;
  holdSealedPlaintextEdit(raw);
  const existing = entryFromFirestoreDoc(snap.id, raw)!;
  const next = buildDiaryUpdateRecord(existing, edit);
  const cancelId = reminderCancelIdAfterUpdate(existing, edit);
  const patch = cloudPatch(next);
  await setDocFn(ref, patch, { merge: true });
  await runAfterDiaryUpdateCommit(cancelId, deps.cancelNotification);
  return next;
}
