import type { Firestore } from "firebase/firestore";

import { AppError } from "@/domain/errors";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import type { EntryReminder } from "@/domain/types";
import { istMonthKeyForMillis } from "@/billing/istMonthKey";
import {
  runAtomicBillableCreate,
  type AtomicCreateHooks,
} from "@/billing/optionC/atomicBillableCreate";
import { stableRecordId } from "@/services/records/stableRecordId";
import { normaliseProfessionalPack, packToStorage } from "./normalize";

import type { CreateProfessionalPackInput } from "./types";

function reminderJson(r: EntryReminder | null) {
  if (!r) return null;
  return { at: r.at, note: r.note, notificationId: r.notificationId };
}

export function packFromFirestoreDoc(
  docId: string,
  data: Record<string, unknown>
): ProfessionalServicePack | null {
  return normaliseProfessionalPack({ ...data, id: docId }, "");
}

export async function createProfessionalPackAtomic(
  db: Firestore,
  userId: string,
  input: CreateProfessionalPackInput,
  hooks?: AtomicCreateHooks,
  nowMs = Date.now(),
  recordId = stableRecordId(input.clientRecordId, "psp")
): Promise<ProfessionalServicePack> {
  if (!userId) throw new AppError("permission_denied", "Not signed in.");
  const monthKey = istMonthKeyForMillis(nowMs);
  const result = await runAtomicBillableCreate({
    db,
    userId,
    collection: "professionalPacks",
    recordId,
    nowMs,
    monthKey,
    parseExisting: (id, data) => {
      const existing = packFromFirestoreDoc(id, data);
      if (!existing) {
        throw new AppError("save_failed", "Saved professional pack could not be read.");
      }
      return existing;
    },
    buildNew: () => {
      const pack: ProfessionalServicePack = {
        id: recordId,
        userId,
        ueid: input.ueid,
        professionalCategory: input.professionalCategory,
        matterType: input.matterType,
        title: input.title.trim(),
        facts: input.facts,
        linkedEntryIds: input.linkedEntryIds ?? [],
        attachments: input.attachments ?? [],
        matterDate: input.matterDate,
        dueDate: input.dueDate ?? null,
        reminder: input.reminder ?? null,
        status: input.status ?? "active",
        professionalName: input.professionalName?.trim() || null,
        professionalContact: input.professionalContact?.trim() || null,
        notes: input.notes?.trim() || null,
        pdfUri: input.pdfUri ?? null,
        createdAt: nowMs,
        updatedAt: nowMs,
        deletedAt: null,
      };
      const stored = packToStorage(pack);
      stored.pdfUri = null;
      stored.reminder = reminderJson(pack.reminder);
      stored.id = recordId;
      return { record: pack, payload: stored };
    },
    hooks,
  });
  return result.record;
}
