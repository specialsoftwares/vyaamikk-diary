import { doc, getDoc, type DocumentReference, type DocumentSnapshot, type Firestore } from "firebase/firestore";

import { AppError } from "@/domain/errors";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import type { EntryReminder } from "@/domain/types";
import { currentAuthMutationGeneration } from "@/services/auth/authSessionFence";
import { publishDomainChange } from "@/services/dataChanges/domainChanges";
import { packToCloudStorage } from "@/services/pdf/pdfCloudSync";
import { openBusinessCloud, protectBusinessCloud } from "@/services/privacy/businessCloudSeal";
import {
  commitExpectedRevision,
  nextContentRevision,
  RevisionConflict,
  settleIssuedWrite,
} from "@/services/privacy/expectedRevisionCommit";

import { packFromFirestoreDoc } from "./atomicCreate";
import type { UpdateProfessionalPackInput } from "./types";

function reminderJson(reminder: EntryReminder | null) {
  if (!reminder) return null;
  return { at: reminder.at, note: reminder.note, notificationId: reminder.notificationId };
}

async function materializePack(id: string, raw: Record<string, unknown>) {
  const pack = packFromFirestoreDoc(id, raw);
  if (!pack) return null;
  return openBusinessCloud("professionalPacks", pack, raw);
}

function packEffectPresent(stored: ProfessionalServicePack, proposed: ProfessionalServicePack): boolean {
  const { updatedAt: _storedAt, ...left } = stored;
  const { updatedAt: _proposedAt, ...right } = proposed;
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function updateProfessionalPackOnDb(
  db: Firestore,
  userId: string,
  input: UpdateProfessionalPackInput,
  deps?: {
    ref?: DocumentReference;
    read?: (ref: DocumentReference) => Promise<DocumentSnapshot>;
    cancelNotification?: (id: string) => Promise<void>;
  }
): Promise<ProfessionalServicePack> {
  const ref = deps?.ref ?? doc(db, "users", userId, "professionalPacks", input.id);
  const read = deps?.read ?? getDoc;
  const generationAtStart = currentAuthMutationGeneration();
  let lastIssued: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (currentAuthMutationGeneration() !== generationAtStart) {
      throw new AppError("permission_denied", "Sign in again.", undefined, { reason: "session_changed" });
    }
    const snap = await read(ref);
    if (!snap.exists()) throw new AppError("not_found", "Pack not found.");
    const existingRaw = snap.data() as Record<string, unknown>;
    const existing = await materializePack(snap.id, existingRaw);
    if (!existing) throw new AppError("save_failed", "Pack could not be read.");

    if (input.reminder !== undefined && existing.reminder?.notificationId && deps?.cancelNotification) {
      const willChange =
        input.reminder === null || input.reminder.notificationId !== existing.reminder.notificationId;
      if (willChange) await deps.cancelNotification(existing.reminder.notificationId);
    }

    const next: ProfessionalServicePack = {
      ...existing,
      title: input.title?.trim() ?? existing.title,
      facts: input.facts ?? existing.facts,
      linkedEntryIds: input.linkedEntryIds ?? existing.linkedEntryIds,
      attachments: input.attachments ?? existing.attachments,
      matterDate: input.matterDate ?? existing.matterDate,
      dueDate: input.dueDate === undefined ? existing.dueDate : input.dueDate,
      reminder: input.reminder === undefined ? existing.reminder : input.reminder,
      status: input.status ?? existing.status,
      professionalName:
        input.professionalName === undefined ? existing.professionalName : input.professionalName?.trim() || null,
      professionalContact:
        input.professionalContact === undefined
          ? existing.professionalContact
          : input.professionalContact?.trim() || null,
      notes: input.notes === undefined ? existing.notes : input.notes?.trim() || null,
      pdfUri: input.pdfUri === undefined ? existing.pdfUri : input.pdfUri,
      updatedAt: nextContentRevision(existing.updatedAt, Date.now()),
    };
    const patch = packToCloudStorage(next);
    patch.reminder = reminderJson(next.reminder);
    try {
      const cloud = await protectBusinessCloud({
        collection: "professionalPacks",
        userId,
        recordId: next.id,
        revision: next.updatedAt,
        plain: patch,
        existingRaw,
      });
      await commitExpectedRevision({
        db,
        ref,
        expectedRevision: Number(existingRaw.updatedAt),
        cloud,
        generationAtStart,
        currentGeneration: currentAuthMutationGeneration,
      });
      publishDomainChange(userId, "professionalPack", { effect: "upsert", recordId: next.id });
      return next;
    } catch (error) {
      if (error instanceof RevisionConflict) {
        lastIssued = null;
        continue;
      }
      const settled = await settleIssuedWrite({
        error,
        generationAtStart,
        currentGeneration: currentAuthMutationGeneration,
        inspect: async () => {
          const again = await read(ref);
          if (again.metadata?.fromCache === true) return { state: "cached" };
          if (!again.exists()) return { state: "deleted" };
          const againRaw = again.data() as Record<string, unknown>;
          const opened = await materializePack(again.id, againRaw);
          if (!opened) return { state: "unavailable" };
          return {
            state: "server",
            revisionMoved: Number(againRaw.updatedAt) !== Number(existingRaw.updatedAt),
            operationPresent: packEffectPresent(opened, next),
            current: opened,
          };
        },
      });
      if (settled.action === "missing") throw new AppError("not_found", "Pack not found.");
      if (settled.action === "return" && settled.current) {
        publishDomainChange(userId, "professionalPack", { effect: "upsert", recordId: settled.current.id });
        return settled.current;
      }
      lastIssued = error;
    }
  }
  if (lastIssued) throw lastIssued;
  throw new AppError("save_failed", "This pack changed on another device. Try again.", undefined, {
    reason: "revision_conflict",
  });
}
