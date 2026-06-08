/**
 * AsyncStorage-backed letterhead-documents repository (local-mock mode only).
 *
 * Layout: vyd_letterhead_docs_v1_<userId> → JSON array of LetterheadDocument.
 * Cross-device sync is not possible in this mode — see the shared-dev
 * repository for that.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { AppError } from "@/domain/errors";
import { stableRecordId } from "@/services/records/stableRecordId";
import { createLogger } from "@/utils/logger";

import type { LetterheadDocument, LetterheadDocumentRepository } from "./types";

const log = createLogger("letterhead/docs-mock");
const KEY_PREFIX = "vyd_letterhead_docs_v1_";

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

async function loadAll(userId: string): Promise<LetterheadDocument[]> {
  if (!userId) return [];
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as LetterheadDocument[]) : [];
  } catch {
    return [];
  }
}

async function persist(userId: string, items: LetterheadDocument[]): Promise<void> {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(items));
}

export const mockLetterheadDocumentRepository: LetterheadDocumentRepository = {
  async list(userId) {
    const all = await loadAll(userId);
    return all.sort((a, b) => b.createdAt - a.createdAt);
  },

  async get(userId, id) {
    const all = await loadAll(userId);
    return all.find((d) => d.id === id) ?? null;
  },

  async create(userId, record) {
    if (!userId) throw new AppError("permission_denied", "Not signed in.");
    const { clientRecordId, ...rest } = record;
    const id = stableRecordId(clientRecordId, "lhd");
    const existing = (await loadAll(userId)).find((d) => d.id === id);
    if (existing) return existing;

    const now = Date.now();
    const doc: LetterheadDocument = {
      ...rest,
      id,
      userId,
      createdAt: now,
      updatedAt: now,
    };
    const all = await loadAll(userId);
    all.unshift(doc);
    await persist(userId, all);
    log.info("doc created");
    return doc;
  },

  async update(userId, id, patch) {
    const all = await loadAll(userId);
    const idx = all.findIndex((d) => d.id === id);
    if (idx === -1) throw new AppError("not_found", "Letterhead document not found.");
    const next: LetterheadDocument = {
      ...all[idx],
      ...patch,
      input: patch.input ?? all[idx].input,
      updatedAt: Date.now(),
    };
    all[idx] = next;
    await persist(userId, all);
    return next;
  },

  async remove(userId, id) {
    const all = await loadAll(userId);
    const next = all.filter((d) => d.id !== id);
    await persist(userId, next);
    log.info("doc removed");
  },
};
