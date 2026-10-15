import type { AttachmentRef, BusinessCashGivenPayload, BusinessEntry } from "@/domain/businessEntry";

export const CASH_PAID_ATTACHMENT_ID = "cash_paid_receipt";

/** Picker result kept in React state. File URI only — never base64. */
export interface PickedCashPaidPhoto {
  uri: string;
  mimeType: "image/jpeg" | "image/png";
  byteSize: number;
  contentHash: string;
  width: number;
  height: number;
}

export type CashPaidPhotoFailureCode =
  | "permission"
  | "too_large"
  | "read_failed"
  | "unsupported"
  | "owner_changed";

export class CashPaidPhotoError extends Error {
  constructor(public readonly code: CashPaidPhotoFailureCode) {
    super(code);
    this.name = "CashPaidPhotoError";
  }
}

export function cashPaidPhotoAttachment(
  attachments: AttachmentRef[] | null | undefined
): AttachmentRef | null {
  return attachments?.find((a) => a.id === CASH_PAID_ATTACHMENT_ID) ?? null;
}

export function hasCashPhotoReference(entry: {
  attachments?: AttachmentRef[] | null;
  payload?: BusinessEntry["payload"] | BusinessCashGivenPayload | null;
}): boolean {
  if (cashPaidPhotoAttachment(entry.attachments)) return true;
  const payload = entry.payload as BusinessCashGivenPayload | null | undefined;
  if (payload?.photoAttachmentStoragePath?.trim()) return true;
  return false;
}

/** True when `uri` lives under this owner's receipt directories. */
export function isOwnerScopedPhotoUri(uid: string, uri: string): boolean {
  const owner = uid.trim();
  if (!owner || owner.includes("/") || owner.includes("..")) return false;
  const normalized = uri.replace(/\\/g, "/");
  if (normalized.includes("..")) return false;
  return (
    normalized.includes(`/cash-paid-photos/${owner}/`) ||
    normalized.includes(`/receipt-photo-cache/${owner}/`)
  );
}

export function attachmentRevisionOf(ref: AttachmentRef | null | undefined): string {
  if (!ref) return "none";
  if (ref.revision?.trim()) return ref.revision.trim();
  if (ref.contentHash?.trim()) return ref.contentHash.trim();
  if (ref.byteSize != null && ref.fileMtimeMs != null) {
    return `${ref.byteSize}:${ref.fileMtimeMs}`;
  }
  return "unversioned";
}
