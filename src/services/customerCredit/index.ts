import { getActiveBackend } from "@/config/env";

import { mockCustomerCreditRepository } from "./mock";

import type { CustomerCreditRepository } from "./types";

let cachedFirebaseCredit: CustomerCreditRepository | null = null;

export type {
  CustomerCreditRepository,
  CreateCustomerCreditInput,
  UpdateCustomerCreditInput,
  ListCustomerCreditOptions,
} from "./types";

export { recordTitle } from "./shared";

export function getCustomerCreditRepository(): CustomerCreditRepository {
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
