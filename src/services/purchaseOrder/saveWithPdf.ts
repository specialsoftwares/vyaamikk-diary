import type { PurchaseOrder } from "@/domain/purchaseOrder";
import type { UserProfile } from "@/domain/types";
import { englishPdfT } from "@/i18n/englishPdfT";
import {
  buildPurchaseOrderHtml,
  purchaseOrderPdfLabels,
} from "@/services/pdf/purchaseOrderPdfService";
import { logSaveDiagnostic } from "@/services/records/saveDiagnostics";
import {
  beginCoordinatedSave,
  completeCoordinatedSave,
  failCoordinatedSave,
  runRecordStepIfNeeded,
  shouldRunStep,
} from "@/services/records/saveCoordinator";
import { SAVE_STEP, SaveStillInProgressError, hasCompletedStep } from "@/services/records/saveLockTypes";
import type { SaveIdempotencyContext, ProcessSaveLockOwner } from "@/services/records/saveIdempotency";
import { releaseProcessSaveLock } from "@/services/records/saveIdempotency";
import { dayKey } from "@/utils/date";

import { getPurchaseOrderRepository } from "./index";
import type { CreatePurchaseOrderInput, UpdatePurchaseOrderInput } from "./types";
import { pdfGenerateHook } from "@/services/pdf/pdfGenerateHook";

let saveEffectsForTests: (() => Promise<void>) | null = null;

/** Node/CI seam. Production still runs insights + search after PDF. */
export function setPurchaseOrderSaveEffectsForTests(hook: (() => Promise<void>) | null): void {
  saveEffectsForTests = hook;
}

export async function savePurchaseOrderWithPdf(
  userId: string,
  params: {
    create?: CreatePurchaseOrderInput;
    update?: UpdatePurchaseOrderInput;
    user: UserProfile;
    locale: "en-IN" | "hi-IN";
    t: (key: string, vars?: Record<string, string | number>) => string;
    idempotency?: SaveIdempotencyContext;
    route?: string;
  }
): Promise<PurchaseOrder> {
  const isUpdate = Boolean(params.update);
  const processLockKey =
    params.update?.id ?? params.idempotency?.idempotencyKey ?? null;
  let idempotency = params.idempotency;
  let completedSteps: string[] = [];
  let processLockOwner: ProcessSaveLockOwner | null = null;

  try {
    if (!isUpdate && idempotency && params.create) {
      const begun = await beginCoordinatedSave(idempotency, {
        ueid: params.create.ueid,
        processLockKey: processLockKey ?? undefined,
        route: params.route,
      });
      idempotency = begun.idempotency;
      params.create.clientRecordId = begun.clientRecordId;
      processLockOwner = begun.processLockOwner;

      if (begun.decision.action === "return_done") {
        const existing = await getPurchaseOrderRepository().getById(
          userId,
          begun.decision.recordId
        );
        if (existing) return existing;
      }
      if (begun.decision.action === "resume" || begun.decision.action === "proceed") {
        completedSteps = begun.decision.completedSteps;
      }
    }

    const repo = getPurchaseOrderRepository();
    let saved: PurchaseOrder;

    if (isUpdate && params.update) {
      saved = await repo.update(userId, params.update);
    } else if (params.create) {
      saved = await repo.create(userId, params.create);
      if (!hasCompletedStep(completedSteps, SAVE_STEP.BASE_RECORD_CREATED)) {
        const base = await runRecordStepIfNeeded(
          {
            userId,
            recordKind: "purchase_order",
            recordId: saved.id,
            step: SAVE_STEP.BASE_RECORD_CREATED,
            completedSteps,
            clientRecordId: params.create.clientRecordId,
            alwaysRun: true,
          },
          async () => saved
        );
        completedSteps = base.completedSteps;
      }
    } else {
      throw new Error("PO save requires create or update input.");
    }

    let logoDataUri: string | null = null;
    if (saved.useLogo && params.user.profileLogo?.localUri && !pdfGenerateHook() && !saveEffectsForTests) {
      try {
        const { readProfileLogoDataUri } = await import("@/services/profileLogo/storage");
        logoDataUri = await readProfileLogoDataUri(params.user.profileLogo);
      } catch {
        logoDataUri = null;
      }
    }

    const needsPdf =
      shouldRunStep(completedSteps, SAVE_STEP.PDF_GENERATED, { pdfUri: saved.pdfUri }) ||
      shouldRunStep(completedSteps, SAVE_STEP.PDF_URI_SAVED, { pdfUri: saved.pdfUri });

    if (needsPdf) {
    const hooked = pdfGenerateHook();
    const html = hooked
      ? ""
      : buildPurchaseOrderHtml({
          po: saved,
          locale: params.locale,
          labels: purchaseOrderPdfLabels(englishPdfT()),
          logoDataUri,
        });
      try {
        const pdfStep = await runRecordStepIfNeeded(
          {
            userId,
            recordKind: "purchase_order",
            recordId: saved.id,
            step: SAVE_STEP.PDF_GENERATED,
            completedSteps,
            clientRecordId: params.create?.clientRecordId,
          },
          async () => {
            const hooked = pdfGenerateHook();
            const generateInput = {
              html,
              fileNameHint: `${saved.poNumber}`,
              fileName: {
                documentType: "purchaseOrder" as const,
                supplierName: saved.vendorName,
                poSerial: saved.poNumber,
                date: dayKey(saved.poDate),
              },
            };
            if (hooked) return hooked(generateInput);
            const { pdfService } = await import("@/services/pdf/pdfService");
            return pdfService.generate(generateInput);
          }
        );
        completedSteps = pdfStep.completedSteps;
        if (pdfStep.ran && pdfStep.result) {
          const uriStep = await runRecordStepIfNeeded(
            {
              userId,
              recordKind: "purchase_order",
              recordId: saved.id,
              step: SAVE_STEP.PDF_URI_SAVED,
              completedSteps,
              clientRecordId: params.create?.clientRecordId,
            },
            async () => repo.update(userId, { id: saved.id, pdfUri: pdfStep.result!.uri })
          );
          saved = uriStep.result ?? saved;
          completedSteps = uriStep.completedSteps;
        }
      } catch {
        // PDF remains for retry
      }
    }

    const insightsStep = await runRecordStepIfNeeded(
      {
        userId,
        recordKind: "purchase_order",
        recordId: saved.id,
        step: SAVE_STEP.INSIGHTS_INDEXED,
        completedSteps,
        clientRecordId: params.create?.clientRecordId,
      },
      async () => {
        if (saveEffectsForTests) {
          await saveEffectsForTests();
          return;
        }
        const { syncInsightsFromPurchaseOrder } = await import("@/services/insights/insightSync");
        await syncInsightsFromPurchaseOrder(userId, params.create?.ueid ?? saved.ueid, saved);
      }
    );
    completedSteps = insightsStep.completedSteps;

    await runRecordStepIfNeeded(
      {
        userId,
        recordKind: "purchase_order",
        recordId: saved.id,
        step: SAVE_STEP.SEARCH_INDEXED,
        completedSteps,
        clientRecordId: params.create?.clientRecordId,
      },
      async () => {
        if (saveEffectsForTests) return;
        const { invalidateGlobalSearchIndex } = await import("@/services/search/globalSearchRepository");
        invalidateGlobalSearchIndex();
      }
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
      recordKind: "purchase_order",
      userId,
      remoteId: saved.id,
    });
    return saved;
  } catch (e) {
    if (e instanceof SaveStillInProgressError) throw e;
    if (idempotency && !isUpdate) {
      await failCoordinatedSave(idempotency, "po_save_failed", {
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
