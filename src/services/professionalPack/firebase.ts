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

import type { ProfessionalServicePack } from "@/domain/professionalPack";
import { getFirebaseDb } from "@/config/firebase";
import { notificationsService } from "@/services/notifications";

import {
  openBusinessCloud,
  settleCreatedBusinessCloud,
  prepareBusinessCreate,
} from "@/services/privacy/businessCloudSeal";
import { updateProfessionalPackOnDb } from "./revisionUpdate";
import { dedupeProfessionalPacks } from "./dedupe";
import { createProfessionalPackAtomic, packFromFirestoreDoc } from "./atomicCreate";
import type { ListProfessionalPacksOptions, ProfessionalPackRepository } from "./types";

async function materializePack(id: string, raw: Record<string, unknown>) {
  const pack = packFromFirestoreDoc(id, raw);
  if (!pack) return null;
  return openBusinessCloud("professionalPacks", pack, raw);
}

function col(userId: string) {
  return collection(getFirebaseDb(), "users", userId, "professionalPacks");
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
    const record = await createProfessionalPackAtomic(getFirebaseDb(), userId, input, {
      prepareCloudPayload: prepareBusinessCreate("professionalPacks", userId),
    });
    return settleCreatedBusinessCloud({
      collection: "professionalPacks",
      userId,
      record,
      readRaw: async () => {
        const snap = await getDoc(doc(getFirebaseDb(), "users", userId, "professionalPacks", record.id));
        return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      },
      writeCloud: async (cloud) => {
        await setDoc(doc(getFirebaseDb(), "users", userId, "professionalPacks", record.id), cloud, {
          merge: true,
        });
      },
    });
  },

  async update(userId, input) {
    return updateProfessionalPackOnDb(getFirebaseDb(), userId, input, {
      cancelNotification: (id) => notificationsService.cancel(id),
    });
  },

  async hardDelete(userId, id) {
    const ref = doc(getFirebaseDb(), "users", userId, "professionalPacks", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const existing = await materializePack(snap.id, snap.data() as Record<string, unknown>);
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
    return materializePack(snap.id, snap.data() as Record<string, unknown>);
  },

  async getById(userId, id) {
    const ref = doc(getFirebaseDb(), "users", userId, "professionalPacks", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const pack = await materializePack(snap.id, snap.data() as Record<string, unknown>);
    if (!pack || pack.deletedAt) return null;
    return pack;
  },

  async list(userId, options = {}) {
    const q = query(col(userId), orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);
    const opened = await Promise.all(
      snap.docs.map((d) => materializePack(d.id, d.data() as Record<string, unknown>))
    );
    const items = dedupeProfessionalPacks(
      opened.filter((x): x is ProfessionalServicePack => x !== null)
    );
    return applyFilters(items, options);
  },
};
