/**
 * Upload Cash Paid receipt photos to Firebase Storage (when configured).
 * Local file URI remains on AttachmentRef for offline preview; storagePath is canonical.
 */

import type { AttachmentRef, BusinessCashGivenPayload } from "@/domain/businessEntry";
import { getActiveBackend } from "@/config/env";
import {
  isUserStorageAvailable,
  uploadRecordAttachmentBase64,
} from "@/services/storage/userStorage";
import { createLogger } from "@/utils/logger";

import type { PickedCashPaidPhoto } from "./cashPaidPhotoService";
import { CASH_PAID_ATTACHMENT_ID } from "./cashPaidPhotoService";

const log = createLogger("cashPaid/photoStorage");

function isFirebaseBackend(): boolean {
  const backend = getActiveBackend();
  return backend === "firebase-production" || backend === "firebase-shared-dev";
}

export async function uploadCashPaidPhotoToStorage(input: {
  userId: string;
  recordId: string;
  picked: PickedCashPaidPhoto;
  localAttachment: AttachmentRef;
}): Promise<{
  attachment: AttachmentRef;
  payloadPatch: Pick<
    BusinessCashGivenPayload,
    "photoAttachmentStoragePath" | "photoAttachmentDownloadUrl" | "photoAttachmentCapturedAt"
  >;
}> {
  const capturedAt = Date.now();
  const fileName = `cash-paid-${input.recordId}-${capturedAt}.jpg`;

  if (!isFirebaseBackend() || !isUserStorageAvailable()) {
    return {
      attachment: input.localAttachment,
      payloadPatch: {
        photoAttachmentStoragePath: null,
        photoAttachmentDownloadUrl: null,
        photoAttachmentCapturedAt: capturedAt,
      },
    };
  }

  try {
    const uploaded = await uploadRecordAttachmentBase64(
      input.userId,
      input.recordId,
      input.picked.base64,
      input.picked.mimeType,
      fileName
    );

    return {
      attachment: {
        ...input.localAttachment,
        storagePath: uploaded.storagePath,
        downloadUrl: uploaded.downloadUrl,
        downloadUrlUpdatedAt: capturedAt,
      },
      payloadPatch: {
        photoAttachmentStoragePath: uploaded.storagePath,
        photoAttachmentDownloadUrl: uploaded.downloadUrl ?? null,
        photoAttachmentCapturedAt: capturedAt,
      },
    };
  } catch (e) {
    log.warn("cash paid photo upload failed", e);
    throw e;
  }
}

export function clearCashPaidPhotoStorageFields(): Pick<
  BusinessCashGivenPayload,
  "photoAttachmentStoragePath" | "photoAttachmentDownloadUrl" | "photoAttachmentCapturedAt"
> {
  return {
    photoAttachmentStoragePath: null,
    photoAttachmentDownloadUrl: null,
    photoAttachmentCapturedAt: null,
  };
}

export function isCashPaidAttachmentRef(ref: AttachmentRef): boolean {
  return ref.id === CASH_PAID_ATTACHMENT_ID;
}
