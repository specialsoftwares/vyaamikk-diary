import { getActiveBackend } from "@/config/env";

import { mockDiaryRepository } from "./mock";

import type { DiaryRepository } from "./types";

let cachedFirebaseDiary: DiaryRepository | null = null;

export type {
  DiaryRepository,
  CreateDiaryEntryInput,
  UpdateDiaryEntryInput,
  ListDiaryEntriesOptions,
} from "./types";

/**
 * Diary storage mirrors auth: whenever Firestore is configured (either in
 * production or in shared-dev mode), entries live in Firestore and
 * therefore sync across devices. Otherwise we use the per-device
 * AsyncStorage mock and entries stay device-local.
 */
export function getDiaryRepository(): DiaryRepository {
  const backend = getActiveBackend();
  if (backend === "firebase-production" || backend === "firebase-shared-dev") {
    if (!cachedFirebaseDiary) {
      cachedFirebaseDiary =
        require("./firebase").firebaseDiaryRepository as DiaryRepository;
    }
    return cachedFirebaseDiary;
  }
  return mockDiaryRepository;
}
