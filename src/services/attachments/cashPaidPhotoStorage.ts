/**
 * Upload Cash Paid receipt photos to Firebase Storage (when configured).
 * Local file URI remains on AttachmentRef for offline preview; storagePath is canonical.
 */

import type { AttachmentRef, BusinessCashGivenPayload } from "@/domain/businessEntry";
import { getActiveBackend } from "@/config/env";
import {
  getUserStoragePath,
  isUserStorageAvailable,
  uploadLocalFileToPath,
} from "@/services/storage/userStorage";
import { captureAdmissionToken, mayIssueRemoteWork } from "@/sync/syncSessionOwnership";
import { createLogger } from "@/utils/logger";

import type { PickedCashPaidPhoto } from "./cashPaidPhotoRef";
import { CASH_PAID_ATTACHMENT_ID } from "./cashPaidPhotoRef";

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
  const ext = input.picked.mimeType === "image/png" ? "png" : "jpg";
  const fileName = `cash-paid-${input.recordId}-${capturedAt}.${ext}`;
  const session = captureAdmissionToken();

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

  if (!mayIssueRemoteWork(session, input.userId)) {
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
    const storagePath = getUserStoragePath(input.userId, "attachments", input.recordId, fileName);
    const uploaded = await uploadLocalFileToPath(
      storagePath,
      input.picked.uri,
      input.picked.mimeType,
      { userId: input.userId, session }
    );
    if (!mayIssueRemoteWork(session, input.userId)) {
      throw new Error("owner_changed");
    }

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
    log.warn("cash paid photo upload failed");
    if (e instanceof Error && e.message === "owner_changed") {
      throw e;
    }
    throw new Error("upload_failed");
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
