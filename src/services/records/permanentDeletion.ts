import { getActiveBackend } from "@/config/env";
import { toAppError } from "@/domain/errors";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import type { PurchaseOrder } from "@/domain/purchaseOrder";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import { syncQueueRepository } from "@/repositories/syncQueueRepository";
import { removeCustomerPhotoFile } from "@/services/customerCredit/customerPhotoService";
import { getCustomerCreditRepository } from "@/services/customerCredit";
import { getDiaryRepository } from "@/services/diary";
import {
  removeInsightsForCustomerCredit,
  removeInsightsForDiaryEntry,
  removeInsightsForPurchaseOrder,
} from "@/services/insights/insightSync";
import { getLetterheadDocumentRepository } from "@/services/letterhead";
import type { LetterheadDocument } from "@/services/letterhead/types";
import {
  pruneMasterDataForCustomerCredit,
  pruneMasterDataForDiaryEntry,
  pruneMasterDataForProfessionalPack,
  pruneMasterDataForPurchaseOrder,
} from "@/services/masterData/masterDataCleanup";
import { getProfessionalPackRepository } from "@/services/professionalPack";
import { getPurchaseOrderRepository } from "@/services/purchaseOrder";
import {
  invalidateGlobalSearchIndex,
  notifySearchIndexChanged,
} from "@/services/search";
import { syncEngine } from "@/sync/syncEngine";

import {
  deleteAppControlledFile,
  deleteAttachmentFiles,
  deleteGeneratedPdfUri,
} from "./deletionFiles";
import type {
  PermanentDeleteEntityType,
  PermanentDeleteRequest,
  PermanentDeleteResult,
} from "./permanentDeletionTypes";

export type { PermanentDeleteEntityType, PermanentDeleteRequest, PermanentDeleteResult };

function usesFirebaseBackend(): boolean {
  const backend = getActiveBackend();
  return backend === "firebase-production" || backend === "firebase-shared-dev";
}

function isOfflineError(error: unknown): boolean {
  const err = toAppError(error);
  const msg = err.message ?? "";
  return /network|offline|fetch|timeout|failed to get|unavailable/i.test(msg);
}

function scopeFor(userId: string, ueid: string) {
  return { userId, ueid };
}

export async function deleteGeneratedFilesForRecord(input: {
  pdfUri?: string | null;
  attachments?: BusinessEntry["attachments"];
  customerPhoto?: CustomerCreditRecord["customerPhoto"];
}): Promise<void> {
  await deleteGeneratedPdfUri(input.pdfUri);
  await deleteAttachmentFiles(input.attachments);
  await removeCustomerPhotoFile(input.customerPhoto);
}

export async function deleteSearchEntriesForRecord(): Promise<void> {
  notifySearchIndexChanged();
  invalidateGlobalSearchIndex();
}

export async function deleteInsightsForRecord(
  userId: string,
  entityType: PermanentDeleteRequest["entityType"],
  recordId: string
): Promise<void> {
  switch (entityType) {
    case "diary_entry":
      await removeInsightsForDiaryEntry(userId, recordId);
      break;
    case "purchase_order":
      await removeInsightsForPurchaseOrder(userId, recordId);
      break;
    case "customer_credit":
      await removeInsightsForCustomerCredit(userId, recordId);
      break;
    default:
      break;
  }
}

async function clearSyncQueueForEntity(userId: string, entityId: string): Promise<void> {
  const queue = await syncQueueRepository.listForUser(userId);
  for (const item of queue) {
    if (item.entity === "entry" && item.entityId === entityId) {
      await syncQueueRepository.remove(item.id);
    }
  }
}

async function fetchDiaryEntrySnapshot(
  userId: string,
  entryId: string
): Promise<BusinessEntry | null> {
  const local = await localEntriesRepository.getById(userId, entryId);
  if (local) return local;
  const repo = getDiaryRepository();
  const found = await repo.getById(userId, entryId);
  if (found) return found;
  return repo.getByIdIncludingDeleted?.(userId, entryId) ?? null;
}

async function deleteDiaryEntryPermanently(
  req: PermanentDeleteRequest
): Promise<PermanentDeleteResult> {
  const { userId, recordId: entryId, ueid } = req;
  const entry = await fetchDiaryEntrySnapshot(userId, entryId);

  if (entry) {
    await deleteGeneratedFilesForRecord({
      pdfUri: entry.pdfUri,
      attachments: entry.attachments,
    });
    await pruneMasterDataForDiaryEntry(scopeFor(userId, ueid), entry);
  }

  await deleteInsightsForRecord(userId, "diary_entry", entryId);
  await clearSyncQueueForEntity(userId, entryId);
  await localEntriesRepository.removeById(userId, entryId);

  const repo = getDiaryRepository();
  const isLocalOnly = entryId.startsWith("local_");
  let syncPending = false;

  if (!isLocalOnly) {
    try {
      await repo.hardDelete(userId, entryId);
    } catch (e) {
      if (usesFirebaseBackend() && isOfflineError(e)) {
        await syncQueueRepository.enqueue({
          userId,
          op: "delete",
          entity: "entry",
          entityId: entryId,
          payload: { id: entryId },
        });
        void syncEngine.flush(userId);
        syncPending = true;
      } else {
        throw e;
      }
    }
  }

  await deleteSearchEntriesForRecord();
  return { syncPending };
}

async function deleteDraftPermanently(req: PermanentDeleteRequest): Promise<PermanentDeleteResult> {
  await formDraftsRepository.discardDraft(req.userId, req.recordId);
  await deleteSearchEntriesForRecord();
  return { syncPending: false };
}

async function deleteLetterheadDocumentPermanently(
  req: PermanentDeleteRequest
): Promise<PermanentDeleteResult> {
  const doc = await getLetterheadDocumentRepository().get(req.userId, req.recordId);
  if (doc) {
    await deleteGeneratedFilesForRecord({ pdfUri: doc.pdfUri });
  }
  await getLetterheadDocumentRepository().remove(req.userId, req.recordId);
  await deleteSearchEntriesForRecord();
  return { syncPending: usesFirebaseBackend() };
}

async function deleteProfessionalPackPermanently(
  req: PermanentDeleteRequest
): Promise<PermanentDeleteResult> {
  const pack = await getProfessionalPackRepository().getById(req.userId, req.recordId);
  const packSnapshot =
    pack ??
    (await getProfessionalPackRepository().getByIdIncludingDeleted?.(req.userId, req.recordId) ??
      null);

  if (packSnapshot) {
    await deleteGeneratedFilesForRecord({
      pdfUri: packSnapshot.pdfUri,
      attachments: packSnapshot.attachments,
    });
    await pruneMasterDataForProfessionalPack(scopeFor(req.userId, req.ueid), packSnapshot);
  }

  await getProfessionalPackRepository().hardDelete(req.userId, req.recordId);
  await deleteSearchEntriesForRecord();
  return { syncPending: usesFirebaseBackend() };
}

async function deletePurchaseOrderPermanently(
  req: PermanentDeleteRequest
): Promise<PermanentDeleteResult> {
  const po = await getPurchaseOrderRepository().getById(req.userId, req.recordId);
  if (po) {
    await deleteGeneratedFilesForRecord({ pdfUri: po.pdfUri });
    await pruneMasterDataForPurchaseOrder(scopeFor(req.userId, req.ueid), po);
  }

  await deleteInsightsForRecord(req.userId, "purchase_order", req.recordId);
  await getPurchaseOrderRepository().remove(req.userId, req.recordId);
  await deleteSearchEntriesForRecord();
  return { syncPending: usesFirebaseBackend() };
}

async function deleteCustomerCreditPermanently(
  req: PermanentDeleteRequest
): Promise<PermanentDeleteResult> {
  const rec = await getCustomerCreditRepository().getById(req.userId, req.recordId);
  if (rec) {
    await deleteGeneratedFilesForRecord({
      pdfUri: rec.pdfUri,
      customerPhoto: rec.customerPhoto,
    });
    await pruneMasterDataForCustomerCredit(scopeFor(req.userId, req.ueid), rec);
  }

  await deleteInsightsForRecord(req.userId, "customer_credit", req.recordId);
  await getCustomerCreditRepository().remove(req.userId, req.recordId);
  await deleteSearchEntriesForRecord();
  return { syncPending: usesFirebaseBackend() };
}

/**
 * Permanently removes a user record from app-controlled storage (local DB, files,
 * search, insights, master-data orphans) and hard-deletes the remote document when synced.
 *
 * Offline policy (Option B): local payload and files are removed immediately; a minimal
 * `{ id }` delete is queued for Firestore and flushed when online.
 */
export async function deleteRecordPermanently(
  request: PermanentDeleteRequest
): Promise<PermanentDeleteResult> {
  switch (request.entityType) {
    case "diary_entry":
      return deleteDiaryEntryPermanently(request);
    case "form_draft":
      return deleteDraftPermanently(request);
    case "letterhead_document":
      return deleteLetterheadDocumentPermanently(request);
    case "professional_pack":
      return deleteProfessionalPackPermanently(request);
    case "purchase_order":
      return deletePurchaseOrderPermanently(request);
    case "customer_credit":
      return deleteCustomerCreditPermanently(request);
    default:
      throw new Error("Unsupported permanent delete entity");
  }
}

/** @deprecated Use deleteRecordPermanently */
export async function deleteUserContent(
  userId: string,
  request: {
    entityType: PermanentDeleteRequest["entityType"];
    recordId: string;
    ueid?: string;
  }
): Promise<PermanentDeleteResult> {
  return deleteRecordPermanently({
    entityType: request.entityType,
    recordId: request.recordId,
    userId,
    ueid: request.ueid ?? "",
  });
}

export async function deleteLocalRecordAndRelations(
  userId: string,
  entryId: string
): Promise<void> {
  await localEntriesRepository.removeById(userId, entryId);
  await clearSyncQueueForEntity(userId, entryId);
}

export async function deleteMovementRowsForRecord(
  userId: string,
  diaryEntryId: string
): Promise<void> {
  await removeInsightsForDiaryEntry(userId, diaryEntryId);
}

export async function deleteMasterDataIfOrphaned(
  scope: { userId: string; ueid: string },
  entry: BusinessEntry
): Promise<void> {
  await pruneMasterDataForDiaryEntry(scope, entry);
}

export async function deleteFirestoreRecordAndSubcollections(
  userId: string,
  entityType: PermanentDeleteRequest["entityType"],
  recordId: string
): Promise<void> {
  switch (entityType) {
    case "diary_entry":
      await getDiaryRepository().hardDelete(userId, recordId);
      break;
    case "professional_pack":
      await getProfessionalPackRepository().hardDelete(userId, recordId);
      break;
    case "letterhead_document":
      await getLetterheadDocumentRepository().remove(userId, recordId);
      break;
    case "purchase_order":
      await getPurchaseOrderRepository().remove(userId, recordId);
      break;
    case "customer_credit":
      await getCustomerCreditRepository().remove(userId, recordId);
      break;
    default:
      break;
  }
}

export async function deleteLetterheadFiles(doc: LetterheadDocument): Promise<void> {
  await deleteGeneratedPdfUri(doc.pdfUri);
}
