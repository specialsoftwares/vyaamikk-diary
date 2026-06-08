import { getActiveBackend } from "@/config/env";

import { mockProfessionalPackRepository } from "./mock";

import type { ProfessionalPackRepository } from "./types";

let cachedFirebasePack: ProfessionalPackRepository | null = null;

export type {
  ProfessionalPackRepository,
  CreateProfessionalPackInput,
  UpdateProfessionalPackInput,
  ListProfessionalPacksOptions,
} from "./types";

export function getProfessionalPackRepository(): ProfessionalPackRepository {
  const backend = getActiveBackend();
  if (backend === "firebase-production" || backend === "firebase-shared-dev") {
    if (!cachedFirebasePack) {
      cachedFirebasePack =
        require("./firebase").firebaseProfessionalPackRepository as ProfessionalPackRepository;
    }
    return cachedFirebasePack;
  }
  return mockProfessionalPackRepository;
}
