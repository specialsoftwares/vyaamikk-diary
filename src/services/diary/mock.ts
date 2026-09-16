/**
 * Dev diary repository backed by AsyncStorage (Business Entry v2 schema).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { AppError } from "@/domain/errors";
import type { BusinessEntry } from "@/domain/businessEntry";
import { shortId } from "@/utils/id";
import { entrySearchBlob } from "@/utils/businessEntry/display";
import { notificationsService } from "@/services/notifications";

import { createInitialDocumentHistory } from "@/services/documentHistory";
import { mergeBusinessEntryUpdate, mergeEntryPdfGeneration } from "./mergeEntryUpdate";
import { entryToStorage, normaliseBusinessEntry } from "./normalize";
import type {
  CreateBusinessEntryInput,
  DiaryRepository,
  ListDiaryEntriesOptions,
  UpdateBusinessEntryInput,
} from "./types";

const KEY_PREFIX = "vyd_diary_v2_";
const KEY_PREFIX_V1 = "vyd_diary_v1_";

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

async function loadAll(userId: string): Promise<BusinessEntry[]> {
  let raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) {
    const legacy = await AsyncStorage.getItem(`${KEY_PREFIX_V1}${userId}`);
    if (legacy) {
      await AsyncStorage.setItem(keyFor(userId), legacy);
      raw = legacy;
    }
  }
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((row) => normaliseBusinessEntry(row))
      .filter((x): x is BusinessEntry => x !== null);
  } catch {
    return [];
  }
}

async function saveAll(userId: string, items: BusinessEntry[]): Promise<void> {
  await AsyncStorage.setItem(
    keyFor(userId),
    JSON.stringify(items.map(entryToStorage))
  );
}

function applyFilters(
  entries: BusinessEntry[],
  options: ListDiaryEntriesOptions
): BusinessEntry[] {
  let out = entries;
  if (!options.includeDeleted) {
    out = out.filter((e) => !e.deletedAt);
  }
  if (options.entryType) {
    out = out.filter((e) => e.entryType === options.entryType);
  }
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
  out.sort((a, b) => b.entryDate - a.entryDate || b.createdAt - a.createdAt);
  if (options.limit && options.limit > 0) {
    out = out.slice(0, options.limit);
  }
  return out;
}

export const mockDiaryRepository: DiaryRepository = {
  async create(userId, input) {
    const now = Date.now();
    const id = input.clientRecordId?.trim() || shortId("diary");
    const existing = (await loadAll(userId)).find((e) => e.id === id);
    if (existing) return existing;
    const entry: BusinessEntry = {
      id,
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
    const all = await loadAll(userId);
    all.unshift(entry);
    await saveAll(userId, all);
    return entry;
  },

  async update(userId, input) {
    const all = await loadAll(userId);
    const idx = all.findIndex((e) => e.id === input.id);
    if (idx === -1) throw new AppError("not_found", "Entry not found.");
    const existing = all[idx];

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
    if (input.pdfUri !== undefined && input.pdfUri !== existing.pdfUri && input.pdfUri) {
      next = mergeEntryPdfGeneration(next, input.pdfUri);
    }
    all[idx] = next;
    await saveAll(userId, all);
    return next;
  },

  async hardDelete(userId, id) {
    const all = await loadAll(userId);
    const existing = all.find((e) => e.id === id);
    if (!existing) throw new AppError("not_found", "Entry not found.");
    if (existing.reminder?.notificationId) {
      await notificationsService.cancel(existing.reminder.notificationId);
    }
    await saveAll(
      userId,
      all.filter((e) => e.id !== id)
    );
  },

  async softDelete(userId, id) {
    await this.hardDelete(userId, id);
  },

  async getByIdIncludingDeleted(userId, id) {
    const all = await loadAll(userId);
    return all.find((e) => e.id === id) ?? null;
  },

  async getById(userId, id) {
    const all = await loadAll(userId);
    const found = all.find((e) => e.id === id);
    if (!found || found.deletedAt) return null;
    return found;
  },

  async list(userId, options = {}) {
    const all = await loadAll(userId);
    return applyFilters(all, options);
  },
};
