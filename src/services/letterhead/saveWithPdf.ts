import type { UserProfile } from "@/domain/types";
import { pdfService } from "@/services/pdf/pdfService";
import { englishPdfT } from "@/i18n/englishPdfT";
import { buildLetterheadHtml } from "@/services/pdf/letterheadPdfService";
import { dayKey } from "@/utils/date";
import { autoEntryTitle } from "@/utils/businessEntry/display";
import { getDiaryRepository } from "@/services/diary";
import { resolveEntryLocationWithFootprint } from "@/services/location/locationFootprintCapture";
import { getLetterheadDocumentRepository } from "@/services/letterhead";
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
  runRecordStepIfNeeded,
  shouldRunStep,
} from "@/services/records/saveCoordinator";
import { SAVE_STEP, SaveStillInProgressError, hasCompletedStep } from "@/services/records/saveLockTypes";
import type { SaveIdempotencyContext } from "@/services/records/saveIdempotency";
import { releaseProcessSaveLock } from "@/services/records/saveIdempotency";

export interface SaveLetterheadCreateResult {
  doc: LetterheadDocument;
  pdfUri: string;
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
  const processLockKey = params.idempotency.idempotencyKey;
  let idempotency = params.idempotency;
  let completedSteps: string[] = [];

  try {
    const begun = await beginCoordinatedSave(idempotency, {
      ueid: params.user.ueid,
      processLockKey,
      route: params.route,
    });
    idempotency = begun.idempotency;
    const clientRecordId = begun.clientRecordId;

    if (begun.decision.action === "return_done") {
      const existing = await getLetterheadDocumentRepository().get(
        userId,
        begun.decision.recordId
      );
      if (existing?.pdfUri) {
        return { doc: existing, pdfUri: existing.pdfUri };
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
    if (existingById) {
      doc = existingById;
      completedSteps = existingById.completedSteps ?? completedSteps;
    } else {
      const createdAt = Date.now();
      doc = await repo.create(userId, {
        clientRecordId,
        title: params.title,
        input: params.docInput,
        ...params.createPayload,
        firstGeneratedAt: createdAt,
        lastEditedAt: null,
        version: 1,
        editHistory: [{ version: 1, at: createdAt, action: "created" }],
      });
      if (!hasCompletedStep(completedSteps, SAVE_STEP.BASE_RECORD_CREATED)) {
        const base = await runRecordStepIfNeeded(
          {
            userId,
            recordKind: "letterhead_doc",
            recordId: doc.id,
            step: SAVE_STEP.BASE_RECORD_CREATED,
            completedSteps,
            clientRecordId,
            alwaysRun: true,
          },
          async () => doc
        );
        completedSteps = base.completedSteps;
      }
    }

    let pdfUri = doc.pdfUri ?? "";
    const needsPdf =
      shouldRunStep(completedSteps, SAVE_STEP.PDF_GENERATED, { pdfUri: doc.pdfUri }) ||
      shouldRunStep(completedSteps, SAVE_STEP.PDF_URI_SAVED, { pdfUri: doc.pdfUri });

    if (needsPdf) {
      const { html } = await buildLetterheadHtml({
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
      const pdfStep = await runRecordStepIfNeeded(
        {
          userId,
          recordKind: "letterhead_doc",
          recordId: doc.id,
          step: SAVE_STEP.PDF_GENERATED,
          completedSteps,
          clientRecordId,
        },
        () =>
          pdfService.generate({
            html,
            fileNameHint: params.t("letterhead.fileNameHint", {
              date: dayKey(params.docInput.date),
            }),
            fileName: {
              documentType: "letterhead",
              businessName: params.user.businessName ?? params.user.displayName ?? undefined,
              date: dayKey(params.docInput.date),
            },
          })
      );
      completedSteps = pdfStep.completedSteps;
      if (pdfStep.ran && pdfStep.result) {
        pdfUri = pdfStep.result.uri;
        const uriStep = await runRecordStepIfNeeded(
          {
            userId,
            recordKind: "letterhead_doc",
            recordId: doc.id,
            step: SAVE_STEP.PDF_URI_SAVED,
            completedSteps,
            clientRecordId,
          },
          async () => {
            doc = await repo.update(userId, doc.id, { pdfUri, saved: true });
            return doc;
          }
        );
        doc = uriStep.result ?? doc;
        completedSteps = uriStep.completedSteps;
      }
    }

    const senderName = params.docInput.name?.trim() || "";
    await runRecordStepIfNeeded(
      {
        userId,
        recordKind: "letterhead_doc",
        recordId: doc.id,
        step: SAVE_STEP.DIARY_LINK_CREATED,
        completedSteps,
        clientRecordId,
      },
      async () => {
        const placeLabel = params.docInput.place?.trim() || null;
        const manualLoc = placeLabel ? { name: placeLabel, geo: null, gps: null } : null;
        const { location } = await resolveEntryLocationWithFootprint(userId, manualLoc);
        const reference = params.docInput.reference?.trim() || null;
        await getDiaryRepository().create(userId, {
          clientRecordId: params.diaryClientId,
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
                signerName: senderName,
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
            signerName: senderName,
            designation: params.docInput.designation?.trim() || null,
            place: params.docInput.place?.trim() || null,
          },
        });
      }
    );

    await completeCoordinatedSave(idempotency, doc.id, { processLockKey });
    return { doc, pdfUri: pdfUri || doc.pdfUri || "" };
  } catch (e) {
    if (e instanceof SaveStillInProgressError) throw e;
    await failCoordinatedSave(idempotency, "letterhead_save_failed", {
      processLockKey,
      clearRegistry: false,
    });
    throw e;
  }
}
