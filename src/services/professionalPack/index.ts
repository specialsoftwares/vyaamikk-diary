import { getActiveBackend } from "@/config/env";

import type { ProfessionalPackRepository } from "./types";

let cachedFirebasePack: ProfessionalPackRepository | null = null;
let testOverride: ProfessionalPackRepository | null = null;

export type {
  ProfessionalPackRepository,
  CreateProfessionalPackInput,
  UpdateProfessionalPackInput,
  ListProfessionalPacksOptions,
} from "./types";

export function setProfessionalPackRepositoryForTests(repo: ProfessionalPackRepository | null): void {
  testOverride = repo;
}

export function getProfessionalPackRepository(): ProfessionalPackRepository {
  if (testOverride) return testOverride;
  const backend = getActiveBackend();
  if (backend === "firebase-production" || backend === "firebase-shared-dev") {
    if (!cachedFirebasePack) {
      cachedFirebasePack =
        require("./firebase").firebaseProfessionalPackRepository as ProfessionalPackRepository;
    }
    return cachedFirebasePack;
  }
  return require("./mock").mockProfessionalPackRepository as ProfessionalPackRepository;
}
