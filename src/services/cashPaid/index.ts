import { getActiveBackend } from "@/config/env";

export {
  denominationTotal,
  formatCashPaidFinancialYearLabel,
  formatCpvSerial,
  mockAllocateCashPaidVoucherSerial,
  parseCpvSerial,
  validateDenominationForFullLegal,
  type CashPaidVoucherSerialResult,
} from "./cashPaidVoucherSerial";

export async function allocateCashPaidVoucherSerial(
  userId: string,
  paymentDateMs: number,
  existingSerial?: string | null
) {
  const backend = getActiveBackend();
  if (backend === "firebase-production" || backend === "firebase-shared-dev") {
    const { firebaseAllocateCashPaidVoucherSerial } =
      require("./cashPaidVoucherSerial.firebase") as typeof import("./cashPaidVoucherSerial.firebase");
    return firebaseAllocateCashPaidVoucherSerial(userId, paymentDateMs, existingSerial);
  }
  const { mockAllocateCashPaidVoucherSerial } =
    require("./cashPaidVoucherSerial") as typeof import("./cashPaidVoucherSerial");
  return mockAllocateCashPaidVoucherSerial(userId, paymentDateMs, existingSerial);
}
