import { getActiveBackend } from "@/config/env";

import type { DiaryRepository } from "./types";

let cachedFirebaseDiary: DiaryRepository | null = null;
let testOverride: DiaryRepository | null = null;

export type {
  DiaryRepository,
  DiaryCreateResult,
  DiaryCreateOutcome,
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
export type DiaryRepositoryKind = "firebase" | "mock";

/** Production and shared-dev never select the AsyncStorage mock. */
export function diaryRepositoryKind(backend: ReturnType<typeof getActiveBackend>): DiaryRepositoryKind {
  if (backend === "firebase-production" || backend === "firebase-shared-dev") return "firebase";
  return "mock";
}

export function getDiaryRepository(): DiaryRepository {
  if (testOverride) return testOverride;
  const backend = getActiveBackend();
  if (diaryRepositoryKind(backend) === "firebase") {
    if (!cachedFirebaseDiary) {
      cachedFirebaseDiary =
        require("./firebase").firebaseDiaryRepository as DiaryRepository;
    }
    return cachedFirebaseDiary;
  }
  return require("./mock").mockDiaryRepository as DiaryRepository;
}
