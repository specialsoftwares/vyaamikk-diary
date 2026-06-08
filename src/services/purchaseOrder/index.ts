import { getActiveBackend } from "@/config/env";

import { mockPurchaseOrderRepository } from "./mock";

import type { PurchaseOrderRepository } from "./types";

let cachedFirebasePo: PurchaseOrderRepository | null = null;

export type {
  PurchaseOrderRepository,
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  ListPurchaseOrdersOptions,
} from "./types";

export function getPurchaseOrderRepository(): PurchaseOrderRepository {
  const backend = getActiveBackend();
  if (backend === "firebase-production" || backend === "firebase-shared-dev") {
    if (!cachedFirebasePo) {
      cachedFirebasePo =
        require("./firebase").firebasePurchaseOrderRepository as PurchaseOrderRepository;
    }
    return cachedFirebasePo;
  }
  return mockPurchaseOrderRepository;
}
