import type { CreditClosureMetadata, CustomerCreditRecord } from "@/domain/customerCredit";
import {
  beginCoordinatedSave,
  completeCoordinatedSave,
  failCoordinatedSave,
  runRecordStepIfNeeded,
} from "@/services/records/saveCoordinator";
import { SAVE_STEP, SaveStillInProgressError } from "@/services/records/saveLockTypes";
import type { SaveIdempotencyContext, ProcessSaveLockOwner } from "@/services/records/saveIdempotency";

import { getCustomerCreditRepository } from "./index";

export async function saveCustomerCreditClosure(
  userId: string,
  recordId: string,
  closure: CreditClosureMetadata,
  idempotency: SaveIdempotencyContext,
  clientMutationId: string
): Promise<CustomerCreditRecord> {
  const processLockKey = idempotency.idempotencyKey;
  let processLockOwner: ProcessSaveLockOwner | null = null;
  try {
    const begun = await beginCoordinatedSave(idempotency, { processLockKey });
    processLockOwner = begun.processLockOwner;

    if (begun.decision.action === "return_done") {
      const hit = await getCustomerCreditRepository().getById(userId, recordId);
      if (hit?.status === "fully_paid") return hit;
    }

    const completedSteps =
      begun.decision.action === "resume" ||
      begun.decision.action === "proceed" ||
      begun.decision.action === "return_done"
        ? begun.decision.completedSteps
        : [];

    const step = await runRecordStepIfNeeded(
      {
        userId,
        recordKind: "customer_credit_closure",
        recordId,
        step: SAVE_STEP.CLOSURE_APPLIED,
        completedSteps,
        clientRecordId: clientMutationId,
      },
      async () =>
        getCustomerCreditRepository().closeFullyPaid(userId, {
          recordId,
          closure,
          appendFinalPayment: true,
          clientMutationId,
        })
    );

    const updated = step.result ?? (await getCustomerCreditRepository().getById(userId, recordId));
    if (!updated) throw new Error("Closure save failed.");

    await completeCoordinatedSave(idempotency, recordId, {
      processLockKey,
      processLockOwner: processLockOwner ?? undefined,
    });
    return updated;
  } catch (e) {
    if (e instanceof SaveStillInProgressError) throw e;
    await failCoordinatedSave(idempotency, "credit_closure_failed", {
      processLockKey,
      processLockOwner: processLockOwner ?? undefined,
      clearRegistry: false,
    });
    throw e;
  }
}
