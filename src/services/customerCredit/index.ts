import { getActiveBackend } from "@/config/env";

import { mockCustomerCreditRepository } from "./mock";

import type { CustomerCreditRepository } from "./types";

let cachedFirebaseCredit: CustomerCreditRepository | null = null;
let testOverride: CustomerCreditRepository | null = null;

export type {
  CustomerCreditRepository,
  CreateCustomerCreditInput,
  UpdateCustomerCreditInput,
  ListCustomerCreditOptions,
} from "./types";

export { recordTitle } from "./shared";

export function setCustomerCreditRepositoryForTests(repo: CustomerCreditRepository | null): void {
  testOverride = repo;
}

export function getCustomerCreditRepository(): CustomerCreditRepository {
  if (testOverride) return testOverride;
  const backend = getActiveBackend();
  if (backend === "firebase-production" || backend === "firebase-shared-dev") {
    if (!cachedFirebaseCredit) {
      cachedFirebaseCredit =
        require("./firebase").firebaseCustomerCreditRepository as CustomerCreditRepository;
    }
    return cachedFirebaseCredit;
  }
  return mockCustomerCreditRepository;
}
