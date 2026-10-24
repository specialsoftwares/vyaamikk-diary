/**
 * In-memory letterhead repository mirroring mock/firebase session rechecks.
 * Used by setup editor runtime tests — real save path, not a simplified stub.
 */

import { AppError } from "@/domain/errors";
import {
  assertDispatchedSession,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";

import { validateWritingMargins } from "./letterheadGeneratedLayout";
import type { LetterheadConfig, LetterheadRepository } from "./types";

export function createMemoryLetterheadRepository(
  store: Map<string, LetterheadConfig> = new Map()
): LetterheadRepository & { store: Map<string, LetterheadConfig> } {
  const repo: LetterheadRepository & { store: Map<string, LetterheadConfig> } = {
    store,

    async get(userId) {
      if (!userId) return null;
      const parsed = store.get(userId) ?? null;
      if (!parsed) return null;
      const hasGenerated =
        parsed.sourceType === "generated_layout" && Boolean(parsed.generatedLayout);
      if (!parsed.imageDataUri && !hasGenerated) return null;
      return { ...parsed };
    },

    async save(userId, patch, session?: SyncSessionToken | null) {
      if (!userId) throw new AppError("permission_denied", "Not signed in.");
      assertDispatchedSession(session, userId);
      const marginsCheck = validateWritingMargins(patch.margins);
      if (!marginsCheck.ok) {
        throw new AppError("save_failed", "Writing area margins are invalid.");
      }
      // Awaited preparation (mirrors firebase getDoc / mock get).
      await Promise.resolve();
      assertDispatchedSession(session, userId);
      const existing = store.get(userId) ?? null;
      const now = Date.now();
      const next: LetterheadConfig = {
        ...patch,
        userId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      assertDispatchedSession(session, userId);
      store.set(userId, next);
      assertDispatchedSession(session, userId);
      return { ...next };
    },

    async remove(userId) {
      if (!userId) return;
      store.delete(userId);
    },
  };
  return repo;
}
