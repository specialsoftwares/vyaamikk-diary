import type { BusinessCashGivenPayload, BusinessEntry } from "@/domain/businessEntry";
import { sha256Hex } from "@/utils/sha256Hex";

import { CASH_VOUCHER_TEMPLATE_VERSION, type DocumentRevision } from "./preparedReceiptPhoto";
import { attachmentRevisionOf, cashPaidPhotoAttachment } from "./cashPaidPhotoRef";

export function documentRevisionKey(revision: DocumentRevision): string {
  return `${revision.templateVersion}|${revision.recordRevision}|${revision.attachmentRevision}`;
}

/** Stable voucher identity. Does not include pdfUri or updatedAt. */
export function documentRevisionForCashEntry(entry: BusinessEntry): DocumentRevision {
  const payload = entry.payload as BusinessCashGivenPayload;
  const attachment = cashPaidPhotoAttachment(entry.attachments);
  const storagePath = payload.photoAttachmentStoragePath?.trim() || "";
  const attachmentRevision = attachment
    ? attachmentRevisionOf(attachment)
    : storagePath
      ? `storage:${sha256Hex(storagePath)}`
      : "none";
  const recordRevision = sha256Hex(
    [
      entry.id,
      String(entry.entryDate),
      String(payload.amount ?? ""),
      payload.givenToName ?? "",
      payload.purpose ?? "",
      String(payload.paymentDate ?? ""),
      payload.cashPaidVoucherSerial ?? "",
    ].join("|")
  );
  return {
    recordRevision,
    attachmentRevision,
    templateVersion: CASH_VOUCHER_TEMPLATE_VERSION,
  };
}
