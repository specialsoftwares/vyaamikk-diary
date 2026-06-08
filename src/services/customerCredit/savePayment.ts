import type { CustomerCreditRecord } from "@/domain/customerCredit";
import { logSaveDiagnostic } from "@/services/records/saveDiagnostics";
import {
  beginCoordinatedSave,
  completeCoordinatedSave,
  failCoordinatedSave,
  runRecordStepIfNeeded,
} from "@/services/records/saveCoordinator";
import { attachRecordIdToPersistentLock } from "@/services/records/persistentSaveLock";
import { SAVE_STEP, SaveStillInProgressError } from "@/services/records/saveLockTypes";
import type { SaveIdempotencyContext } from "@/services/records/saveIdempotency";
import { stableRecordId } from "@/services/records/stableRecordId";

import { getCustomerCreditRepository } from "./index";
import type { AddCreditPaymentInput } from "./types";

export async function saveCustomerCreditPayment(
  userId: string,
  recordId: string,
  payment: AddCreditPaymentInput,
  idempotency: SaveIdempotencyContext
): Promise<CustomerCreditRecord> {
  const processLockKey = idempotency.idempotencyKey;
  const payId = stableRecordId(payment.clientPaymentId ?? idempotency.clientRecordId, "pay");
  const repo = getCustomerCreditRepository();

  logSaveDiagnostic({
    phase: "start",
    recordKind: "customer_credit_payment",
    userId,
    remoteId: recordId,
    clientRecordId: idempotency.clientRecordId,
    idempotencyKey: idempotency.idempotencyKey,
    message: "payment_save_start",
  });

  try {
    const parentBefore = await repo.getById(userId, recordId);
    if (!parentBefore) {
      throw new Error("Parent Dukaan record not found.");
    }
    const ledgerBeforeCount = parentBefore.payments.length;

    logSaveDiagnostic({
      phase: "remote_write",
      recordKind: "customer_credit_payment",
      userId,
      remoteId: recordId,
      message: `ledger_before_count:${ledgerBeforeCount}`,
    });

    const begun = await beginCoordinatedSave(idempotency, {
      processLockKey,
    });

    if (begun.decision.action === "return_done") {
      const donePaymentId = begun.decision.recordId;
      logSaveDiagnostic({
        phase: "blocked_replay",
        recordKind: "customer_credit_payment",
        userId,
        remoteId: recordId,
        clientRecordId: idempotency.clientRecordId,
        message: "return_done_refetch_parent",
      });
      logSaveDiagnostic({
        phase: "remote_write",
        recordKind: "customer_credit_payment",
        userId,
        remoteId: recordId,
        message: "parent_record_refetch_start",
      });
      const hit = await repo.getById(userId, recordId);
      logSaveDiagnostic({
        phase: "remote_write",
        recordKind: "customer_credit_payment",
        userId,
        remoteId: recordId,
        message: hit
          ? `parent_record_refetch_done:ledger_after_count:${hit.payments.length}`
          : "parent_record_refetch_done:missing",
      });
      if (hit?.payments.some((p) => p.id === donePaymentId || p.id === payId)) {
        return hit;
      }
    }

    const completedSteps =
      begun.decision.action === "resume" ||
      begun.decision.action === "proceed" ||
      begun.decision.action === "return_done"
        ? begun.decision.completedSteps
        : [];

    logSaveDiagnostic({
      phase: "remote_write",
      recordKind: "customer_credit_payment",
      userId,
      remoteId: recordId,
      message: "append_payment_start",
    });

    const step = await runRecordStepIfNeeded(
      {
        userId,
        recordKind: "customer_credit_payment",
        recordId,
        step: SAVE_STEP.LEDGER_EVENT_APPENDED,
        completedSteps,
        clientRecordId: idempotency.clientRecordId,
      },
      async () =>
        repo.addPayment(userId, recordId, {
          ...payment,
          clientPaymentId: payId,
        })
    );

    logSaveDiagnostic({
      phase: "remote_write",
      recordKind: "customer_credit_payment",
      userId,
      remoteId: recordId,
      message: "parent_record_refetch_start",
    });
    const updated =
      step.result ?? (await repo.getById(userId, recordId));
    logSaveDiagnostic({
      phase: "remote_write",
      recordKind: "customer_credit_payment",
      userId,
      remoteId: recordId,
      message: updated
        ? `parent_record_refetch_done:ledger_after_count:${updated.payments.length}`
        : "parent_record_refetch_done:missing",
    });
    if (!updated) throw new Error("Payment save failed.");

    logSaveDiagnostic({
      phase: "complete",
      recordKind: "customer_credit_payment",
      userId,
      remoteId: recordId,
      message: `append_payment_done:ledger_after_count:${updated.payments.length}`,
    });
    logSaveDiagnostic({
      phase: "complete",
      recordKind: "customer_credit_payment",
      userId,
      remoteId: recordId,
      message: "balance_update_done",
    });

    await attachRecordIdToPersistentLock(
      userId,
      idempotency.clientRecordId,
      payId
    );
    await completeCoordinatedSave(idempotency, payId, { processLockKey });
    return updated;
  } catch (e) {
    if (e instanceof SaveStillInProgressError) throw e;
    logSaveDiagnostic({
      phase: "error",
      recordKind: "customer_credit_payment",
      userId,
      remoteId: recordId,
      clientRecordId: idempotency.clientRecordId,
      message: "payment_error",
    });
    await failCoordinatedSave(idempotency, "credit_payment_failed", {
      processLockKey,
      clearRegistry: false,
    });
    throw e;
  }
}
