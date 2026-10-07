/**
 * AsyncStorage-backed letterhead repository (local-mock mode only).
 *
 * Per-device — same caveat as the diary mock. For cross-device letterhead
 * sync, configure Firebase to switch into shared-dev mode automatically.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { AppError } from "@/domain/errors";
import { createLogger } from "@/utils/logger";

import { validateWritingMargins } from "./letterheadGeneratedLayout";
import type { LetterheadConfig, LetterheadRepository } from "./types";

const log = createLogger("letterhead/mock");
const KEY_PREFIX = "vyd_letterhead_v1_";

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export const mockLetterheadRepository: LetterheadRepository = {
  async get(userId) {
    if (!userId) return null;
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as LetterheadConfig;
      const hasGenerated =
        parsed.sourceType === "generated_layout" && Boolean(parsed.generatedLayout);
      if (!parsed.imageDataUri && !hasGenerated) return null;
      return parsed;
    } catch {
      return null;
    }
  },

  async save(userId, patch) {
    if (!userId) throw new AppError("permission_denied", "Not signed in.");
    const marginsCheck = validateWritingMargins(patch.margins);
    if (!marginsCheck.ok) {
      throw new AppError("save_failed", "Writing area margins are invalid.");
    }
    const now = Date.now();
    const existing = await this.get(userId);
    const next: LetterheadConfig = {
      ...patch,
      userId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(next));
    log.info("letterhead saved (mock)");
    return next;
  },

  async remove(userId) {
    if (!userId) return;
    await AsyncStorage.removeItem(keyFor(userId));
    log.info("letterhead removed (mock)");
  },
};
