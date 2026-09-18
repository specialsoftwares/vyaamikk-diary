import type { CustomerCreditRecord } from "@/domain/customerCredit";
import { AppError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";
import type { Lang } from "@/i18n/types";
import { pdfService } from "@/services/pdf/pdfService";
import { buildCreditPdfHtml } from "@/services/customerCredit/pdfContext";
import { logSaveDiagnostic } from "@/services/records/saveDiagnostics";
import {
  beginCoordinatedSave,
  completeCoordinatedSave,
  failCoordinatedSave,
  runRecordStepIfNeeded,
  shouldRunStep,
} from "@/services/records/saveCoordinator";
import { attachRecordIdToPersistentLock } from "@/services/records/persistentSaveLock";
import { SAVE_STEP, SaveStillInProgressError, hasCompletedStep } from "@/services/records/saveLockTypes";
import type { SaveIdempotencyContext, ProcessSaveLockOwner } from "@/services/records/saveIdempotency";
import { releaseProcessSaveLock } from "@/services/records/saveIdempotency";
import { syncInsightsFromCustomerCredit } from "@/services/insights/insightSync";
import { syncCreditReminder } from "@/services/customerCredit/reminders";
import { invalidateGlobalSearchIndex } from "@/services/search/globalSearchRepository";
import { dayKey } from "@/utils/date";

import { getCustomerCreditRepository } from "./index";
import type { CreateCustomerCreditInput, UpdateCustomerCreditInput } from "./types";
import type { AddCreditPaymentInput } from "./types";

export async function saveCustomerCreditWithPdf(
  userId: string,
  params: {
    create?: CreateCustomerCreditInput;
    update?: UpdateCustomerCreditInput;
    user: UserProfile;
    locale: "en-IN" | "hi-IN";
    uiLang?: Lang;
    t: (key: string, vars?: Record<string, string | number>) => string;
    idempotency?: SaveIdempotencyContext;
    paidInFullPayment?: AddCreditPaymentInput;
    route?: string;
  }
): Promise<CustomerCreditRecord> {
  const isUpdate = Boolean(params.update);
  const processLockKey =
    params.update?.id ?? params.idempotency?.idempotencyKey ?? null;
  let idempotency = params.idempotency;
  let completedSteps: string[] = [];
  let processLockOwner: ProcessSaveLockOwner | null = null;
  const repo = getCustomerCreditRepository();

  logSaveDiagnostic({
    phase: "start",
    recordKind: "customer_credit",
    userId,
    route: params.route,
    clientRecordId: params.create?.clientRecordId ?? params.update?.id,
    idempotencyKey: idempotency?.idempotencyKey,
    source: isUpdate ? "edit" : "create",
    message: "save_start",
  });

  try {
    let saved: CustomerCreditRecord | undefined;

    if (!isUpdate && idempotency && params.create) {
      const begun = await beginCoordinatedSave(idempotency, {
        ueid: params.create.ueid,
        processLockKey: processLockKey ?? undefined,
        route: params.route,
      });
      idempotency = begun.idempotency;
      params.create.clientRecordId = begun.clientRecordId;
      completedSteps = begun.decision.completedSteps;
      processLockOwner = begun.processLockOwner;

      if (begun.decision.action === "return_done") {
        saved =
          (await repo.getById(userId, begun.decision.recordId)) ?? undefined;
        if (!saved) {
          throw new AppError(
            "not_found",
            "Saved Dukaan record could not be loaded. Try again from your records list."
          );
        }
        logSaveDiagnostic({
          phase: "blocked_replay",
          recordKind: "customer_credit",
          userId,
          clientRecordId: begun.clientRecordId,
          remoteId: saved.id,
          message: "return_done_resume_pipeline",
        });
      } else if (begun.decision.action === "resume" && begun.decision.recordId) {
        saved = (await repo.getById(userId, begun.decision.recordId)) ?? undefined;
        logSaveDiagnostic({
          phase: "start",
          recordKind: "customer_credit",
          userId,
          clientRecordId: begun.clientRecordId,
          remoteId: begun.decision.recordId,
          message: "resume_existing_record",
        });
      }
    }

    if (!saved) {
      if (isUpdate && params.update) {
        logSaveDiagnostic({
          phase: "remote_write",
          recordKind: "customer_credit",
          userId,
          remoteId: params.update.id,
          message: "repository_update_start",
        });
        saved = await repo.update(userId, params.update);
      } else if (params.create) {
        logSaveDiagnostic({
          phase: "remote_write",
          recordKind: "customer_credit",
          userId,
          clientRecordId: params.create.clientRecordId,
          message: "repository_create_start",
        });
        saved = await repo.create(userId, params.create);
        logSaveDiagnostic({
          phase: "remote_write",
          recordKind: "customer_credit",
          userId,
          clientRecordId: params.create.clientRecordId,
          remoteId: saved.id,
          message: "repository_create_done",
        });
        const lockClientRecordId =
          idempotency?.clientRecordId ?? params.create.clientRecordId;
        if (lockClientRecordId) {
          await attachRecordIdToPersistentLock(userId, lockClientRecordId, saved.id);
        }
        if (!hasCompletedStep(completedSteps, SAVE_STEP.BASE_RECORD_CREATED)) {
          const base = await runRecordStepIfNeeded(
            {
              userId,
              recordKind: "customer_credit",
              recordId: saved.id,
              step: SAVE_STEP.BASE_RECORD_CREATED,
              completedSteps,
              clientRecordId: params.create.clientRecordId,
              alwaysRun: true,
            },
            async () => saved!
          );
          completedSteps = base.completedSteps;
        }
      } else {
        throw new Error("Customer credit save requires create or update input.");
      }
    } else if (
      params.create?.clientRecordId &&
      !hasCompletedStep(completedSteps, SAVE_STEP.BASE_RECORD_CREATED)
    ) {
      await attachRecordIdToPersistentLock(
        userId,
        params.create.clientRecordId,
        saved.id
      );
      const base = await runRecordStepIfNeeded(
        {
          userId,
          recordKind: "customer_credit",
          recordId: saved.id,
          step: SAVE_STEP.BASE_RECORD_CREATED,
          completedSteps,
          clientRecordId: params.create.clientRecordId,
          alwaysRun: true,
        },
        async () => saved!
      );
      completedSteps = base.completedSteps;
    }

    if (params.paidInFullPayment && !isUpdate) {
      const payStep = await runRecordStepIfNeeded(
        {
          userId,
          recordKind: "customer_credit",
          recordId: saved.id,
          step: SAVE_STEP.LEDGER_EVENT_APPENDED,
          completedSteps,
          clientRecordId: params.create?.clientRecordId,
        },
        async () => repo.addPayment(userId, saved!.id, params.paidInFullPayment!)
      );
      if (payStep.ran && payStep.result) saved = payStep.result;
      completedSteps = payStep.completedSteps;
    }

    const variant =
      saved.mode === "external_finance"
        ? "external_finance"
        : saved.schedule.length > 0
          ? "emi_schedule"
          : "sale_record";

    const needsPdf =
      shouldRunStep(completedSteps, SAVE_STEP.PDF_GENERATED, { pdfUri: saved.pdfUri }) ||
      shouldRunStep(completedSteps, SAVE_STEP.PDF_URI_SAVED, { pdfUri: saved.pdfUri });

    if (needsPdf) {
      logSaveDiagnostic({
        phase: "pdf_start",
        recordKind: "customer_credit",
        userId,
        remoteId: saved.id,
        message: "pdf_start",
      });
      try {
        const html = await buildCreditPdfHtml({
          record: saved,
          variant,
          user: params.user,
          t: params.t,
          locale: params.locale,
          uiLang: params.uiLang,
        });
        const pdfStep = await runRecordStepIfNeeded(
          {
            userId,
            recordKind: "customer_credit",
            recordId: saved.id,
            step: SAVE_STEP.PDF_GENERATED,
            completedSteps,
            clientRecordId: params.create?.clientRecordId,
          },
          () =>
            pdfService.generate({
              html,
              fileNameHint: saved!.recordNumber,
              fileName: {
                documentType: "dukaan",
                customerName: saved!.customerName,
                date: dayKey(saved!.saleDate ?? saved!.createdAt),
              },
            })
        );
        completedSteps = pdfStep.completedSteps;
        if (pdfStep.ran && pdfStep.result) {
          logSaveDiagnostic({
            phase: "pdf_done",
            recordKind: "customer_credit",
            userId,
            remoteId: saved.id,
            pdfHint: pdfStep.result.fileName,
            message: "pdf_done",
          });
          logSaveDiagnostic({
            phase: "remote_write",
            recordKind: "customer_credit",
            userId,
            remoteId: saved.id,
            message: "record_update_pdf_start",
          });
          const uriStep = await runRecordStepIfNeeded(
            {
              userId,
              recordKind: "customer_credit",
              recordId: saved.id,
              step: SAVE_STEP.PDF_URI_SAVED,
              completedSteps,
              clientRecordId: params.create?.clientRecordId,
            },
            async () => repo.update(userId, { id: saved!.id, pdfUri: pdfStep.result!.uri })
          );
          saved = uriStep.result ?? saved;
          completedSteps = uriStep.completedSteps;
          logSaveDiagnostic({
            phase: "remote_write",
            recordKind: "customer_credit",
            userId,
            remoteId: saved.id,
            message: "record_update_pdf_done",
          });
        }
      } catch (e) {
        logSaveDiagnostic({
          phase: "error",
          recordKind: "customer_credit",
          userId,
          remoteId: saved.id,
          message: "pdf_generation_failed",
        });
        // Base record is kept; caller may surface a recoverable PDF error.
      }
    }

    void syncCreditReminder(userId, saved, params.t);

    const insightsStep = await runRecordStepIfNeeded(
      {
        userId,
        recordKind: "customer_credit",
        recordId: saved.id,
        step: SAVE_STEP.INSIGHTS_INDEXED,
        completedSteps,
        clientRecordId: params.create?.clientRecordId,
      },
      async () =>
        syncInsightsFromCustomerCredit(userId, params.create?.ueid ?? saved.ueid, saved)
    );
    completedSteps = insightsStep.completedSteps;

    await runRecordStepIfNeeded(
      {
        userId,
        recordKind: "customer_credit",
        recordId: saved.id,
        step: SAVE_STEP.SEARCH_INDEXED,
        completedSteps,
        clientRecordId: params.create?.clientRecordId,
      },
      async () => invalidateGlobalSearchIndex()
    );

    if (idempotency && !isUpdate) {
      await completeCoordinatedSave(idempotency, saved.id, {
        processLockKey: processLockKey ?? undefined,
        processLockOwner: processLockOwner ?? undefined,
      });
    } else if (processLockKey) {
      releaseProcessSaveLock(processLockKey, processLockOwner ?? undefined);
    }

    logSaveDiagnostic({
      phase: "complete",
      recordKind: "customer_credit",
      userId,
      remoteId: saved.id,
      clientRecordId: params.create?.clientRecordId,
      message: "save_complete",
    });
    return saved;
  } catch (e) {
    if (e instanceof SaveStillInProgressError) throw e;
    logSaveDiagnostic({
      phase: "error",
      recordKind: "customer_credit",
      userId,
      clientRecordId: params.create?.clientRecordId,
      idempotencyKey: idempotency?.idempotencyKey,
      message: e instanceof Error ? e.message : "credit_save_failed",
    });
    if (idempotency && !isUpdate) {
      await failCoordinatedSave(idempotency, "credit_save_failed", {
        processLockKey: processLockKey ?? undefined,
        processLockOwner: processLockOwner ?? undefined,
        clearRegistry: false,
      });
    } else if (processLockKey) {
      releaseProcessSaveLock(processLockKey, processLockOwner ?? undefined);
    }
    throw e;
  }
}
