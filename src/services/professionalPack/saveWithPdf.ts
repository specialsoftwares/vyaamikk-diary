import type { ProfessionalServicePack } from "@/domain/professionalPack";
import type { UserProfile } from "@/domain/types";
import type { Lang } from "@/i18n/types";
import {
  buildProfessionalPackPdfHtml,
  professionalPackPdfLabels,
} from "@/services/pdf/professionalPackPdfTemplate";
import { dayKey } from "@/utils/date";
import { matterLabelKey } from "@/utils/professionalPack/display";
import { getMatterDef } from "@/domain/professionalPackMatters";
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

import { getProfessionalPackRepository } from "./index";
import type { CreateProfessionalPackInput } from "./types";
import { pdfGenerateHook } from "@/services/pdf/pdfGenerateHook";

let saveEffectsForTests: (() => Promise<void>) | null = null;

/** Node/CI seam. Production still indexes search after PDF. */
export function setProfessionalPackSaveEffectsForTests(hook: (() => Promise<void>) | null): void {
  saveEffectsForTests = hook;
}

export async function saveProfessionalPackWithPdf(
  userId: string,
  input: CreateProfessionalPackInput,
  options: {
    user: UserProfile;
    locale: "en-IN" | "hi-IN";
    uiLang?: Lang;
    t: (key: string, vars?: Record<string, string | number>) => string;
    isUpdate?: boolean;
    packId?: string;
    idempotency?: SaveIdempotencyContext;
    route?: string;
  }
): Promise<ProfessionalServicePack> {
  const processLockKey =
    options.packId ?? options.idempotency?.idempotencyKey ?? null;
  let idempotency = options.idempotency;
  let completedSteps: string[] = [];
  let processLockOwner: ProcessSaveLockOwner | null = null;

  try {
    if (!options.isUpdate && idempotency) {
      const begun = await beginCoordinatedSave(idempotency, {
        ueid: input.ueid,
        processLockKey: processLockKey ?? undefined,
        route: options.route,
      });
      idempotency = begun.idempotency;
      input = { ...input, clientRecordId: begun.clientRecordId };
      processLockOwner = begun.processLockOwner;

      if (begun.decision.action === "return_done") {
        const existing = await getProfessionalPackRepository().getById(
          userId,
          begun.decision.recordId
        );
        if (existing) return existing;
      }
      if (begun.decision.action === "resume" || begun.decision.action === "proceed") {
        completedSteps = begun.decision.completedSteps;
      }
    }

    logSaveDiagnostic({
      phase: "start",
      recordKind: "professional_pack",
      userId,
      route: options.route,
      clientRecordId: input.clientRecordId,
      idempotencyKey: idempotency?.idempotencyKey,
      source: options.isUpdate ? "edit" : "create",
    });

    const repo = getProfessionalPackRepository();
    let pack: ProfessionalServicePack;

    if (options.isUpdate && options.packId) {
      pack = await repo.update(userId, {
        id: options.packId,
        title: input.title,
        facts: input.facts,
        linkedEntryIds: input.linkedEntryIds,
        attachments: input.attachments,
        matterDate: input.matterDate,
        dueDate: input.dueDate,
        reminder: input.reminder,
        status: input.status,
        professionalName: input.professionalName,
        professionalContact: input.professionalContact,
        notes: input.notes,
      });
    } else {
      pack = await repo.create(userId, input);
      if (!hasCompletedStep(completedSteps, SAVE_STEP.BASE_RECORD_CREATED)) {
        const base = await runRecordStepIfNeeded(
          {
            userId,
            recordKind: "professional_pack",
            recordId: pack.id,
            step: SAVE_STEP.BASE_RECORD_CREATED,
            completedSteps,
            clientRecordId: input.clientRecordId,
            alwaysRun: true,
          },
          async () => pack
        );
        completedSteps = base.completedSteps;
      }
    }

    if (pack.reminder && !pack.reminder.notificationId) {
      try {
        const { notificationsService } = await import("@/services/notifications");
        const nid = await notificationsService.scheduleOneShot({
          title: options.t("proPack.reminderTitle", { title: pack.title }),
          body: options.t("proPack.reminderBody"),
          at: pack.reminder.at,
          data: { packId: pack.id, userId },
        });
        pack = await repo.update(userId, {
          id: pack.id,
          reminder: { ...pack.reminder, notificationId: nid },
        });
      } catch {
        // non-fatal
      }
    }

    const needsPdf =
      shouldRunStep(completedSteps, SAVE_STEP.PDF_GENERATED, { pdfUri: pack.pdfUri }) ||
      shouldRunStep(completedSteps, SAVE_STEP.PDF_URI_SAVED, { pdfUri: pack.pdfUri });

    if (needsPdf) {
      const hooked = pdfGenerateHook();
      let html = "";
      if (!hooked) {
        const def = getMatterDef(pack.professionalCategory, pack.matterType);
        const matterLabel = matterLabelKey(pack.professionalCategory, pack.matterType);
        const { getUserPdfBranding } = await import("@/services/pdf/userPdfBranding");
        const { resolveGujaratiPdfExtraCss } = await import("@/services/pdf/resolveGujaratiPdfExtraCss");
        const branding = await getUserPdfBranding(options.user, { t: options.t });
        const extraCss = await resolveGujaratiPdfExtraCss(options.uiLang);
        html = buildProfessionalPackPdfHtml({
          pack,
          user: options.user,
          branding,
          locale: options.locale,
          extraCss,
          labels: professionalPackPdfLabels({
            t: options.t,
            uiLang: options.uiLang,
            reportTitle: def
              ? options.t(`proPack.pdfTitles.${def.pdfTitleKey}`)
              : options.t("proPack.pdfTitles.generic"),
            matterType: options.t(matterLabel),
            category: options.t(`proPack.categories.${pack.professionalCategory}`),
            profileTitle: options.t("pdf.userProfileTitle"),
            legal: branding.legal,
          }),
        });
      }

      try {
        const pdfStep = await runRecordStepIfNeeded(
          {
            userId,
            recordKind: "professional_pack",
            recordId: pack.id,
            step: SAVE_STEP.PDF_GENERATED,
            completedSteps,
            clientRecordId: input.clientRecordId,
          },
          async () => {
            const generateInput = {
              html,
              fileNameHint: options.t("proPack.fileNameHint", {
                date: dayKey(pack.matterDate),
              }),
              fileName: {
                documentType: "professionalBrief" as const,
                titleOrParty: pack.title,
                date: dayKey(pack.matterDate),
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
              recordKind: "professional_pack",
              recordId: pack.id,
              step: SAVE_STEP.PDF_URI_SAVED,
              completedSteps,
              clientRecordId: input.clientRecordId,
            },
            async () => repo.update(userId, { id: pack.id, pdfUri: pdfStep.result!.uri })
          );
          pack = uriStep.result ?? pack;
          completedSteps = uriStep.completedSteps;
        }
      } catch {
        // PDF step remains missing for retry
      }
    }

    const searchStep = await runRecordStepIfNeeded(
      {
        userId,
        recordKind: "professional_pack",
        recordId: pack.id,
        step: SAVE_STEP.SEARCH_INDEXED,
        completedSteps,
        clientRecordId: input.clientRecordId,
      },
      async () => {
        if (saveEffectsForTests) {
          await saveEffectsForTests();
          return;
        }
        const { invalidateGlobalSearchIndex } = await import("@/services/search/globalSearchRepository");
        invalidateGlobalSearchIndex();
      }
    );
    completedSteps = searchStep.completedSteps;

    if (idempotency && !options.isUpdate) {
      await completeCoordinatedSave(idempotency, pack.id, {
        processLockKey: processLockKey ?? undefined,
        processLockOwner: processLockOwner ?? undefined,
      });
    } else if (processLockKey) {
      releaseProcessSaveLock(processLockKey, processLockOwner ?? undefined);
    }

    return pack;
  } catch (e) {
    if (e instanceof SaveStillInProgressError) throw e;
    if (idempotency && !options.isUpdate) {
      await failCoordinatedSave(idempotency, "pro_pack_save_failed", {
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
