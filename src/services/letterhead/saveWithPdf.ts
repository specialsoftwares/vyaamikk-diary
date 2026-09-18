import { AppError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";
import type { EntryLocation } from "@/domain/businessEntry";
import { dayKey } from "@/utils/date";
import { autoEntryTitle } from "@/utils/businessEntry/display";
import { getDiaryRepository } from "@/services/diary";
import { getLetterheadDocumentRepository } from "@/services/letterhead/documentRepository";
import {
  isLegacyLetterheadMirrorForParent,
  letterheadMirrorRecordId,
} from "@/services/letterhead/letterheadMirrorPolicy";
import type {
  LetterheadConfig,
  LetterheadDocument,
  LetterheadDocumentCreateInput,
  LetterheadDocumentInput,
} from "@/services/letterhead/types";
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
  SAVE_STEP,
  SaveRetryableError,
  SaveStillInProgressError,
  hasCompletedStep,
  unionCompletedSteps,
} from "@/services/records/saveLockTypes";
import type { SaveIdempotencyContext } from "@/services/records/saveIdempotency";
import { pdfGenerateHook } from "@/services/pdf/pdfGenerateHook";
import { fetchRecordCompletedSteps } from "@/services/records/recordCompletedSteps";
import {
  captureAdmissionToken,
  mayIssueRemoteWork,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";

export interface SaveLetterheadCreateResult {
  doc: LetterheadDocument;
  pdfUri: string;
}

const retainedPdfUris = new Map<string, string>();

function retainKey(userId: string, id: string): string {
  return `${userId}\0${id}`;
}

export function retainedLetterheadPdfUri(
  userId: string,
  doc: { id: string; pdfUri?: string | null }
): string | null {
  if (typeof doc.pdfUri === "string" && doc.pdfUri.trim()) return doc.pdfUri.trim();
  const retained = retainedPdfUris.get(retainKey(userId, doc.id));
  return retained && retained.trim() ? retained : null;
}

function rememberLetterheadPdfUri(userId: string, id: string, uri: string): void {
  const trimmed = uri.trim();
  if (trimmed) retainedPdfUris.set(retainKey(userId, id), trimmed);
}

export function resetLetterheadPdfRetentionForTests(): void {
  retainedPdfUris.clear();
}

async function abandonIfRetired(params: {
  session: SyncSessionToken | null;
  userId: string;
  clientRecordId?: string;
  processLockKey?: string;
  processLockOwner?: ProcessSaveLockOwner | null;
  lockLeaseStartedAt?: number | null;
}): Promise<void> {
  if (mayIssueRemoteWork(params.session, params.userId)) return;
  await retireOwnedReservation({
    userId: params.userId,
    clientRecordId: params.lockLeaseStartedAt != null ? params.clientRecordId : undefined,
    processLockKey: params.processLockKey,
    processLockOwner: params.processLockOwner ?? undefined,
    lockLeaseStartedAt: params.lockLeaseStartedAt ?? undefined,
    session: params.session,
  });
  throw new SaveRetryableError("Save session is no longer current.", "session_retired");
}

export async function saveLetterheadCreateWithPdf(
  userId: string,
  params: {
    user: UserProfile;
    config: LetterheadConfig;
    docInput: LetterheadDocumentInput;
    title: string;
    createPayload: Omit<LetterheadDocumentCreateInput, "input" | "title" | "clientRecordId">;
    idempotency: SaveIdempotencyContext;
    locale: "en-IN" | "hi-IN";
    t: (key: string, vars?: Record<string, string | number>) => string;
    diaryClientId: string;
    route?: string;
  }
): Promise<SaveLetterheadCreateResult> {
  const session = captureAdmissionToken();
  const processLockKey = params.idempotency.idempotencyKey;
  let processLockOwner: ProcessSaveLockOwner | null = null;
  let lockLeaseStartedAt: number | null = null;
  let idempotency = params.idempotency;
  let completedSteps: string[] = [];

  const ownership = () => ({
    session,
    userId,
    clientRecordId: idempotency.clientRecordId,
    processLockKey,
    processLockOwner,
    lockLeaseStartedAt,
  });

  try {
    const begun = await beginCoordinatedSave(idempotency, {
      ueid: params.user.ueid,
      processLockKey,
      route: params.route,
      session,
    });
    idempotency = begun.idempotency;
    processLockOwner = begun.processLockOwner;
    lockLeaseStartedAt = begun.lockLeaseStartedAt;
    const clientRecordId = begun.clientRecordId;
    await abandonIfRetired(ownership());

    if (begun.decision.action === "return_done") {
      const existing = await getLetterheadDocumentRepository().get(
        userId,
        begun.decision.recordId
      );
      await abandonIfRetired(ownership());
      const readyUri = existing ? retainedLetterheadPdfUri(userId, existing) : null;
      if (existing && readyUri && hasCompletedStep(begun.decision.completedSteps, SAVE_STEP.DIARY_LINK_CREATED)) {
        return { doc: existing, pdfUri: readyUri };
      }
      if (existing) {
        completedSteps = begun.decision.completedSteps;
      }
    } else if (begun.decision.action === "resume" || begun.decision.action === "proceed") {
      completedSteps = begun.decision.completedSteps;
    }

    const repo = getLetterheadDocumentRepository();
    let doc: LetterheadDocument;
    const existingById = await repo.get(userId, clientRecordId);
    await abandonIfRetired(ownership());
    if (existingById) {
      const retained = retainedLetterheadPdfUri(userId, existingById);
      doc = retained && !existingById.pdfUri ? { ...existingById, pdfUri: retained } : existingById;
      const fetched = await fetchRecordCompletedSteps(userId, "letterhead_doc", existingById.id);
      await abandonIfRetired(ownership());
      completedSteps = unionCompletedSteps(
        completedSteps,
        fetched,
        existingById.completedSteps
      );
    } else {
      await abandonIfRetired(ownership());
      const createdAt = Date.now();
      doc = await repo.create(
        userId,
        {
          clientRecordId,
          title: params.title,
          input: params.docInput,
          ...params.createPayload,
          firstGeneratedAt: createdAt,
          lastEditedAt: null,
          version: 1,
          editHistory: [{ version: 1, at: createdAt, action: "created" }],
        },
        session
      );
      await abandonIfRetired(ownership());
      if (lockLeaseStartedAt != null) {
        await attachRecordIdToPersistentLock(
          userId,
          clientRecordId,
          doc.id,
          lockLeaseStartedAt,
          session
        );
        await abandonIfRetired(ownership());
      }
      if (!hasCompletedStep(completedSteps, SAVE_STEP.BASE_RECORD_CREATED)) {
        const base = await runRecordStepIfNeeded(
          {
            userId,
            recordKind: "letterhead_doc",
            recordId: doc.id,
            step: SAVE_STEP.BASE_RECORD_CREATED,
            completedSteps,
            clientRecordId,
            lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
            session,
            alwaysRun: true,
          },
          async () => doc
        );
        completedSteps = base.completedSteps;
        await abandonIfRetired(ownership());
      }
    }

    let pdfUri = retainedLetterheadPdfUri(userId, doc) ?? "";
    const uriStillNeeded = shouldRunStep(completedSteps, SAVE_STEP.PDF_URI_SAVED, {
      pdfUri,
    });
    const generateNeeded =
      !pdfUri &&
      (shouldRunStep(completedSteps, SAVE_STEP.PDF_GENERATED, { pdfUri }) || uriStillNeeded);

    if (generateNeeded || uriStillNeeded) {
      if (generateNeeded) {
        const hooked = pdfGenerateHook();
        let html = "";
        if (!hooked) {
          const { englishPdfT } = await import("@/i18n/englishPdfT");
          await abandonIfRetired(ownership());
          const { buildLetterheadHtml } = await import("@/services/pdf/letterheadPdfService");
          await abandonIfRetired(ownership());
          const built = await buildLetterheadHtml({
            config: params.config,
            doc: params.docInput,
            locale: params.locale,
            labels: {
              subject: englishPdfT()("letterhead.labels.subject"),
              date: englishPdfT()("letterhead.labels.date"),
              reference: englishPdfT()("letterhead.labels.reference"),
              to: englishPdfT()("letterhead.labels.to"),
            },
          });
          html = built.html;
        }
        const alreadyGenerated = hasCompletedStep(completedSteps, SAVE_STEP.PDF_GENERATED);
        const pdfStep = await runRecordStepIfNeeded(
          {
            userId,
            recordKind: "letterhead_doc",
            recordId: doc.id,
            step: SAVE_STEP.PDF_GENERATED,
            completedSteps,
            clientRecordId,
            lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
            session,
            alwaysRun: alreadyGenerated,
            issuesRemoteWork: false,
          },
          async () => {
            const generateInput = {
              html,
              fileNameHint: params.t("letterhead.fileNameHint", {
                date: dayKey(params.docInput.date),
              }),
              fileName: {
                documentType: "letterhead" as const,
                businessName: params.user.businessName ?? params.user.displayName ?? undefined,
                date: dayKey(params.docInput.date),
              },
            };
            if (hooked) return hooked(generateInput);
            const { pdfService } = await import("@/services/pdf/pdfService");
            return pdfService.generate(generateInput);
          }
        );
        completedSteps = pdfStep.completedSteps;
        const generatedUri =
          (pdfStep.ran && pdfStep.result?.uri) || retainedLetterheadPdfUri(userId, doc) || "";
        if (generatedUri) {
          rememberLetterheadPdfUri(userId, doc.id, generatedUri);
          pdfUri = generatedUri;
        }
      }

      await abandonIfRetired(ownership());
      pdfUri = pdfUri || retainedLetterheadPdfUri(userId, doc) || "";
      if (pdfUri && shouldRunStep(completedSteps, SAVE_STEP.PDF_URI_SAVED, { pdfUri })) {
        const uriStep = await runRecordStepIfNeeded(
          {
            userId,
            recordKind: "letterhead_doc",
            recordId: doc.id,
            step: SAVE_STEP.PDF_URI_SAVED,
            completedSteps,
            clientRecordId,
            lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
            session,
          },
          async () => {
            if (!mayIssueRemoteWork(session, userId)) {
              throw new SaveRetryableError("Save session is no longer current.", "session_retired");
            }
            doc = await repo.update(userId, doc.id, { pdfUri, saved: true }, session);
            return doc;
          }
        );
        doc = uriStep.result ?? doc;
        completedSteps = uriStep.completedSteps;
      }
    }

    await abandonIfRetired(ownership());
    pdfUri = pdfUri || retainedLetterheadPdfUri(userId, doc) || "";
    const pdfAccepted =
      Boolean(pdfUri) && hasCompletedStep(completedSteps, SAVE_STEP.PDF_URI_SAVED);
    if ((generateNeeded || uriStillNeeded) && !pdfAccepted) {
      await failCoordinatedSave(idempotency, "pdf_incomplete", {
        processLockKey,
        processLockOwner: processLockOwner ?? undefined,
        lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
        session,
        clearRegistry: false,
      });
      throw new AppError("save_failed", "Letterhead PDF was not saved.");
    }

    const diaryStep = await runRecordStepIfNeeded(
      {
        userId,
        recordKind: "letterhead_doc",
        recordId: doc.id,
        step: SAVE_STEP.DIARY_LINK_CREATED,
        completedSteps,
        clientRecordId,
        lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
        session,
      },
      async () => {
        if (!mayIssueRemoteWork(session, userId)) return;
        const placeLabel = params.docInput.place?.trim() || null;
        const manualLoc: EntryLocation | null = placeLabel
          ? { name: placeLabel, geo: null, gps: null }
          : null;
        let location: EntryLocation | null = manualLoc;
        try {
          const { resolveEntryLocationWithFootprint } = await import(
            "@/services/location/locationFootprintCapture"
          );
          if (!mayIssueRemoteWork(session, userId)) return;
          location = (await resolveEntryLocationWithFootprint(userId, manualLoc)).location;
        } catch {
          location = manualLoc;
        }
        if (!mayIssueRemoteWork(session, userId)) return;
        const reference = params.docInput.reference?.trim() || null;
        const diaryRepo = getDiaryRepository();
        const mirrorId = letterheadMirrorRecordId(doc.id);
        const existingMirror = await diaryRepo.getById(userId, mirrorId);
        if (!mayIssueRemoteWork(session, userId)) return;
        if (existingMirror && isLegacyLetterheadMirrorForParent(existingMirror, doc.id)) {
          return existingMirror;
        }
        if (params.diaryClientId && params.diaryClientId !== mirrorId) {
          const legacy = await diaryRepo.getById(userId, params.diaryClientId);
          if (!mayIssueRemoteWork(session, userId)) return;
          if (legacy && isLegacyLetterheadMirrorForParent(legacy, doc.id)) {
            return legacy;
          }
        }
        if (!mayIssueRemoteWork(session, userId)) return;
        await diaryRepo.create(
          userId,
          {
          clientRecordId: mirrorId,
          ueid: params.user.ueid,
          entryType: "letterhead_matter",
          title:
            params.docInput.title?.trim() ||
            params.docInput.subject?.trim() ||
            autoEntryTitle(
              "letterhead_matter",
              params.docInput.date,
              {
                letterheadDocumentId: doc.id,
                subject: params.docInput.subject?.trim() || null,
                reference,
                body: params.docInput.body.trim(),
                closing: params.docInput.closing?.trim() || null,
                signerName: params.docInput.name?.trim() || "",
                designation: params.docInput.designation?.trim() || null,
                place: params.docInput.place?.trim() || null,
              },
              params.t
            ),
          entryDate: params.docInput.date,
          notes: null,
          reminder: null,
          location,
          source: "letterhead",
          payload: {
            letterheadDocumentId: doc.id,
            subject: params.docInput.subject?.trim() || null,
            reference,
            body: params.docInput.body.trim(),
            closing: params.docInput.closing?.trim() || null,
            signerName: params.docInput.name?.trim() || "",
            designation: params.docInput.designation?.trim() || null,
            place: params.docInput.place?.trim() || null,
          },
          },
          session
        );
      }
    );
    completedSteps = diaryStep.completedSteps;
    await abandonIfRetired(ownership());

    if (!hasCompletedStep(completedSteps, SAVE_STEP.DIARY_LINK_CREATED)) {
      await failCoordinatedSave(idempotency, "diary_link_incomplete", {
        processLockKey,
        processLockOwner: processLockOwner ?? undefined,
        lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
        session,
        clearRegistry: false,
      });
      throw new AppError("save_failed", "Letterhead diary link was not created.");
    }

    await completeCoordinatedSave(idempotency, doc.id, {
      processLockKey,
      processLockOwner: processLockOwner ?? undefined,
      lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
      session,
    });
    await abandonIfRetired(ownership());
    return { doc, pdfUri: pdfUri || retainedLetterheadPdfUri(userId, doc) || "" };
  } catch (e) {
    if (e instanceof SaveStillInProgressError) throw e;
    if (e instanceof SaveRetryableError && e.failureCode === "session_retired") {
      await retireOwnedReservation({
        userId,
        clientRecordId: lockLeaseStartedAt != null ? idempotency.clientRecordId : undefined,
        processLockKey,
        processLockOwner: processLockOwner ?? undefined,
        lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
        session,
      });
      throw e;
    }
    await failCoordinatedSave(idempotency, "letterhead_save_failed", {
      processLockKey,
      processLockOwner: processLockOwner ?? undefined,
      lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
      session,
      clearRegistry: false,
    });
    throw e;
  }
}
