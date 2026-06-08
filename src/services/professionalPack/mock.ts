import AsyncStorage from "@react-native-async-storage/async-storage";

import { AppError } from "@/domain/errors";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import { shortId } from "@/utils/id";
import { notificationsService } from "@/services/notifications";
import { createLogger } from "@/utils/logger";

import { dedupeProfessionalPacks } from "./dedupe";
import { normaliseProfessionalPack, packToStorage } from "./normalize";
import type {
  CreateProfessionalPackInput,
  ListProfessionalPacksOptions,
  ProfessionalPackRepository,
  UpdateProfessionalPackInput,
} from "./types";

const log = createLogger("professionalPack/mock");
const KEY_PREFIX = "vyd_pro_pack_v1_";

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

async function loadAll(userId: string): Promise<ProfessionalServicePack[]> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((row) => normaliseProfessionalPack(row))
      .filter((x): x is ProfessionalServicePack => x !== null);
  } catch {
    return [];
  }
}

async function saveAll(userId: string, items: ProfessionalServicePack[]): Promise<void> {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(items.map(packToStorage)));
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
        p.professionalName ?? "",
        p.matterType,
        ...Object.values(p.facts).map(String),
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  if (opts.limit && opts.limit > 0) out = out.slice(0, opts.limit);
  return out;
}

export const mockProfessionalPackRepository: ProfessionalPackRepository = {
  async create(userId, input) {
    const now = Date.now();
    const pack: ProfessionalServicePack = {
      id: shortId("psp"),
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
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const all = await loadAll(userId);
    all.unshift(pack);
    await saveAll(userId, all);
    log.info("pack created");
    return pack;
  },

  async update(userId, input) {
    const all = await loadAll(userId);
    const idx = all.findIndex((p) => p.id === input.id);
    if (idx === -1) throw new AppError("not_found", "Pack not found.");

    const existing = all[idx];
    if (input.reminder !== undefined) {
      const was = existing.reminder?.notificationId;
      const willChange =
        input.reminder === null ||
        input.reminder?.notificationId !== existing.reminder?.notificationId;
      if (was && willChange) await notificationsService.cancel(was);
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
    all[idx] = next;
    await saveAll(userId, all);
    return next;
  },

  async hardDelete(userId, id) {
    const all = await loadAll(userId);
    const existing = all.find((p) => p.id === id);
    if (!existing) throw new AppError("not_found", "Pack not found.");
    if (existing.reminder?.notificationId) {
      await notificationsService.cancel(existing.reminder.notificationId);
    }
    await saveAll(
      userId,
      all.filter((p) => p.id !== id)
    );
  },

  async softDelete(userId, id) {
    await this.hardDelete(userId, id);
  },

  async getByIdIncludingDeleted(userId, id) {
    const all = await loadAll(userId);
    return all.find((p) => p.id === id) ?? null;
  },

  async getById(userId, id) {
    const all = await loadAll(userId);
    const pack = all.find((p) => p.id === id);
    if (!pack || pack.deletedAt) return null;
    return pack;
  },

  async list(userId, options = {}) {
    return applyFilters(dedupeProfessionalPacks(await loadAll(userId)), options);
  },
};
