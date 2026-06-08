import type { BusinessEntry } from "@/domain/businessEntry";
import { AppError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";
import {
  buildBusinessEntryPdfHtml,
  businessEntryPdfLabels,
} from "@/services/pdf/businessEntryPdfTemplate";
import { getUserPdfBranding } from "@/services/pdf/userPdfBranding";
import { pdfService } from "@/services/pdf/pdfService";
import { dayKey } from "@/utils/date";
import { entryListSummary } from "@/utils/businessEntry/display";

import { updateEntryLocalFirst } from "./localFirst";
import { getDiaryRepository } from "./index";
import { syncEngine } from "@/sync/syncEngine";
import type { Lang } from "@/i18n/types";
import { gujaratiPdfBodyFontCss, gujaratiPdfFontFaceCss } from "@/services/pdf/pdfGujaratiFont";
import type { CreateBusinessEntryInput } from "./types";
import { createEntryWithReminder } from "./saveWithReminder";
import { syncInsightsFromBusinessEntry } from "@/services/insights/insightSync";
import { invalidateGlobalSearchIndex } from "@/services/search/globalSearchRepository";
import { invalidateMasterInsightsCache } from "@/services/insights/masterInsightsSummary";
import {
  beginCoordinatedSave,
  completeCoordinatedSave,
  failCoordinatedSave,
  runRecordStepIfNeeded,
  shouldRunStep,
} from "@/services/records/saveCoordinator";
import { attachRecordIdToPersistentLock } from "@/services/records/persistentSaveLock";
import {
  logLifecyclePhase,
  runBestEffortSecondary,
} from "@/services/records/saveLifecycleRunner";
import { SAVE_STEP, SaveStillInProgressError, hasCompletedStep } from "@/services/records/saveLockTypes";
import type { SaveIdempotencyContext } from "@/services/records/saveIdempotency";
import { releaseProcessSaveLock } from "@/services/records/saveIdempotency";

export interface SaveComposerEntryOptions {
  user: UserProfile;
  /** @deprecated Data formatting is always en-IN. */
  locale?: "en-IN" | "hi-IN";
  uiLang?: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  labels: {
    pdfProfileTitle: string;
    pdfUeid: string;
    pdfUserName: string;
    pdfBusiness: string;
    pdfEntryDate: string;
    pdfNotes: string;
    pdfReminder: string;
    pdfDetailsSection: string;
    pdfHistorySectionTitle: string;
    pdfHistoryFirstGenerated: string;
    pdfHistoryLastEdited: string;
    pdfHistoryVersion: string;
    pdfHistoryChanges: string;
    reminderNotificationTitle: string;
    fileNameHint: string;
  };
  idempotency?: SaveIdempotencyContext;
  route?: string;
}

export interface SaveComposerEntryResult {
  entry: BusinessEntry;
  pdfFailed: boolean;
  failedSecondarySteps?: string[];
}

export async function saveComposerEntry(
  userId: string,
  input: CreateBusinessEntryInput,
  options: SaveComposerEntryOptions
): Promise<SaveComposerEntryResult> {
  const processLockKey = options.idempotency?.idempotencyKey ?? input.clientRecordId ?? null;
  let idempotency = options.idempotency;
  let completedSteps: string[] = [];
  let pdfFailed = false;
  const failedSecondarySteps: string[] = [];
  const repo = getDiaryRepository();

  logLifecyclePhase(`record_save_start:${input.entryType}`, {
    phase: "start",
    recordKind: "business_entry",
    userId,
    route: options.route,
    clientRecordId: input.clientRecordId,
    idempotencyKey: idempotency?.idempotencyKey,
  });

  try {
    if (idempotency && input.clientRecordId) {
      const begun = await beginCoordinatedSave(idempotency, {
        ueid: input.ueid,
        processLockKey: processLockKey ?? undefined,
        route: options.route,
      });
      idempotency = begun.idempotency;
      input.clientRecordId = begun.clientRecordId;
      completedSteps = begun.decision.completedSteps;

      if (begun.decision.action === "return_done") {
        const existing = await repo.getById(userId, begun.decision.recordId);
        if (!existing) {
          throw new AppError("not_found", "Saved record could not be loaded.");
        }
        logLifecyclePhase("return_done_resume_pipeline", {
          phase: "blocked_replay",
          recordKind: "business_entry",
          userId,
          remoteId: existing.id,
          clientRecordId: input.clientRecordId,
        });
        // Fall through with `entry` loaded — do not early-return before secondary steps.
        return await finishComposerSavePipeline(
          userId,
          input,
          options,
          existing,
          idempotency,
          processLockKey,
          completedSteps,
          pdfFailed,
          failedSecondarySteps
        );
      }

      if (begun.decision.action === "resume" && begun.decision.recordId) {
        const resumed = await repo.getById(userId, begun.decision.recordId);
        if (resumed) {
          return await finishComposerSavePipeline(
            userId,
            input,
            options,
            resumed,
            idempotency,
            processLockKey,
            completedSteps,
            pdfFailed,
            failedSecondarySteps
          );
        }
      }
    }

    logLifecyclePhase("repository_create_start", {
      phase: "remote_write",
      recordKind: "business_entry",
      userId,
      clientRecordId: input.clientRecordId,
    });

    const draftForNotify: BusinessEntry = {
      id: "",
      userId,
      ueid: input.ueid,
      entryType: input.entryType,
      title: input.title,
      entryDate: input.entryDate,
      notes: input.notes ?? null,
      reminder: input.reminder ?? null,
      location: input.location ?? null,
      attachments: input.attachments ?? [],
      payload: input.payload,
      source: input.source ?? "composer",
      status: input.status ?? "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
      pdfUri: null,
      documentHistory: {
        firstGeneratedAt: null,
        lastGeneratedAt: null,
        lastEditedAt: null,
        versionNumber: 1,
        editHistory: [],
        pdfGenerationHistory: [],
      },
    };

    let entry = await createEntryWithReminder(userId, input, {
      title: options.labels.reminderNotificationTitle.replace("{{title}}", input.title),
      body: entryListSummary(draftForNotify, options.t),
    });

    logLifecyclePhase("repository_create_done", {
      phase: "remote_write",
      recordKind: "business_entry",
      userId,
      remoteId: entry.id,
      clientRecordId: input.clientRecordId,
    });

    if (input.clientRecordId) {
      await attachRecordIdToPersistentLock(userId, input.clientRecordId, entry.id);
    }

    if (!hasCompletedStep(completedSteps, SAVE_STEP.BASE_RECORD_CREATED)) {
      const base = await runRecordStepIfNeeded(
        {
          userId,
          recordKind: "business_entry",
          recordId: entry.id,
          step: SAVE_STEP.BASE_RECORD_CREATED,
          completedSteps,
          clientRecordId: input.clientRecordId,
          alwaysRun: true,
        },
        async () => entry
      );
      completedSteps = base.completedSteps;
    }

    return await finishComposerSavePipeline(
      userId,
      input,
      options,
      entry,
      idempotency,
      processLockKey,
      completedSteps,
      pdfFailed,
      failedSecondarySteps
    );
  } catch (e) {
    if (e instanceof SaveStillInProgressError) throw e;
    logLifecyclePhase(e instanceof Error ? e.message : "composer_save_failed", {
      phase: "error",
      recordKind: "business_entry",
      userId,
      clientRecordId: input.clientRecordId,
    });
    if (idempotency) {
      await failCoordinatedSave(idempotency, "composer_save_failed", {
        processLockKey: processLockKey ?? undefined,
        clearRegistry: false,
      });
    } else if (processLockKey) {
      releaseProcessSaveLock(processLockKey);
    }
    throw e;
  }
}

async function finishComposerSavePipeline(
  userId: string,
  input: CreateBusinessEntryInput,
  options: SaveComposerEntryOptions,
  entry: BusinessEntry,
  idempotency: SaveIdempotencyContext | undefined,
  processLockKey: string | null,
  completedSteps: string[],
  pdfFailed: boolean,
  failedSecondarySteps: string[]
): Promise<SaveComposerEntryResult> {
  let withPdf = entry;
  const needsPdf =
    shouldRunStep(completedSteps, SAVE_STEP.PDF_GENERATED, { pdfUri: entry.pdfUri }) ||
    shouldRunStep(completedSteps, SAVE_STEP.PDF_URI_SAVED, { pdfUri: entry.pdfUri });

  if (needsPdf) {
    logLifecyclePhase("pdf_start", {
      phase: "pdf_start",
      recordKind: "business_entry",
      userId,
      remoteId: entry.id,
    });
    try {
      const branding = await getUserPdfBranding(options.user, { t: options.t });
      const uiLang = options.uiLang ?? "en";
      let extraCss = "";
      if (uiLang === "gu") {
        const fontFace = await gujaratiPdfFontFaceCss();
        extraCss = `${fontFace}${gujaratiPdfBodyFontCss()}`;
      }
      const html = buildBusinessEntryPdfHtml({
        entry,
        user: options.user,
        branding,
        labels: {
          ...businessEntryPdfLabels(options.t, branding.legal, uiLang),
          profileTitle: options.labels.pdfProfileTitle,
          ueid: options.labels.pdfUeid,
          userName: options.labels.pdfUserName,
          business: options.labels.pdfBusiness,
          entryDate: options.labels.pdfEntryDate,
          notes: options.labels.pdfNotes,
          reminder: options.labels.pdfReminder,
          detailsSection: options.labels.pdfDetailsSection,
          historySectionTitle: options.labels.pdfHistorySectionTitle,
          historyFirstGenerated: options.labels.pdfHistoryFirstGenerated,
          historyLastEdited: options.labels.pdfHistoryLastEdited,
          historyVersion: options.labels.pdfHistoryVersion,
          historyChanges: options.labels.pdfHistoryChanges,
        },
        extraCss,
      });
      const fileNameHint = options.labels.fileNameHint.replace(
        "{{date}}",
        dayKey(entry.entryDate)
      );
      const pdfStep = await runRecordStepIfNeeded(
        {
          userId,
          recordKind: "business_entry",
          recordId: entry.id,
          step: SAVE_STEP.PDF_GENERATED,
          completedSteps,
          clientRecordId: input.clientRecordId,
        },
        () => pdfService.generate({ html, fileNameHint })
      );
      completedSteps = pdfStep.completedSteps;
      if (pdfStep.ran && pdfStep.result) {
        const uriStep = await runRecordStepIfNeeded(
          {
            userId,
            recordKind: "business_entry",
            recordId: entry.id,
            step: SAVE_STEP.PDF_URI_SAVED,
            completedSteps,
            clientRecordId: input.clientRecordId,
          },
          async () =>
            updateEntryLocalFirst(userId, { id: entry.id, pdfUri: pdfStep.result!.uri })
        );
        withPdf = uriStep.result ?? entry;
        completedSteps = uriStep.completedSteps;
        void syncEngine.cacheEntry(withPdf);
      }
      logLifecyclePhase("pdf_done", {
        phase: "pdf_done",
        recordKind: "business_entry",
        userId,
        remoteId: withPdf.id,
      });
    } catch {
      pdfFailed = true;
      logLifecyclePhase("pdf_generation_failed", {
        phase: "error",
        recordKind: "business_entry",
        userId,
        remoteId: entry.id,
      });
    }
  }

  const insightCtx = {
    recordKind: "business_entry" as const,
    userId,
    remoteId: withPdf.id,
    clientRecordId: input.clientRecordId,
  };

  const insightsResult = await runBestEffortSecondary(
    "insight_index",
    insightCtx,
    async () => {
      const step = await runRecordStepIfNeeded(
        {
          userId,
          recordKind: "business_entry",
          recordId: withPdf.id,
          step: SAVE_STEP.INSIGHTS_INDEXED,
          completedSteps,
          clientRecordId: input.clientRecordId,
        },
        async () => syncInsightsFromBusinessEntry(userId, input.ueid, withPdf)
      );
      completedSteps = step.completedSteps;
    }
  );
  if (!insightsResult.ok) failedSecondarySteps.push("insight_index");

  const movementResult = await runBestEffortSecondary(
    "calendar_map_index",
    insightCtx,
    async () => {
      invalidateMasterInsightsCache();
    }
  );
  if (!movementResult.ok) failedSecondarySteps.push("calendar_map_index");

  const searchResult = await runBestEffortSecondary(
    "search_index",
    insightCtx,
    async () => {
      invalidateGlobalSearchIndex();
    }
  );
  if (!searchResult.ok) failedSecondarySteps.push("search_index");

  if (idempotency) {
    await completeCoordinatedSave(idempotency, withPdf.id, {
      processLockKey: processLockKey ?? undefined,
    });
  } else if (processLockKey) {
    releaseProcessSaveLock(processLockKey);
  }

  logLifecyclePhase("record_save_complete", {
    phase: "complete",
    recordKind: "business_entry",
    userId,
    remoteId: withPdf.id,
    clientRecordId: input.clientRecordId,
  });

  return { entry: withPdf, pdfFailed, failedSecondarySteps };
}
