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
import { getActiveBackend } from "@/config/env";
import { getFirebaseDb } from "@/config/firebase";
import { shouldSealProductionWrites } from "@/constants/contentSeal";
import { entrySearchBlob } from "@/utils/businessEntry/display";
import { notificationsService } from "@/services/notifications";
import { stableRecordId } from "@/services/records/stableRecordId";
import { isDiaryContentSeal } from "@/services/privacy/diarySealDocument";
import { openSealedDiaryEntry, sealDiaryCloudPayload } from "@/services/privacy/ownerContentApi";
import type { SyncSessionToken } from "@/sync/syncSessionOwnership";

import { dedupeDiaryEntries } from "@/services/dashboard/diaryRecordCounts";
import {
  buildNewDiaryEntry,
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

function productionSeals(): boolean {
  return shouldSealProductionWrites(getActiveBackend());
}

async function materializeDiary(
  userId: string,
  id: string,
  data: Record<string, unknown>
): Promise<BusinessEntry | null> {
  const entry = entryFromFirestoreDoc(id, data);
  if (!entry) return null;
  if (!isDiaryContentSeal(data.contentSeal)) return entry;
  return openSealedDiaryEntry(userId, entry, data.contentSeal);
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
  async create(userId, input, session) {
    return (await this.createWithOutcome(userId, input, session)).record;
  },

  async createWithOutcome(userId, input, session?: SyncSessionToken | null): Promise<DiaryCreateResult> {
    const nowMs = Date.now();
    const recordId = stableRecordId(input.clientRecordId, "en");
    let cloudPayload: ((record: BusinessEntry) => Record<string, unknown>) | undefined;
    if (productionSeals()) {
      const draft = buildNewDiaryEntry(userId, recordId, input, nowMs);
      const sealed = await sealDiaryCloudPayload(draft);
      cloudPayload = (record) => {
        if (record.id !== draft.id || record.updatedAt !== draft.updatedAt) {
          throw new Error("seal_revision_mismatch");
        }
        return sealed;
      };
    }
    const result = await createEntryAtomicDetailed(
      getFirebaseDb(),
      userId,
      input,
      session === undefined ? undefined : { session },
      nowMs,
      recordId,
      cloudPayload
    );
    return { record: result.record, outcome: result.outcome };
  },

  async update(userId, input) {
    const seal = productionSeals();
    return updateDiaryEntryOnDb(getFirebaseDb(), userId, input, {
      cancelNotification: (id) => notificationsService.cancel(id),
      openExisting: seal
        ? async (entry, raw) =>
            isDiaryContentSeal(raw.contentSeal)
              ? openSealedDiaryEntry(userId, entry, raw.contentSeal)
              : entry
        : undefined,
      protectCloud: seal ? sealDiaryCloudPayload : undefined,
    });
  },

  async hardDelete(userId, id) {
    const ref = doc(getFirebaseDb(), "users", userId, "entries", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const existing = await materializeDiary(userId, snap.id, snap.data() as Record<string, unknown>);
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
    return materializeDiary(userId, snap.id, snap.data() as Record<string, unknown>);
  },

  async list(userId, options = {}) {
    const q = query(entriesCollection(userId), orderBy("entryDate", "desc"));
    const snap = await getDocs(q);
    const opened = await Promise.all(
      snap.docs.map((d) => materializeDiary(userId, d.id, d.data() as Record<string, unknown>))
    );
    const entries = dedupeDiaryEntries(opened.filter((x): x is BusinessEntry => x !== null));
    return applyFilters(entries, options);
  },
};
