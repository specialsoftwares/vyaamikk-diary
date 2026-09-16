import { getActiveBackend } from "@/config/env";

import type { DiaryRepository } from "./types";

let cachedFirebaseDiary: DiaryRepository | null = null;
let testOverride: DiaryRepository | null = null;

export type {
  DiaryRepository,
  CreateDiaryEntryInput,
  UpdateDiaryEntryInput,
  ListDiaryEntriesOptions,
} from "./types";

/** Node/CI seam. Not used on device. */
export function setDiaryRepositoryForTests(repo: DiaryRepository | null): void {
  testOverride = repo;
}

/**
 * Diary storage mirrors auth: whenever Firestore is configured (either in
 * production or in shared-dev mode), entries live in Firestore and
 * therefore sync across devices. Otherwise we use the per-device
 * AsyncStorage mock and entries stay device-local.
 */
export function getDiaryRepository(): DiaryRepository {
  if (testOverride) return testOverride;
  const backend = getActiveBackend();
  if (backend === "firebase-production" || backend === "firebase-shared-dev") {
    if (!cachedFirebaseDiary) {
      cachedFirebaseDiary =
        require("./firebase").firebaseDiaryRepository as DiaryRepository;
    }
    return cachedFirebaseDiary;
  }
  return require("./mock").mockDiaryRepository as DiaryRepository;
}
