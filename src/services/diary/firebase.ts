/**
 * Firestore-backed diary repository (Business Entry v2 schema).
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
import type { BusinessEntry } from "@/domain/businessEntry";
import type { EntryReminder } from "@/domain/types";
import { getFirebaseDb } from "@/config/firebase";
import { entrySearchBlob } from "@/utils/businessEntry/display";
import { notificationsService } from "@/services/notifications";

import { createInitialDocumentHistory } from "@/services/documentHistory";
import { mergeBusinessEntryUpdate, mergeEntryPdfGeneration } from "./mergeEntryUpdate";
import { entryToCloudStorage } from "@/services/pdf/pdfCloudSync";
import { dedupeDiaryEntries } from "@/services/dashboard/diaryRecordCounts";
import { normaliseBusinessEntry } from "./normalize";
import type {
  CreateBusinessEntryInput,
  DiaryRepository,
  ListDiaryEntriesOptions,
  UpdateBusinessEntryInput,
} from "./types";

function entriesCollection(userId: string) {
  return collection(getFirebaseDb(), "users", userId, "entries");
}

function reminderToJson(r: EntryReminder | null) {
  if (!r) return null;
  return { at: r.at, note: r.note, notificationId: r.notificationId };
}

/** Firestore doc id wins — stored `id` field may be empty from legacy creates. */
function entryFromFirestoreDoc(
  docId: string,
  data: Record<string, unknown>
): BusinessEntry | null {
  return normaliseBusinessEntry({ ...data, id: docId }, "");
}

function applyFilters(
  entries: BusinessEntry[],
  options: ListDiaryEntriesOptions
): BusinessEntry[] {
  let out = entries;
  if (!options.includeDeleted) out = out.filter((e) => !e.deletedAt);
  if (options.entryType) out = out.filter((e) => e.entryType === options.entryType);
  if (options.upcomingOnly) {
    const now = Date.now();
    out = out.filter((e) => e.reminder && e.reminder.at > now);
  }
  if (options.search) {
    const needle = options.search.trim().toLowerCase();
    if (needle) {
      out = out.filter((e) => entrySearchBlob(e).includes(needle));
    }
  }
  if (options.limit) out = out.slice(0, options.limit);
  return out;
}

export const firebaseDiaryRepository: DiaryRepository = {
  async create(userId, input) {
    const now = Date.now();
    const ref = input.clientRecordId
      ? doc(getFirebaseDb(), "users", userId, "entries", input.clientRecordId)
      : doc(entriesCollection(userId));

    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      const existing = entryFromFirestoreDoc(
        existingSnap.id,
        existingSnap.data() as Record<string, unknown>
      );
      if (existing) return existing;
    }

    const entry: BusinessEntry = {
      id: ref.id,
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
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const stored = entryToCloudStorage(entry);
    stored.reminder = reminderToJson(entry.reminder);
    stored.id = ref.id;
    await setDoc(ref, stored);
    return entry;
  },

  async update(userId, input) {
    const ref = doc(getFirebaseDb(), "users", userId, "entries", input.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AppError("not_found", "Entry not found.");
    const existing = entryFromFirestoreDoc(snap.id, snap.data() as Record<string, unknown>)!;

    if (input.reminder !== undefined) {
      const wasScheduled = existing.reminder?.notificationId ?? null;
      const willBeDifferent =
        input.reminder === null ||
        input.reminder.notificationId !== existing.reminder?.notificationId;
      if (wasScheduled && willBeDifferent) {
        await notificationsService.cancel(wasScheduled);
      }
    }

    let next = mergeBusinessEntryUpdate(existing, input);
    if (input.pdfUri !== undefined && input.pdfUri) {
      next = mergeEntryPdfGeneration(next, input.pdfUri);
    }
    const patch = entryToCloudStorage(next);
    patch.reminder = reminderToJson(next.reminder);
    await setDoc(ref, patch, { merge: true });
    return next;
  },

  async hardDelete(userId, id) {
    const ref = doc(getFirebaseDb(), "users", userId, "entries", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const existing = entryFromFirestoreDoc(snap.id, snap.data() as Record<string, unknown>);
    if (existing?.reminder?.notificationId) {
      await notificationsService.cancel(existing.reminder.notificationId);
    }
    await deleteDoc(ref);
  },

  async softDelete(userId, id) {
    await this.hardDelete(userId, id);
  },

  async getById(userId, id) {
    const entry = await this.getByIdIncludingDeleted!(userId, id);
    if (!entry || entry.deletedAt) return null;
    return entry;
  },

  async getByIdIncludingDeleted(userId, id) {
    const ref = doc(getFirebaseDb(), "users", userId, "entries", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return entryFromFirestoreDoc(snap.id, snap.data() as Record<string, unknown>);
  },

  async list(userId, options = {}) {
    const q = query(entriesCollection(userId), orderBy("entryDate", "desc"));
    const snap = await getDocs(q);
    const entries = dedupeDiaryEntries(
      snap.docs
        .map((d) => entryFromFirestoreDoc(d.id, d.data() as Record<string, unknown>))
        .filter((x): x is BusinessEntry => x !== null)
    );
    return applyFilters(entries, options);
  },
};
