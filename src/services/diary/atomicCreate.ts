import type { Firestore } from "firebase/firestore";

import { AppError } from "@/domain/errors";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { EntryReminder } from "@/domain/types";
import { istMonthKeyForMillis } from "@/billing/istMonthKey";
import {
  runAtomicBillableCreate,
  type AtomicCreateHooks,
} from "@/billing/optionC/atomicBillableCreate";
import { stableRecordId } from "@/services/records/stableRecordId";
import { createInitialDocumentHistory } from "@/services/documentHistory/core";
import { normaliseBusinessEntry } from "./normalize";
import type { CreateBusinessEntryInput } from "./types";

function reminderToJson(r: EntryReminder | null) {
  if (!r) return null;
  return { at: r.at, note: r.note, notificationId: r.notificationId };
}

export function entryFromFirestoreDoc(
  docId: string,
  data: Record<string, unknown>
): BusinessEntry | null {
  return normaliseBusinessEntry({ ...data, id: docId }, "");
}

export function buildNewDiaryEntry(
  userId: string,
  recordId: string,
  input: CreateBusinessEntryInput,
  nowMs: number
): BusinessEntry {
  return {
    id: recordId,
    userId,
    ueid: input.ueid,
    entryType: input.entryType,
    title: input.title.trim(),
    entryDate: input.entryDate,
    notes: input.notes?.trim() || null,
    reminder: input.reminder ?? null,
    location: input.location ?? null,
    attachments: input.attachments ?? [],
    payload: input.payload,
    pdfUri: null,
    documentHistory: createInitialDocumentHistory(),
    source: input.source ?? "composer",
    status: input.status ?? "active",
    createdAt: nowMs,
    updatedAt: nowMs,
    deletedAt: null,
  };
}

export function diaryEntryToCloudPayload(entry: BusinessEntry): Record<string, unknown> {
  return {
    id: entry.id,
    userId: entry.userId,
    ueid: entry.ueid,
    entryType: entry.entryType,
    title: entry.title,
    entryDate: entry.entryDate,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    source: entry.source,
    status: entry.status,
    notes: entry.notes,
    reminder: reminderToJson(entry.reminder),
    location: entry.location,
    attachments: entry.attachments,
    payload: entry.payload,
    pdfUri: null,
    documentHistory: entry.documentHistory,
    deletedAt: entry.deletedAt,
  };
}

/**
 * Production diary CREATE. Same function for online create, local-first
 * remote attempt, queued flush, and replay after an ambiguous response.
 *
 * Record ID is resolved by the caller (or defaulted once here) and reused
 * on transaction retries. Notifications, PDF and local writes stay outside
 * the Firestore transaction callback.
 */
export async function createEntryAtomic(
  db: Firestore,
  userId: string,
  input: CreateBusinessEntryInput,
  hooks?: AtomicCreateHooks,
  nowMs = Date.now(),
  recordId = stableRecordId(input.clientRecordId, "en")
): Promise<BusinessEntry> {
  const result = await createEntryAtomicDetailed(db, userId, input, hooks, nowMs, recordId);
  return result.record;
}

export async function createEntryAtomicDetailed(
  db: Firestore,
  userId: string,
  input: CreateBusinessEntryInput,
  hooks?: AtomicCreateHooks,
  nowMs = Date.now(),
  recordId = stableRecordId(input.clientRecordId, "en")
) {
  if (!userId) throw new AppError("permission_denied", "Not signed in.");
  const monthKey = istMonthKeyForMillis(nowMs);
  return runAtomicBillableCreate({
    db,
    userId,
    collection: "entries",
    recordId,
    nowMs,
    monthKey,
    parseExisting: (id, data) => {
      const existing = entryFromFirestoreDoc(id, data);
      if (!existing) {
        throw new AppError("save_failed", "Saved diary entry could not be read.");
      }
      return existing;
    },
    buildNew: () => {
      const record = buildNewDiaryEntry(userId, recordId, input, nowMs);
      return { record, payload: diaryEntryToCloudPayload(record) };
    },
    hooks,
  });
}
