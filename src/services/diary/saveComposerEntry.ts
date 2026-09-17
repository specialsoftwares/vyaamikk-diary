import type { BusinessEntry } from "@/domain/businessEntry";
import { AppError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";
import { buildPdfFileNameForBusinessEntry } from "@/services/pdf/pdfFileNames";
import { dayKey } from "@/utils/date";
import { entryListSummary } from "@/utils/businessEntry/display";

import { getDiaryRepository } from "./index";
import { syncEngine } from "@/sync/syncEngine";
import type { Lang } from "@/i18n/types";
import { pdfBrandingHook, pdfGenerateHook } from "@/services/pdf/pdfGenerateHook";
import type { CreateBusinessEntryInput } from "./types";
import { createEntryWithReminder } from "./saveWithReminder";
import { attachComposerPdfUri } from "./composerSaveSteps";
import { readLocalEntryRecordSync } from "@/repositories/localEntriesRepository";
import {
  beginCoordinatedSave,
  completeCoordinatedSave,
  failCoordinatedSave,
  retireOwnedReservation,
  runRecordStepIfNeeded,
  shouldRunStep,
  type ProcessSaveLockOwner,
} from "@/services/records/saveCoordinator";
import { attachRecordIdToPersistentLock } from "@/services/records/persistentSaveLock";
import {
  logLifecyclePhase,
  runBestEffortSecondary,
} from "@/services/records/saveLifecycleRunner";
import { SAVE_STEP, SaveRetryableError, SaveStillInProgressError, hasCompletedStep } from "@/services/records/saveLockTypes";
import type { SaveIdempotencyContext } from "@/services/records/saveIdempotency";
import { releaseProcessSaveLock } from "@/services/records/saveIdempotency";
import {
  captureAdmissionToken,
  mayIssueRemoteWork,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";

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
  cloudAccepted: boolean;
  syncFailureKind?: string;
}

export { composerSecondaryWriteReachedCloud, presentComposerWriteAcceptance } from "./composerSaveSteps";

let secondaryIndexHook: (() => Promise<void>) | null = null;

/** Node/CI seam. Production still runs insights/search after PDF. */
export function setComposerSecondaryIndexHookForTests(hook: (() => Promise<void>) | null): void {
  secondaryIndexHook = hook;
}

export function retainedComposerPdfUri(userId: string, entry: BusinessEntry): string | null {
  if (typeof entry.pdfUri === "string" && entry.pdfUri.trim()) return entry.pdfUri;
  const localUri = readLocalEntryRecordSync(userId, entry.id)?.entry.pdfUri;
  if (typeof localUri === "string" && localUri.trim()) return localUri;
  return null;
}

function withRetainedPdfUri(userId: string, entry: BusinessEntry): BusinessEntry {
  const uri = retainedComposerPdfUri(userId, entry);
  if (!uri || entry.pdfUri === uri) return entry;
  return { ...entry, pdfUri: uri };
}

async function loadComposerRecord(
  userId: string,
  recordId: string,
  session: SyncSessionToken | null
): Promise<BusinessEntry | null> {
  const local = readLocalEntryRecordSync(userId, recordId)?.entry ?? null;
  if (mayIssueRemoteWork(session, userId)) {
    const remote = await getDiaryRepository().getById(userId, recordId);
    if (!remote) return local;
    return withRetainedPdfUri(userId, remote);
  }
  return local ? withRetainedPdfUri(userId, local) : null;
}

export async function saveComposerEntry(
  userId: string,
  input: CreateBusinessEntryInput,
  options: SaveComposerEntryOptions
): Promise<SaveComposerEntryResult> {
  const session = captureAdmissionToken();
  const processLockKey = options.idempotency?.idempotencyKey ?? input.clientRecordId ?? null;
  let processLockOwner: ProcessSaveLockOwner | null = null;
  let lockLeaseStartedAt: number | null = null;
  let idempotency = options.idempotency;
  let completedSteps: string[] = [];
  let pdfFailed = false;
  const failedSecondarySteps: string[] = [];

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
        session,
      });
      idempotency = begun.idempotency;
      input.clientRecordId = begun.clientRecordId;
      completedSteps = begun.decision.completedSteps;
      processLockOwner = begun.processLockOwner;
      lockLeaseStartedAt = begun.lockLeaseStartedAt;

      if (begun.decision.action === "return_done") {
        const existing = await loadComposerRecord(userId, begun.decision.recordId, session);
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
        return await finishComposerSavePipeline(
          userId,
          input,
          options,
          existing,
          idempotency,
          null,
          null,
          null,
          completedSteps,
          pdfFailed,
          failedSecondarySteps,
          true,
          session
        );
      }

      if (begun.decision.action === "resume" && begun.decision.recordId) {
        const resumed = await loadComposerRecord(userId, begun.decision.recordId, session);
        if (resumed) {
          return await finishComposerSavePipeline(
            userId,
            input,
            options,
            resumed,
            idempotency,
            processLockKey,
            processLockOwner,
            lockLeaseStartedAt,
            completedSteps,
            pdfFailed,
            failedSecondarySteps,
            true,
            session
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

    const created = await createEntryWithReminder(
      userId,
      input,
      {
        title: options.labels.reminderNotificationTitle.replace("{{title}}", input.title),
        body: entryListSummary(draftForNotify, options.t),
      },
      { session }
    );
    const entry = created.entry;
    const cloudAccepted = created.remoteAccepted;
    if (cloudAccepted && created.reminderRemoteAccepted === false) {
      failedSecondarySteps.push("reminder_attached");
    }

    logLifecyclePhase("repository_create_done", {
      phase: cloudAccepted ? "remote_write" : "local_write",
      recordKind: "business_entry",
      userId,
      remoteId: entry.id,
      clientRecordId: input.clientRecordId,
    });

    if (input.clientRecordId && mayIssueRemoteWork(session, userId)) {
      await attachRecordIdToPersistentLock(
        userId,
        input.clientRecordId,
        entry.id,
        lockLeaseStartedAt ?? undefined
      );
    }

    if (
      cloudAccepted &&
      !hasCompletedStep(completedSteps, SAVE_STEP.BASE_RECORD_CREATED)
    ) {
      const base = await runRecordStepIfNeeded(
        {
          userId,
          recordKind: "business_entry",
          recordId: entry.id,
          step: SAVE_STEP.BASE_RECORD_CREATED,
          completedSteps,
          clientRecordId: input.clientRecordId,
          lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
          session,
          alwaysRun: true,
        },
        async () => entry
      );
      completedSteps = base.completedSteps;
    }

    if (!cloudAccepted && idempotency) {
      await failCoordinatedSave(idempotency, created.failureKind ?? "save_failed", {
        processLockKey: processLockKey ?? undefined,
        processLockOwner: processLockOwner ?? undefined,
        lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
        session,
        clearRegistry: false,
      });
    }

    const finished = await finishComposerSavePipeline(
      userId,
      input,
      options,
      entry,
      cloudAccepted ? idempotency : undefined,
      cloudAccepted ? processLockKey : null,
      cloudAccepted ? processLockOwner : null,
      cloudAccepted ? lockLeaseStartedAt : null,
      completedSteps,
      pdfFailed,
      failedSecondarySteps,
      cloudAccepted,
      session
    );
    return {
      ...finished,
      cloudAccepted,
      syncFailureKind: created.failureKind,
    };
  } catch (e) {
    if (e instanceof SaveStillInProgressError) throw e;
    if (e instanceof SaveRetryableError && e.failureCode === "session_retired") throw e;
    logLifecyclePhase(e instanceof Error ? e.message : "composer_save_failed", {
      phase: "error",
      recordKind: "business_entry",
      userId,
      clientRecordId: input.clientRecordId,
    });
    if (idempotency) {
      await failCoordinatedSave(idempotency, "composer_save_failed", {
        processLockKey: processLockKey ?? undefined,
        processLockOwner: processLockOwner ?? undefined,
        lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
        session,
        clearRegistry: false,
      });
    } else if (processLockKey) {
      releaseProcessSaveLock(processLockKey, processLockOwner ?? undefined);
    }
    throw e;
  }
}

async function generateComposerPdfFile(
  entry: BusinessEntry,
  options: SaveComposerEntryOptions
): Promise<{ uri: string; fileName: string }> {
  const fileNameHint = options.labels.fileNameHint.replace("{{date}}", dayKey(entry.entryDate));
  const fileName = buildPdfFileNameForBusinessEntry(entry, {
    businessName: options.user.businessName,
    date: dayKey(entry.entryDate),
  });
  const hookedGenerate = pdfGenerateHook();
  if (hookedGenerate) {
    return hookedGenerate({ html: "", fileNameHint, fileName });
  }

  const hookedBranding = pdfBrandingHook();
  const branding = hookedBranding
    ? await hookedBranding(options.user)
    : await (await import("@/services/pdf/userPdfBranding")).getUserPdfBranding(options.user, {
        t: options.t,
      });
  const uiLang = options.uiLang ?? "en";
  let extraCss = "";
  if (uiLang === "gu") {
    const { gujaratiPdfFontFaceCss, gujaratiPdfBodyFontCss } = await import(
      "@/services/pdf/pdfGujaratiFont"
    );
    const fontFace = await gujaratiPdfFontFaceCss();
    extraCss = `${fontFace}${gujaratiPdfBodyFontCss()}`;
  }
  const { buildBusinessEntryPdfHtml, businessEntryPdfLabels } = await import(
    "@/services/pdf/businessEntryPdfTemplate"
  );
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
  const { pdfService } = await import("@/services/pdf/pdfService");
  return pdfService.generate({ html, fileNameHint, fileName });
}

async function finishComposerSavePipeline(
  userId: string,
  input: CreateBusinessEntryInput,
  options: SaveComposerEntryOptions,
  entry: BusinessEntry,
  idempotency: SaveIdempotencyContext | undefined,
  processLockKey: string | null,
  processLockOwner: ProcessSaveLockOwner | null,
  lockLeaseStartedAt: number | null,
  completedSteps: string[],
  pdfFailed: boolean,
  failedSecondarySteps: string[],
  cloudAccepted = true,
  session: SyncSessionToken | null = null
): Promise<SaveComposerEntryResult> {
  let withPdf = withRetainedPdfUri(userId, entry);
  const retainedUri = retainedComposerPdfUri(userId, withPdf);
  const uriStillNeeded = shouldRunStep(completedSteps, SAVE_STEP.PDF_URI_SAVED, {
    pdfUri: retainedUri,
  });
  const generateNeeded =
    shouldRunStep(completedSteps, SAVE_STEP.PDF_GENERATED, { pdfUri: retainedUri }) ||
    (uriStillNeeded && !retainedUri);

  if (generateNeeded || uriStillNeeded) {
    logLifecyclePhase("pdf_start", {
      phase: "pdf_start",
      recordKind: "business_entry",
      userId,
      remoteId: entry.id,
    });
    try {
      let generatedUri = retainedUri;
      if (generateNeeded) {
        const alreadyGenerated = hasCompletedStep(completedSteps, SAVE_STEP.PDF_GENERATED);
        const pdfStep = await runRecordStepIfNeeded(
          {
            userId,
            recordKind: "business_entry",
            recordId: entry.id,
            step: SAVE_STEP.PDF_GENERATED,
            completedSteps,
            clientRecordId: input.clientRecordId,
            lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
            session,
            alwaysRun: alreadyGenerated,
            issuesRemoteWork: false,
          },
          () => generateComposerPdfFile(withPdf, options)
        );
        completedSteps = pdfStep.completedSteps;
        generatedUri =
          (pdfStep.ran && pdfStep.result?.uri) || generatedUri || retainedComposerPdfUri(userId, withPdf);
      }
      if (
        generatedUri &&
        shouldRunStep(completedSteps, SAVE_STEP.PDF_URI_SAVED, { pdfUri: generatedUri })
      ) {
        const attached = await attachComposerPdfUri({
          userId,
          entryId: entry.id,
          pdfUri: generatedUri,
          completedSteps,
          clientRecordId: input.clientRecordId,
          lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
          session,
        });
        withPdf = attached.entry;
        completedSteps = attached.completedSteps;
        if (attached.remoteAccepted) {
          void syncEngine.cacheEntry(withPdf);
        } else {
          failedSecondarySteps.push("pdf_uri_saved");
        }
      } else if (uriStillNeeded && !generatedUri) {
        failedSecondarySteps.push("pdf_uri_saved");
      }
      logLifecyclePhase("pdf_done", {
        phase: "pdf_done",
        recordKind: "business_entry",
        userId,
        remoteId: withPdf.id,
      });
    } catch {
      pdfFailed = true;
      if (uriStillNeeded) failedSecondarySteps.push("pdf_uri_saved");
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

  if (secondaryIndexHook) {
    await secondaryIndexHook();
  } else if (mayIssueRemoteWork(session, userId)) {
    const insightsResult = await runBestEffortSecondary("insight_index", insightCtx, async () => {
      const step = await runRecordStepIfNeeded(
        {
          userId,
          recordKind: "business_entry",
          recordId: withPdf.id,
          step: SAVE_STEP.INSIGHTS_INDEXED,
          completedSteps,
          clientRecordId: input.clientRecordId,
          lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
          session,
        },
        async () => {
          const { syncInsightsFromBusinessEntry } = await import("@/services/insights/insightSync");
          return syncInsightsFromBusinessEntry(userId, input.ueid, withPdf);
        }
      );
      completedSteps = step.completedSteps;
    });
    if (!insightsResult.ok) failedSecondarySteps.push("insight_index");

    const movementResult = await runBestEffortSecondary("calendar_map_index", insightCtx, async () => {
      const { invalidateMasterInsightsCache } = await import(
        "@/services/insights/masterInsightsSummary"
      );
      invalidateMasterInsightsCache();
    });
    if (!movementResult.ok) failedSecondarySteps.push("calendar_map_index");

    const searchResult = await runBestEffortSecondary("search_index", insightCtx, async () => {
      const { invalidateGlobalSearchIndex } = await import("@/services/search/globalSearchRepository");
      invalidateGlobalSearchIndex();
    });
    if (!searchResult.ok) failedSecondarySteps.push("search_index");
  }

  if (cloudAccepted && mayIssueRemoteWork(session, userId)) {
    if (idempotency) {
      await completeCoordinatedSave(idempotency, withPdf.id, {
        processLockKey: processLockKey ?? undefined,
        processLockOwner: processLockOwner ?? undefined,
        lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
        session,
      });
    } else if (processLockKey) {
      releaseProcessSaveLock(processLockKey, processLockOwner ?? undefined);
    }
  } else if (cloudAccepted && processLockKey) {
    await retireOwnedReservation({
      userId,
      clientRecordId: input.clientRecordId,
      processLockKey,
      processLockOwner: processLockOwner ?? undefined,
      lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
    });
  }

  logLifecyclePhase(cloudAccepted ? "record_save_complete" : "record_save_local_only", {
    phase: cloudAccepted ? "complete" : "local_write",
    recordKind: "business_entry",
    userId,
    remoteId: withPdf.id,
    clientRecordId: input.clientRecordId,
  });

  return { entry: withPdf, pdfFailed, failedSecondarySteps, cloudAccepted };
}
