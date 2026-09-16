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
} from "firebase/firestore";

import type { BusinessEntry } from "@/domain/businessEntry";
import { getFirebaseDb } from "@/config/firebase";
import { entrySearchBlob } from "@/utils/businessEntry/display";
import { notificationsService } from "@/services/notifications";

import { dedupeDiaryEntries } from "@/services/dashboard/diaryRecordCounts";
import {
  createEntryAtomicDetailed,
  entryFromFirestoreDoc,
} from "./atomicCreate";
import { updateDiaryEntryOnDb } from "./firebaseUpdate";
import type {
  DiaryCreateResult,
  DiaryRepository,
  ListDiaryEntriesOptions,
} from "./types";

function entriesCollection(userId: string) {
  return collection(getFirebaseDb(), "users", userId, "entries");
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
    return (await this.createWithOutcome(userId, input)).record;
  },

  async createWithOutcome(userId, input): Promise<DiaryCreateResult> {
    const result = await createEntryAtomicDetailed(getFirebaseDb(), userId, input);
    return { record: result.record, outcome: result.outcome };
  },

  async update(userId, input) {
    return updateDiaryEntryOnDb(getFirebaseDb(), userId, input, {
      cancelNotification: (id) => notificationsService.cancel(id),
    });
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
