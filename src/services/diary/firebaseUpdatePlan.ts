import { AppError } from "@/domain/errors";
import type { BusinessEntry, LetterheadMatterPayload } from "@/domain/businessEntry";
import type { UpdateBusinessEntryInput } from "./types";
import { mergeBusinessEntryUpdate, mergeEntryPdfGeneration } from "./mergeEntryUpdate";
import { LETTERHEAD_MIRROR_PAYLOAD_KEYS } from "@/services/letterhead/letterheadMirrorPolicy";

export function reminderCancelIdAfterUpdate(
  existing: BusinessEntry,
  edit: UpdateBusinessEntryInput
): string | null {
  if (edit.reminder === undefined) return null;
  const wasScheduled = existing.reminder?.notificationId ?? null;
  const willBeDifferent =
    edit.reminder === null || edit.reminder.notificationId !== existing.reminder?.notificationId;
  if (wasScheduled && willBeDifferent) return wasScheduled;
  return null;
}

export function buildDiaryUpdateRecord(
  existing: BusinessEntry,
  edit: UpdateBusinessEntryInput
): BusinessEntry {
  const frozen = freezeLetterheadMirrorLinkage(existing, edit);
  let next = mergeBusinessEntryUpdate(existing, frozen);
  if (edit.pdfUri !== undefined && edit.pdfUri) {
    next = mergeEntryPdfGeneration(next, edit.pdfUri);
  }
  return next;
}

function denyMirrorConversion(): never {
  throw new AppError(
    "permission_denied",
    "Letterhead diary link cannot be changed.",
    undefined,
    { reason: "letterhead_mirror_conversion_denied" }
  );
}

function freezeLetterheadMirrorLinkage(
  existing: BusinessEntry,
  edit: UpdateBusinessEntryInput
): UpdateBusinessEntryInput {
  if (existing.entryType !== "letterhead_matter") return edit;
  if (existing.source !== "letterhead") return edit;
  if (edit.reminder && existing.reminder == null) denyMirrorConversion();
  if (typeof edit.notes === "string" && edit.notes.trim() && existing.notes == null) {
    denyMirrorConversion();
  }
  if (
    Array.isArray(edit.attachments) &&
    edit.attachments.length > (existing.attachments?.length ?? 0)
  ) {
    denyMirrorConversion();
  }
  if (edit.payload === undefined) return edit;
  const current = existing.payload as LetterheadMatterPayload;
  const next = edit.payload as LetterheadMatterPayload & Record<string, unknown>;
  if (next.letterheadDocumentId !== current.letterheadDocumentId) denyMirrorConversion();
  const extraKeys = Object.keys(next).filter(
    (key) =>
      !(key in (current as object)) &&
      !(LETTERHEAD_MIRROR_PAYLOAD_KEYS as readonly string[]).includes(key)
  );
  if (extraKeys.length > 0) denyMirrorConversion();
  return edit;
}

/**
 * Notification work runs after a successful commit. Failure here must not
 * report the already-committed record as an uncommitted save.
 */
export async function runAfterDiaryUpdateCommit(
  cancelId: string | null,
  cancelNotification: (id: string) => Promise<void>
): Promise<void> {
  if (!cancelId) return;
  try {
    await cancelNotification(cancelId);
  } catch {
    // Post-commit: the Firestore write already succeeded.
  }
}
