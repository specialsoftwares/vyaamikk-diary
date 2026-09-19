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
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import type { EntryReminder } from "@/domain/types";
import { getFirebaseDb } from "@/config/firebase";
import { notificationsService } from "@/services/notifications";

import { packToCloudStorage } from "@/services/pdf/pdfCloudSync";
import { dedupeProfessionalPacks } from "./dedupe";
import { createProfessionalPackAtomic, packFromFirestoreDoc } from "./atomicCreate";
import type {
  ListProfessionalPacksOptions,
  ProfessionalPackRepository,
  UpdateProfessionalPackInput,
} from "./types";

function col(userId: string) {
  return collection(getFirebaseDb(), "users", userId, "professionalPacks");
}

function reminderJson(r: EntryReminder | null) {
  if (!r) return null;
  return { at: r.at, note: r.note, notificationId: r.notificationId };
}

function applyFilters(
  items: ProfessionalServicePack[],
  opts: ListProfessionalPacksOptions
): ProfessionalServicePack[] {
  let out = items;
  if (!opts.includeDeleted) out = out.filter((p) => !p.deletedAt);
  if (opts.category) out = out.filter((p) => p.professionalCategory === opts.category);
  if (opts.status) out = out.filter((p) => p.status === opts.status);
  if (opts.search?.trim()) {
    const needle = opts.search.trim().toLowerCase();
    out = out.filter((p) => {
      const blob = [
        p.title,
        p.notes ?? "",
        ...Object.values(p.facts).map(String),
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }
  if (opts.limit) out = out.slice(0, opts.limit);
  return out;
}

export const firebaseProfessionalPackRepository: ProfessionalPackRepository = {
  async create(userId, input) {
    return createProfessionalPackAtomic(getFirebaseDb(), userId, input);
  },

  async update(userId, input) {
    const ref = doc(getFirebaseDb(), "users", userId, "professionalPacks", input.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AppError("not_found", "Pack not found.");
    const existing = packFromFirestoreDoc(
      snap.id,
      snap.data() as Record<string, unknown>
    )!;

    if (input.reminder !== undefined && existing.reminder?.notificationId) {
      const willChange =
        input.reminder === null ||
        input.reminder.notificationId !== existing.reminder?.notificationId;
      if (willChange) await notificationsService.cancel(existing.reminder.notificationId);
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
        input.professionalName === undefined
          ? existing.professionalName
          : input.professionalName?.trim() || null,
      professionalContact:
        input.professionalContact === undefined
          ? existing.professionalContact
          : input.professionalContact?.trim() || null,
      notes: input.notes === undefined ? existing.notes : input.notes?.trim() || null,
      pdfUri: input.pdfUri === undefined ? existing.pdfUri : input.pdfUri,
      updatedAt: Date.now(),
    };
    const patch = packToCloudStorage(next);
    patch.reminder = reminderJson(next.reminder);
    await setDoc(ref, patch, { merge: true });
    return next;
  },

  async hardDelete(userId, id) {
    const ref = doc(getFirebaseDb(), "users", userId, "professionalPacks", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const existing = packFromFirestoreDoc(snap.id, snap.data() as Record<string, unknown>);
    if (existing?.reminder?.notificationId) {
      await notificationsService.cancel(existing.reminder.notificationId);
    }
    await deleteDoc(ref);
  },

  async softDelete(userId, id) {
    await this.hardDelete(userId, id);
  },

  async getByIdIncludingDeleted(userId, id) {
    const ref = doc(getFirebaseDb(), "users", userId, "professionalPacks", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return packFromFirestoreDoc(snap.id, snap.data() as Record<string, unknown>);
  },

  async getById(userId, id) {
    const ref = doc(getFirebaseDb(), "users", userId, "professionalPacks", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const pack = packFromFirestoreDoc(snap.id, snap.data() as Record<string, unknown>);
    if (!pack || pack.deletedAt) return null;
    return pack;
  },

  async list(userId, options = {}) {
    const q = query(col(userId), orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);
    const items = dedupeProfessionalPacks(
      snap.docs
        .map((d) => packFromFirestoreDoc(d.id, d.data() as Record<string, unknown>))
        .filter((x): x is ProfessionalServicePack => x !== null)
    );
    return applyFilters(items, options);
  },
};
